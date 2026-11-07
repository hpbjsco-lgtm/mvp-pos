/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { ConflictStore } from './conflictStore.mjs';
import { NumberingService } from './numbering.mjs';
import { SyncApplier } from './syncApplier.mjs';
import { SyncError } from './syncError.mjs';
import { SYNCED_TABLES } from './syncTables.mjs';

export { SyncError };

/** Rows per page when the caller does not ask for a size, and the largest size it may ask for. */
export const DEFAULT_PULL_LIMIT = 500;
export const MAX_PULL_LIMIT = 1000;

/** Most groups a device may push in one request. */
export const MAX_PUSH_GROUPS = 500;

/**
 * Change log and change feed of the database, used by devices to download data.
 *
 * A trigger on every synced table writes one `sync_log` row for each insert, update and delete, whoever
 * made the change (the app, the admin page or a foreign key cascade). A device downloads in two phases:
 * a snapshot of all rows of its store, then the log entries written after the snapshot started.
 */
export class SyncService {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection.
   */
  constructor(getDatabase) {
    this.getDatabase = getDatabase;
    this.numbering = new NumberingService(getDatabase);
    this.applier = new SyncApplier(getDatabase, this.numbering);
    this.conflicts = new ConflictStore(getDatabase, this.applier);
  }

  /**
   * Makes sure the log table, the epoch and one set of triggers per synced table exist. Cheap when
   * everything is already there, so it runs at start-up and at every download.
   *
   * @throws {SyncError} `NOT_READY` when synced tables are missing (the app has not created its schema yet).
   */
  ensureInfrastructure() {
    const database = this.getDatabase();
    const existing = new Set(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
    );
    const missing = SYNCED_TABLES.filter(({ table }) => !existing.has(table)).map(({ table }) => table);
    if (missing.length > 0) {
      throw new SyncError('NOT_READY', `The database has no app schema yet (missing tables: ${missing.join(', ')}). Open the app once so it creates them.`, 409);
    }

    database.exec(`
      CREATE TABLE IF NOT EXISTS sync_log (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name  TEXT NOT NULL,
        row_id      TEXT NOT NULL,
        op          TEXT NOT NULL,
        store_id    TEXT NOT NULL DEFAULT '',
        changed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_log_store ON sync_log(store_id, seq);
      CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id              TEXT PRIMARY KEY,
        store_id        TEXT NOT NULL,
        table_name      TEXT NOT NULL,
        row_id          TEXT NOT NULL,
        device_id       TEXT NOT NULL DEFAULT '',
        base_rev        INTEGER,
        server_rev      INTEGER,
        device_payload  TEXT NOT NULL,
        server_payload  TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        resolution      TEXT,
        resolved_by     TEXT,
        resolved_at     TEXT,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_store ON sync_conflicts(store_id, status);
      CREATE TABLE IF NOT EXISTS sync_counters (
        store_id    TEXT NOT NULL,
        kind        TEXT NOT NULL,
        last_value  INTEGER NOT NULL,
        PRIMARY KEY (store_id, kind)
      );
    `);
    if (!database.prepare("SELECT 1 FROM sync_meta WHERE key = 'epoch'").get()) this.regenerateEpoch();

    const triggerCount = database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync\\_%' ESCAPE '\\'").get().total;
    if (triggerCount === SYNCED_TABLES.length * 3) return;
    for (const { table, primaryKey } of SYNCED_TABLES) this.installTriggers(table, primaryKey);
  }

  /**
   * Creates the insert, update and delete triggers of one table when they are missing.
   *
   * @param {string} table Table name.
   * @param {string} primaryKey Primary key column.
   * @throws {Error} When the table has no primary key column or no `store_id` column (except `stores`).
   */
  installTriggers(table, primaryKey) {
    const database = this.getDatabase();
    const columns = new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
    if (!columns.has(primaryKey)) throw new Error(`Table ${table} has no column ${primaryKey}.`);
    if (table !== 'stores' && !columns.has('store_id')) throw new Error(`Table ${table} has no store_id column, so its changes cannot be scoped to a store.`);

    const storeOf = (alias) => (table === 'stores' ? `${alias}.id` : `COALESCE(${alias}.store_id, '')`);
    const log = (alias, op) => `INSERT INTO sync_log (table_name, row_id, op, store_id) VALUES ('${table}', CAST(${alias}.${primaryKey} AS TEXT), '${op}', ${storeOf(alias)});`;
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS sync_${table}_ai AFTER INSERT ON ${table} BEGIN ${log('NEW', 'upsert')} END;
      CREATE TRIGGER IF NOT EXISTS sync_${table}_au AFTER UPDATE ON ${table} BEGIN ${log('NEW', 'upsert')} END;
      CREATE TRIGGER IF NOT EXISTS sync_${table}_ad AFTER DELETE ON ${table} BEGIN ${log('OLD', 'delete')} END;
    `);
  }

  /**
   * Starts a new epoch. Devices holding a cursor from the old epoch must download everything again;
   * call it after the database file was replaced by a restore.
   *
   * @returns {string} The new epoch.
   */
  regenerateEpoch() {
    const epoch = randomUUID();
    // A database restored from an old backup may not have the table yet.
    this.getDatabase().exec('CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.getDatabase().prepare("INSERT INTO sync_meta (key, value) VALUES ('epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(epoch);
    return epoch;
  }

  /**
   * Returns the next page of changes for a store.
   *
   * Without a cursor the first call starts a snapshot: every row of the store, table by table. When the
   * snapshot ends the cursor switches to the change log, starting at the log position noted when the
   * snapshot began, so changes made while it was running are delivered again afterwards (applying a row
   * twice is harmless). A device repeats the call with the returned cursor until `done` is true.
   *
   * @param {Object} request The request.
   * @param {string} request.storeId Store whose changes are wanted.
   * @param {string | null} [request.cursor] Cursor from the previous call; null or empty for the first call.
   * @param {number} [request.limit] Page size, 1 to `MAX_PULL_LIMIT`.
   * @returns {{ epoch: string, cursor: string, changes: Array<{ table: string, rowId: string, op: 'upsert' | 'delete', row?: object }>, done: boolean, pendingConflicts: number }}
   *   `changes` are in apply order; `done` is true when the device has caught up for now; `pendingConflicts` is
   *   the number of unresolved conflicts of the store, so a device can show a notice without another request.
   * @throws {SyncError} `NOT_READY`, `BAD_CURSOR`, `EPOCH_CHANGED`, `CURSOR_AHEAD`; status 400 for a bad store or limit.
   */
  pull({ storeId, cursor = null, limit = DEFAULT_PULL_LIMIT }) {
    if (!storeId || typeof storeId !== 'string') throw new SyncError('BAD_REQUEST', 'storeId is required.', 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PULL_LIMIT) {
      throw new SyncError('BAD_REQUEST', `limit must be a whole number from 1 to ${MAX_PULL_LIMIT}.`, 400);
    }
    this.ensureInfrastructure();
    const database = this.getDatabase();
    const epoch = database.prepare("SELECT value FROM sync_meta WHERE key = 'epoch'").get().value;

    let state = cursor ? this.decodeCursor(cursor, epoch) : null;
    if (!state) state = { phase: 'snapshot', seq: this.currentMaxSeq(), tableIndex: 0, afterKey: null };

    const changes = [];
    if (state.phase === 'snapshot') {
      state = this.readSnapshotPage(storeId, state, limit, changes);
    }
    let done = false;
    if (state.phase === 'log') {
      if (state.seq > this.currentMaxSeq()) {
        throw new SyncError('CURSOR_AHEAD', 'The cursor is newer than the server log; download everything again.', 409);
      }
      const read = this.readLogPage(storeId, state.seq, limit - changes.length, changes);
      state = { ...state, seq: read.seq };
      done = read.done;
    }
    return { epoch, cursor: this.encodeCursor(epoch, state), changes, done, pendingConflicts: this.conflicts.countPending(storeId) };
  }

  /**
   * Applies the groups a device pushed. Everything is written in one transaction: when any group is
   * invalid nothing is written. Groups that conflict are recorded and left out; the rest are applied.
   *
   * @param {Object} request The request.
   * @param {string} request.storeId Store the device pushes for.
   * @param {string} request.deviceId Identifier of the device.
   * @param {import('./syncApplier.mjs').Group[]} request.groups Groups to apply, in order.
   * @returns {{ applied: object[], unchanged: object[], conflicts: Array<{ conflictId: string, table: string, rowId: string }> }}
   *   `applied` and `unchanged` entries carry `rev`, the row version the device must remember as `baseRev`,
   *   and for numbered documents `number` (official) and `tempNumber`, which the device writes into its own copy.
   * @throws {SyncError} Status 400 for a missing store or device, too many groups, or an invalid group; `NOT_READY`.
   */
  push({ storeId, deviceId, groups }) {
    if (!storeId || typeof storeId !== 'string') throw new SyncError('BAD_REQUEST', 'storeId is required.', 400);
    if (!deviceId || typeof deviceId !== 'string') throw new SyncError('BAD_REQUEST', 'deviceId is required.', 400);
    if (!Array.isArray(groups)) throw new SyncError('BAD_REQUEST', 'groups must be a list.', 400);
    if (groups.length > MAX_PUSH_GROUPS) throw new SyncError('BAD_REQUEST', `Push at most ${MAX_PUSH_GROUPS} groups at a time.`, 400);
    this.ensureInfrastructure();

    return this.getDatabase().transaction(() => {
      const result = { applied: [], unchanged: [], conflicts: [] };
      for (const group of groups) {
        this.applier.validateGroup(storeId, group);
        const outcome = this.applier.applyGroup(group);
        const entry = { table: group.table, rowId: group.rowId };
        if (outcome.status === 'conflict') {
          const conflictId = this.conflicts.record({ storeId, deviceId, deviceGroup: group, serverGroup: outcome.serverGroup });
          result.conflicts.push({ conflictId, ...entry });
        } else {
          result[outcome.status].push({ ...entry, rev: outcome.rev, ...(outcome.numbering ?? {}) });
        }
      }
      return result;
    })();
  }

  /**
   * Tells a device which tables of its store changed after a log position, so it can reload only those.
   * It is cheap (one small query), so web pages call it every few seconds to see other devices' work.
   *
   * @param {Object} request The request.
   * @param {string} request.storeId Store to look at.
   * @param {number | null} [request.after] Log position the device already knows; null to ask for the current position.
   * @returns {{ seq: number, tables: string[], reset: boolean }} `seq` is the current log position, `tables` the tables
   *   with changes after `after`, and `reset` is true when `after` is ahead of the log (the database was restored), so the device must reload everything.
   * @throws {SyncError} Status 400 for a missing store or a bad `after`; `NOT_READY`.
   */
  summary({ storeId, after = null }) {
    if (!storeId || typeof storeId !== 'string') throw new SyncError('BAD_REQUEST', 'storeId is required.', 400);
    if (after !== null && (!Number.isInteger(after) || after < 0)) throw new SyncError('BAD_REQUEST', 'after must be a whole number of 0 or more.', 400);
    this.ensureInfrastructure();
    const seq = this.currentMaxSeq();
    if (after === null) return { seq, tables: [], reset: false };
    if (after > seq) return { seq, tables: [], reset: true };
    const tables = this.getDatabase()
      .prepare('SELECT DISTINCT table_name FROM sync_log WHERE seq > ? AND store_id = ? ORDER BY table_name')
      .all(after, storeId)
      .map((row) => row.table_name);
    return { seq, tables, reset: false };
  }

  /**
   * Hands out the next official document number of a kind for a store.
   *
   * @param {Object} request The request.
   * @param {string} request.storeId Store the number is for.
   * @param {string} request.kind `order`, `import`, `export`, `receipt` or `payment`.
   * @returns {{ number: string }} The number, for example `HD00012`.
   * @throws {SyncError} Status 400 for a bad kind or store, 404 for an unknown store, `NOT_READY`.
   */
  nextNumber({ storeId, kind }) {
    if (!storeId || typeof storeId !== 'string') throw new SyncError('BAD_REQUEST', 'storeId is required.', 400);
    this.ensureInfrastructure();
    return { number: this.numbering.next(storeId, kind) };
  }

  /**
   * Lists the stores a device can choose from when it is set up.
   *
   * @returns {{ stores: Array<{ id: string, name: string }> }} Stores that are not deleted, by name.
   * @throws {SyncError} `NOT_READY` when the app has not created its schema yet.
   */
  listStores() {
    this.ensureInfrastructure();
    const stores = this.getDatabase()
      .prepare('SELECT id, name FROM stores WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id')
      .all();
    return { stores };
  }

  /**
   * @returns {number} Highest `seq` in the log (0 when empty).
   */
  currentMaxSeq() {
    return this.getDatabase().prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_log').get().seq;
  }

  /**
   * Reads rows of the snapshot, continuing after the position in `state`.
   *
   * @param {string} storeId Store to read.
   * @param {{ seq: number, tableIndex: number, afterKey: string | null }} state Snapshot position.
   * @param {number} limit Rows to read at most.
   * @param {Array<object>} changes Output list the rows are appended to.
   * @returns {object} The new cursor state: still `snapshot`, or `log` once every table has been read.
   */
  readSnapshotPage(storeId, state, limit, changes) {
    const database = this.getDatabase();
    let { tableIndex, afterKey } = state;
    while (tableIndex < SYNCED_TABLES.length && changes.length < limit) {
      const { table, primaryKey } = SYNCED_TABLES[tableIndex];
      const scope = table === 'stores' ? 'id = ?' : 'store_id = ?';
      const wanted = limit - changes.length;
      const rows = database
        .prepare(`SELECT * FROM ${table} WHERE ${scope} AND (? IS NULL OR ${primaryKey} > ?) ORDER BY ${primaryKey} LIMIT ?`)
        .all(storeId, afterKey, afterKey, wanted);
      for (const row of rows) changes.push({ table, rowId: String(row[primaryKey]), op: 'upsert', row });
      if (rows.length < wanted) {
        tableIndex += 1;
        afterKey = null;
      } else {
        // The page is full: the next call continues after the last key (and finds nothing left if the table ended here).
        afterKey = String(rows[rows.length - 1][primaryKey]);
      }
    }
    if (tableIndex >= SYNCED_TABLES.length) return { phase: 'log', seq: state.seq };
    return { phase: 'snapshot', seq: state.seq, tableIndex, afterKey };
  }

  /**
   * Reads log entries after `seq`, one change per row (the latest state), in the order they last changed.
   *
   * @param {string} storeId Store to read.
   * @param {number} seq Log position already delivered.
   * @param {number} limit Changes to read at most.
   * @param {Array<object>} changes Output list the changes are appended to.
   * @returns {{ seq: number, done: boolean }} New log position and whether the log was read to its end.
   */
  readLogPage(storeId, seq, limit, changes) {
    if (limit <= 0) return { seq, done: false };
    const database = this.getDatabase();
    const entries = database
      .prepare(`SELECT table_name, row_id, MAX(seq) AS seq FROM sync_log
                WHERE seq > ? AND store_id = ? GROUP BY table_name, row_id ORDER BY seq LIMIT ?`)
      .all(seq, storeId, limit);
    const primaryKeys = new Map(SYNCED_TABLES.map(({ table, primaryKey }) => [table, primaryKey]));
    for (const entry of entries) {
      const primaryKey = primaryKeys.get(entry.table_name);
      const row = primaryKey
        ? database.prepare(`SELECT * FROM ${entry.table_name} WHERE ${primaryKey} = ?`).get(entry.row_id)
        : undefined;
      changes.push(row
        ? { table: entry.table_name, rowId: entry.row_id, op: 'upsert', row }
        : { table: entry.table_name, rowId: entry.row_id, op: 'delete' });
    }
    if (entries.length < limit) return { seq: Math.max(seq, this.currentMaxSeq()), done: true };
    return { seq: entries[entries.length - 1].seq, done: false };
  }

  /**
   * @param {string} epoch Current epoch.
   * @param {object} state Cursor state.
   * @returns {string} Opaque cursor text.
   */
  encodeCursor(epoch, state) {
    return Buffer.from(JSON.stringify({ e: epoch, p: state.phase, s: state.seq, t: state.tableIndex ?? 0, k: state.afterKey ?? null })).toString('base64url');
  }

  /**
   * @param {string} cursor Cursor text from `encodeCursor`.
   * @param {string} epoch Current epoch.
   * @returns {{ phase: string, seq: number, tableIndex: number, afterKey: string | null }} Cursor state.
   * @throws {SyncError} `BAD_CURSOR` for text that is not a cursor, `EPOCH_CHANGED` for a cursor of an older epoch.
   */
  decodeCursor(cursor, epoch) {
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw new SyncError('BAD_CURSOR', 'The cursor is not valid.', 400);
    }
    const valid = parsed && typeof parsed.e === 'string' && (parsed.p === 'snapshot' || parsed.p === 'log')
      && Number.isInteger(parsed.s) && parsed.s >= 0 && Number.isInteger(parsed.t) && parsed.t >= 0 && parsed.t <= SYNCED_TABLES.length;
    if (!valid) throw new SyncError('BAD_CURSOR', 'The cursor is not valid.', 400);
    if (parsed.e !== epoch) {
      throw new SyncError('EPOCH_CHANGED', 'The server database was restored or replaced; download everything again.', 409);
    }
    return { phase: parsed.p, seq: parsed.s, tableIndex: parsed.t, afterKey: parsed.k };
  }
}
