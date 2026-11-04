/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SyncError } from './syncError.mjs';

/**
 * The numbered documents: the text before the number, how many digits it has at least, and where existing
 * numbers are stored (to continue after the highest one that is already used).
 *
 * @type {Readonly<Record<string, { prefix: string, pad: number, table: string, column: string, where: string }>>}
 */
export const NUMBER_KINDS = Object.freeze({
  order: { prefix: 'HD', pad: 5, table: 'orders', column: 'order_number', where: '1 = 1' },
  import: { prefix: 'PNK', pad: 4, table: 'inventory_transactions', column: 'transaction_number', where: "type = 'import'" },
  export: { prefix: 'PXK', pad: 4, table: 'inventory_transactions', column: 'transaction_number', where: "type = 'export'" },
  receipt: { prefix: 'PT', pad: 4, table: 'cash_vouchers', column: 'code', where: "voucher_type = 'receipt'" },
  payment: { prefix: 'PC', pad: 4, table: 'cash_vouchers', column: 'code', where: "voucher_type = 'payment'" },
});

/**
 * Hands out document numbers (HD00001, PNK0001, PT0001...) that rise by one per store and never repeat,
 * whichever device asks.
 */
export class NumberingService {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection.
   */
  constructor(getDatabase) {
    this.getDatabase = getDatabase;
  }

  /**
   * Returns the next number of a kind for a store. The counter also skips over numbers already used by
   * stored documents, so a database that already holds numbered documents continues after them.
   *
   * @param {string} storeId Store the number is for; it must exist.
   * @param {string} kind One of `NUMBER_KINDS`.
   * @returns {string} The number, for example `HD00012`.
   * @throws {SyncError} Status 400 for an unknown kind, 404 when the store does not exist.
   */
  next(storeId, kind) {
    const spec = Object.hasOwn(NUMBER_KINDS, kind) ? NUMBER_KINDS[kind] : null;
    if (!spec) throw new SyncError('BAD_REQUEST', `kind must be one of: ${Object.keys(NUMBER_KINDS).join(', ')}.`, 400);
    const database = this.getDatabase();
    return database.transaction(() => {
      if (!database.prepare('SELECT 1 FROM stores WHERE id = ?').get(storeId)) {
        throw new SyncError('NOT_FOUND', `Store "${storeId}" does not exist.`, 404);
      }
      const counter = database.prepare('SELECT last_value FROM sync_counters WHERE store_id = ? AND kind = ?').get(storeId, kind)?.last_value ?? 0;
      const used = database
        .prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(${spec.column}, ?) AS INTEGER)), 0) AS highest
                  FROM ${spec.table} WHERE store_id = ? AND ${spec.column} GLOB ? AND ${spec.where}`)
        .get(spec.prefix.length + 1, storeId, `${spec.prefix}[0-9]*`).highest;
      const value = Math.max(counter, used) + 1;
      database
        .prepare('INSERT INTO sync_counters (store_id, kind, last_value) VALUES (?, ?, ?) ON CONFLICT(store_id, kind) DO UPDATE SET last_value = excluded.last_value')
        .run(storeId, kind, value);
      return `${spec.prefix}${String(value).padStart(spec.pad, '0')}`;
    })();
  }
}
