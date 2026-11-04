/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { CHILD_TABLES } from './syncPolicy.mjs';
import { SyncError } from './syncError.mjs';
import { SYNCED_TABLES } from './syncTables.mjs';

const PRIMARY_KEYS = new Map(SYNCED_TABLES.map(({ table, primaryKey }) => [table, primaryKey]));

/**
 * Conflicts between a device's edit and the server's data: they are recorded, shown to a manager and
 * resolved by choosing which version is right.
 */
export class ConflictStore {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection.
   * @param {import('./syncApplier.mjs').SyncApplier} applier Reads and writes groups.
   */
  constructor(getDatabase, applier) {
    this.getDatabase = getDatabase;
    this.applier = applier;
  }

  /**
   * Records a conflict. A row has at most one open conflict: a later push of the same row refreshes it.
   *
   * @param {Object} conflict The conflict.
   * @param {string} conflict.storeId Store of the row.
   * @param {string} conflict.deviceId Device that pushed the edit.
   * @param {import('./syncApplier.mjs').Group} conflict.deviceGroup The device's version.
   * @param {import('./syncApplier.mjs').Group | null} conflict.serverGroup The server's version (null when the row was removed on the server).
   * @returns {string} Id of the conflict.
   */
  record({ storeId, deviceId, deviceGroup, serverGroup }) {
    const database = this.getDatabase();
    const serverRev = serverGroup?.row.rev ?? null;
    const values = [deviceId, deviceGroup.baseRev ?? null, serverRev, JSON.stringify(deviceGroup), JSON.stringify(serverGroup)];
    const open = database
      .prepare("SELECT id FROM sync_conflicts WHERE store_id = ? AND table_name = ? AND row_id = ? AND status = 'pending'")
      .get(storeId, deviceGroup.table, deviceGroup.rowId);
    if (open) {
      database
        .prepare('UPDATE sync_conflicts SET device_id = ?, base_rev = ?, server_rev = ?, device_payload = ?, server_payload = ? WHERE id = ?')
        .run(...values, open.id);
      return open.id;
    }
    const id = randomUUID();
    database
      .prepare(`INSERT INTO sync_conflicts (id, store_id, table_name, row_id, device_id, base_rev, server_rev, device_payload, server_payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, storeId, deviceGroup.table, deviceGroup.rowId, ...values);
    return id;
  }

  /**
   * @param {string} storeId Store to count for.
   * @returns {number} Number of unresolved conflicts.
   */
  countPending(storeId) {
    return this.getDatabase().prepare("SELECT COUNT(*) AS total FROM sync_conflicts WHERE store_id = ? AND status = 'pending'").get(storeId).total;
  }

  /**
   * Lists conflicts without their payloads, newest first.
   *
   * @param {string} storeId Store to list for.
   * @param {'pending' | 'resolved'} [status] Which conflicts; unresolved by default.
   * @returns {object[]} Conflicts with id, table, row id, device, versions, status and times.
   */
  list(storeId, status = 'pending') {
    return this.getDatabase()
      .prepare(`SELECT id, store_id AS storeId, table_name AS "table", row_id AS rowId, device_id AS deviceId, base_rev AS baseRev,
                       server_rev AS serverRev, status, resolution, resolved_by AS resolvedBy, resolved_at AS resolvedAt, created_at AS createdAt
                FROM sync_conflicts WHERE store_id = ? AND status = ? ORDER BY created_at DESC`)
      .all(storeId, status);
  }

  /**
   * Returns one conflict with both versions, for the screen where a manager compares them.
   *
   * @param {string} id Conflict id.
   * @returns {object} The conflict with `devicePayload` and `serverPayload` as objects.
   * @throws {SyncError} `NOT_FOUND` when there is no such conflict.
   */
  get(id) {
    const row = this.getDatabase().prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(id);
    if (!row) throw new SyncError('NOT_FOUND', 'Conflict not found.', 404);
    return {
      id: row.id, storeId: row.store_id, table: row.table_name, rowId: row.row_id, deviceId: row.device_id,
      baseRev: row.base_rev, serverRev: row.server_rev, status: row.status, resolution: row.resolution,
      resolvedBy: row.resolved_by, resolvedAt: row.resolved_at, createdAt: row.created_at,
      devicePayload: JSON.parse(row.device_payload), serverPayload: JSON.parse(row.server_payload),
    };
  }

  /**
   * Resolves a conflict. Choosing `device` writes the device's version to the server. Choosing `server`
   * keeps the server's data but raises the version of the row (and rewrites its child rows) so that every
   * device downloads it again and drops its own edit.
   *
   * If the server row changed after the conflict was recorded, nothing is written: the stored server
   * version is refreshed and `CONFLICT_STALE` is thrown, so the manager decides on current data.
   *
   * @param {string} id Conflict id.
   * @param {'server' | 'device'} choice Which version is right.
   * @param {string} resolvedBy Name of the person who decided.
   * @throws {SyncError} `NOT_FOUND`, `NOT_PENDING`, `CONFLICT_STALE`, or status 400 for a bad choice.
   */
  resolve(id, choice, resolvedBy) {
    if (choice !== 'server' && choice !== 'device') throw new SyncError('BAD_REQUEST', 'choice must be "server" or "device".', 400);
    if (typeof resolvedBy !== 'string' || !resolvedBy.trim()) throw new SyncError('BAD_REQUEST', 'resolvedBy is required.', 400);
    const database = this.getDatabase();
    const conflict = this.get(id);
    if (conflict.status !== 'pending') throw new SyncError('NOT_PENDING', 'This conflict is already resolved.', 409);

    const serverGroup = this.applier.readGroup(conflict.table, conflict.rowId);
    const currentRev = serverGroup?.row.rev ?? null;
    if (currentRev !== conflict.serverRev) {
      // Refresh outside the transaction below, so the new server version is kept when the error is thrown.
      database.prepare('UPDATE sync_conflicts SET server_rev = ?, server_payload = ? WHERE id = ?').run(currentRev, JSON.stringify(serverGroup), id);
      throw new SyncError('CONFLICT_STALE', 'The server data changed after this conflict was recorded. Review the current version and decide again.', 409);
    }

    database.transaction(() => {
      if (choice === 'device') {
        this.applier.applyGroup(conflict.devicePayload, { force: true });
      } else if (serverGroup) {
        this.touchGroup(serverGroup);
      }
      database
        .prepare("UPDATE sync_conflicts SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .run(choice, resolvedBy.trim(), id);
    })();
  }

  /**
   * Raises the version of a group without changing its values, so the change log lists the parent and its
   * children again and every device downloads them.
   *
   * @param {import('./syncApplier.mjs').Group} group The server's group.
   */
  touchGroup(group) {
    const database = this.getDatabase();
    const primaryKey = PRIMARY_KEYS.get(group.table);
    database
      .prepare(`UPDATE ${group.table} SET rev = rev + 1 WHERE ${primaryKey} = ?`)
      .run(group.rowId);
    for (const child of CHILD_TABLES[group.table] ?? []) {
      const childKey = PRIMARY_KEYS.get(child.table);
      // An UPDATE fires the change-log trigger even when the value stays the same.
      database.prepare(`UPDATE ${child.table} SET ${childKey} = ${childKey} WHERE ${child.foreignKey} = ?`).run(group.rowId);
    }
  }
}
