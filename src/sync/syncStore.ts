/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SqlDriver, SqlStatement } from '../db/driver';
import { SYNCED_TABLES } from '../db/schema';

/** A record that changed on this device and still has to be uploaded. */
export interface OutboxEntry {
  /** Parent table of the record (child rows are represented by their parent). */
  tableName: string;
  /** Primary key of the record. */
  rowId: string;
  /** Store the record belongs to. */
  storeId: string;
  /** How many times the record changed since it was queued; used to avoid dropping a newer change. */
  changeCount: number;
}

/**
 * Reads and writes the synchronisation bookkeeping tables of the device database (`sync_state`,
 * `sync_outbox`, `sync_row_base`). It knows nothing about the network.
 */
export class SyncStore {
  /**
   * @param driver The device database; must already have the device schema (see `deviceSchema.ts`).
   */
  constructor(private readonly driver: SqlDriver) {}

  /**
   * Builds the statement that stores one state value.
   *
   * @param key State key.
   * @param value State value.
   * @returns The statement, for use inside a batch.
   */
  static stateStatement(key: string, value: string): SqlStatement {
    return {
      sql: 'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      params: [key, value],
    };
  }

  /**
   * Builds the statement that remembers the server version of a record.
   *
   * @param tableName Table of the record.
   * @param rowId Primary key of the record.
   * @param rev Version the server reported.
   * @returns The statement, for use inside a batch.
   */
  static baseRevStatement(tableName: string, rowId: string, rev: number): SqlStatement {
    return {
      sql: `INSERT INTO sync_row_base (table_name, row_id, base_rev) VALUES (?, ?, ?)
            ON CONFLICT(table_name, row_id) DO UPDATE SET base_rev = excluded.base_rev`,
      params: [tableName, rowId, rev],
    };
  }

  /**
   * @param key State key.
   * @returns The stored value, or null when the key was never set.
   */
  async getState(key: string): Promise<string | null> {
    const rows = await this.driver.all<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
  }

  /**
   * @param key State key.
   * @param value State value.
   */
  async setState(key: string, value: string): Promise<void> {
    const { sql, params } = SyncStore.stateStatement(key, value);
    await this.driver.run(sql, params);
  }

  /**
   * Prepares a full download for a store: forgets the download position and marks the first download as pending.
   * The next start of the app wipes the synchronised tables and downloads the store again.
   *
   * @param storeId Store the device will keep in step with the server.
   */
  async markInitialSyncPending(storeId: string): Promise<void> {
    await this.driver.batch([
      { sql: `DELETE FROM sync_state WHERE key IN ('cursor', 'epoch')` },
      SyncStore.stateStatement('storeId', storeId),
      SyncStore.stateStatement('initialSync', 'pending'),
    ]);
  }

  /**
   * Returns the identifier of this device, creating it on first use. The server records it with every upload.
   *
   * @returns Device identifier.
   */
  async getDeviceId(): Promise<string> {
    const existing = await this.getState('deviceId');
    if (existing) return existing;
    const created = `device-${crypto.randomUUID()}`;
    await this.setState('deviceId', created);
    return created;
  }

  /**
   * Hands out the next temporary document code of this device, for example `TAM-9F3A-12`. The letters identify
   * the device and the number rises by one each time, so two devices never give the same code.
   *
   * @returns The code.
   */
  async nextTempCode(): Promise<string> {
    const tag = (await this.getDeviceId()).slice(-4).toUpperCase();
    await this.driver.run(
      `INSERT INTO sync_state (key, value) VALUES ('tempCounter', '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`,
    );
    return `TAM-${tag}-${await this.getState('tempCounter')}`;
  }

  /**
   * Lists the records waiting for upload, parents before the records that refer to them (the order of
   * the synced table list), and in the order they were queued within a table.
   *
   * @returns Pending entries.
   */
  async listPending(): Promise<OutboxEntry[]> {
    const rows = await this.driver.all<{ table_name: string; row_id: string; store_id: string; change_count: number }>(
      'SELECT table_name, row_id, store_id, change_count FROM sync_outbox ORDER BY queued_at, rowid',
    );
    const order = new Map<string, number>(SYNCED_TABLES.map((table, index) => [table, index]));
    return rows
      .map(row => ({ tableName: row.table_name, rowId: row.row_id, storeId: row.store_id, changeCount: Number(row.change_count) }))
      .sort((a, b) => (order.get(a.tableName) ?? 0) - (order.get(b.tableName) ?? 0));
  }

  /**
   * @returns Number of records waiting for upload.
   */
  async pendingCount(): Promise<number> {
    const rows = await this.driver.all<{ total: number }>('SELECT COUNT(*) AS total FROM sync_outbox');
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Removes entries that were uploaded. An entry whose record changed again after it was read (its
   * `changeCount` grew) stays queued, so the newer edit is uploaded in the next round.
   *
   * @param entries Entries as returned by `listPending`.
   */
  async removeUploaded(entries: OutboxEntry[]): Promise<void> {
    await this.driver.batch(entries.map(entry => ({
      sql: 'DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND change_count = ?',
      params: [entry.tableName, entry.rowId, entry.changeCount],
    })));
  }

  /**
   * @param tableName Table of the record.
   * @param rowId Primary key of the record.
   * @returns The server version this device last saw for the record, or null for a record it created.
   */
  async getBaseRev(tableName: string, rowId: string): Promise<number | null> {
    const rows = await this.driver.all<{ base_rev: number }>(
      'SELECT base_rev FROM sync_row_base WHERE table_name = ? AND row_id = ?',
      [tableName, rowId],
    );
    return rows.length > 0 ? Number(rows[0].base_rev) : null;
  }

  /**
   * Writes rows received from the server without marking them as local changes. The `applying` switch is set
   * inside the same transaction as the writes, so it can never stay on after a crash.
   *
   * @param statements Writes to run.
   */
  async applyRemote(statements: SqlStatement[]): Promise<void> {
    await this.driver.batch([
      SyncStore.stateStatement('applying', '1'),
      ...statements,
      SyncStore.stateStatement('applying', '0'),
    ]);
  }
}
