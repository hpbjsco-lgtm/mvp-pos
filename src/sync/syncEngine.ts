/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CHILD_TABLE_PARENTS } from '../db/deviceSchema';
import type { SqlDriver, SqlStatement } from '../db/driver';
import { TABLE_PRIMARY_KEY, TABLES_WITH_REV } from '../db/schema';
import { NUMBERED_TABLE_COLUMNS } from './numberedTables';
import { buildPullStatements } from './pullApplier';
import type { PullSource, PushGroup, PushResult, PushTarget, SyncRow } from './syncClient';
import { SyncStore, type OutboxEntry } from './syncStore';

/** Records sent in one request; the server accepts at most 500. */
const PUSH_BATCH_SIZE = 100;

/** What one synchronisation round did. */
export interface SyncRunResult {
  /** Records the server stored. */
  uploaded: number;
  /** Records the server already held with the same values. */
  alreadyKnown: number;
  /** Records the server could not take because someone else changed them; they wait for a manager to resolve. */
  conflicts: number;
  /** Records written to this device from the server. */
  downloaded: number;
  /** Unresolved conflicts of the store, as reported by the server at the end of the download. */
  pendingConflicts: number;
  /** Tables whose rows changed on this device during the round (downloaded rows and official numbers), so the screens can reload them. */
  changedTables: string[];
}

/** Server connection used by the engine. */
export type SyncTransport = PullSource & PushTarget;

/**
 * One synchronisation round between the device database and the server: first the local changes go up, then
 * the changes of other devices come down. It runs one round at a time.
 */
export class SyncEngine {
  private running: Promise<SyncRunResult> | null = null;

  /**
   * @param driver The device database.
   * @param store Bookkeeping tables of the device.
   * @param transport Connection to the server.
   */
  constructor(
    private readonly driver: SqlDriver,
    private readonly store: SyncStore,
    private readonly transport: SyncTransport,
  ) {}

  /**
   * Runs a round, or joins the one that is already running.
   *
   * @returns What the round did.
   * @throws {Error} When the first download is not finished, the server cannot be reached or refuses a request.
   *   Local changes stay queued and the next round sends them.
   */
  runOnce(): Promise<SyncRunResult> {
    if (!this.running) {
      this.running = this.round().finally(() => { this.running = null; });
    }
    return this.running;
  }

  /**
   * @returns The result of one round.
   */
  private async round(): Promise<SyncRunResult> {
    const storeId = await this.store.getState('storeId');
    if (!storeId || (await this.store.getState('initialSync')) !== 'done') {
      throw new Error('The first download from the server is not finished, so the device cannot synchronise yet.');
    }
    const deviceId = await this.store.getDeviceId();
    const pushed = await this.pushPending(storeId, deviceId);
    const pulled = await this.pullChanges(storeId);
    return {
      uploaded: pushed.uploaded,
      alreadyKnown: pushed.alreadyKnown,
      conflicts: pushed.conflicts,
      downloaded: pulled.downloaded,
      pendingConflicts: pulled.pendingConflicts,
      changedTables: [...new Set([...pushed.changedTables, ...pulled.changedTables])].sort(),
    };
  }

  /**
   * Sends every queued record of the store.
   *
   * @param storeId Store of the device.
   * @param deviceId Identifier of the device.
   * @returns Counts of the answers.
   */
  private async pushPending(storeId: string, deviceId: string): Promise<Pick<SyncRunResult, 'uploaded' | 'alreadyKnown' | 'conflicts' | 'changedTables'>> {
    const counts = { uploaded: 0, alreadyKnown: 0, conflicts: 0, changedTables: [] as string[] };
    const pending = (await this.store.listPending()).filter(entry => entry.storeId === storeId);
    for (let start = 0; start < pending.length; start += PUSH_BATCH_SIZE) {
      const batch = pending.slice(start, start + PUSH_BATCH_SIZE);
      const groups: PushGroup[] = [];
      for (const entry of batch) {
        const group = await this.buildGroup(entry);
        if (group) groups.push(group);
      }
      const result: PushResult = groups.length > 0 ? await this.transport.push(storeId, deviceId, groups) : { applied: [], unchanged: [], conflicts: [] };
      const statements: SqlStatement[] = [];
      for (const record of [...result.applied, ...result.unchanged]) {
        statements.push(...this.writeBack(record));
        // An official number replaces what the screen shows, so that table must be reloaded.
        if (NUMBERED_TABLE_COLUMNS[record.table] && record.number) counts.changedTables.push(record.table);
      }
      if (statements.length > 0) await this.store.applyRemote(statements);
      // A record that changed again while it was being sent keeps its place in the queue (see `removeUploaded`).
      await this.store.removeUploaded(batch);
      counts.uploaded += result.applied.length;
      counts.alreadyKnown += result.unchanged.length;
      counts.conflicts += result.conflicts.length;
    }
    return counts;
  }

  /**
   * Reads a queued record, with its child rows, as the server expects it.
   *
   * @param entry Queue entry.
   * @returns The group, or null when the record no longer exists on the device (nothing to send).
   */
  private async buildGroup(entry: OutboxEntry): Promise<PushGroup | null> {
    const primaryKey = TABLE_PRIMARY_KEY[entry.tableName];
    const rows = await this.driver.all<SyncRow>(`SELECT * FROM ${entry.tableName} WHERE ${primaryKey} = ?`, [entry.rowId]);
    if (rows.length === 0) return null;
    const group: PushGroup = {
      table: entry.tableName,
      rowId: entry.rowId,
      baseRev: await this.store.getBaseRev(entry.tableName, entry.rowId),
      row: rows[0],
    };
    for (const [childTable, link] of Object.entries(CHILD_TABLE_PARENTS)) {
      if (link.parentTable !== entry.tableName) continue;
      group.children ??= {};
      group.children[childTable] = await this.driver.all<SyncRow>(
        `SELECT * FROM ${childTable} WHERE ${link.foreignKey} = ? ORDER BY ${TABLE_PRIMARY_KEY[childTable]}`,
        [entry.rowId],
      );
    }
    return group;
  }

  /**
   * Statements that record what the server stored: the row version (base of the next upload) and, for a numbered
   * document, its official number and the temporary code.
   *
   * @param record The server's answer for one record.
   * @returns Statements to run through `SyncStore.applyRemote`.
   */
  private writeBack(record: { table: string; rowId: string; rev: number | null; number?: string; tempNumber?: string }): SqlStatement[] {
    const primaryKey = TABLE_PRIMARY_KEY[record.table];
    const statements: SqlStatement[] = [];
    if (typeof record.rev === 'number' && TABLES_WITH_REV[record.table]) {
      statements.push({ sql: `UPDATE ${record.table} SET rev = ? WHERE ${primaryKey} = ?`, params: [record.rev, record.rowId] });
      statements.push(SyncStore.baseRevStatement(record.table, record.rowId, record.rev));
    }
    const numbered = NUMBERED_TABLE_COLUMNS[record.table];
    if (numbered && record.number) {
      statements.push({
        sql: `UPDATE ${record.table} SET ${numbered.numberColumn} = ?, ${numbered.tempColumn} = ? WHERE ${primaryKey} = ?`,
        params: [record.number, record.tempNumber ?? '', record.rowId],
      });
    }
    return statements;
  }

  /**
   * Downloads the changes made since the last round and writes them, except records that wait in the queue
   * (their upload decides between the two versions).
   *
   * @param storeId Store of the device.
   * @returns Number of rows written and the server's count of unresolved conflicts.
   */
  private async pullChanges(storeId: string): Promise<Pick<SyncRunResult, 'downloaded' | 'pendingConflicts' | 'changedTables'>> {
    let cursor = await this.store.getState('cursor');
    if (!cursor) throw new Error('The device has no download position; download the store again.');
    let downloaded = 0;
    let pendingConflicts = 0;
    const changedTables = new Set<string>();
    for (;;) {
      const page = await this.transport.pull(storeId, cursor);
      const queued = this.queuedKeys(await this.store.listPending());
      const skip = new Set(queued);
      // Rows of a queued parent come with the parent, so a pulled child row of such a parent is left out too.
      for (const change of page.changes) {
        const link = CHILD_TABLE_PARENTS[change.table];
        if (link && change.row && queued.has(`${link.parentTable}:${change.row[link.foreignKey]}`)) skip.add(`${change.table}:${change.rowId}`);
      }
      const statements = buildPullStatements(page.changes, skip);
      statements.push(SyncStore.stateStatement('cursor', page.cursor), SyncStore.stateStatement('epoch', page.epoch));
      await this.store.applyRemote(statements);
      const applied = page.changes.filter(change => !skip.has(`${change.table}:${change.rowId}`));
      downloaded += applied.length;
      for (const change of applied) changedTables.add(change.table);
      pendingConflicts = page.pendingConflicts;
      if (page.done) break;
      if (page.cursor === cursor) throw new Error('The server returned the same download position twice; stopping to avoid an endless loop.');
      cursor = page.cursor;
    }
    return { downloaded, pendingConflicts, changedTables: [...changedTables] };
  }

  /**
   * @param entries Queue entries.
   * @returns Keys of the form `table:rowId`.
   */
  private queuedKeys(entries: OutboxEntry[]): Set<string> {
    return new Set(entries.map(entry => `${entry.tableName}:${entry.rowId}`));
  }
}
