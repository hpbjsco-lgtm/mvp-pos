/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tables that devices synchronise, with their primary key column, in dependency order (a table comes
 * after the tables it refers to), which is also the order of the first full download.
 *
 * This list mirrors `TABLE_PRIMARY_KEY` of the app (`src/db/schema.ts`); a test fails when the two differ.
 *
 * @type {ReadonlyArray<{ table: string, primaryKey: string }>}
 */
export const SYNCED_TABLES = Object.freeze([
  { table: 'stores', primaryKey: 'id' },
  { table: 'users', primaryKey: 'uid' },
  { table: 'zones', primaryKey: 'id' },
  { table: 'dining_tables', primaryKey: 'id' },
  { table: 'products', primaryKey: 'id' },
  { table: 'product_option_groups', primaryKey: 'id' },
  { table: 'product_option_choices', primaryKey: 'id' },
  { table: 'suppliers', primaryKey: 'id' },
  { table: 'customers', primaryKey: 'id' },
  { table: 'bank_accounts', primaryKey: 'id' },
  { table: 'inventory_batches', primaryKey: 'id' },
  { table: 'inventory_transactions', primaryKey: 'id' },
  { table: 'inventory_transaction_items', primaryKey: 'id' },
  { table: 'orders', primaryKey: 'id' },
  { table: 'order_items', primaryKey: 'id' },
  { table: 'kitchen_items', primaryKey: 'id' },
  { table: 'carts', primaryKey: 'id' },
  { table: 'cart_items', primaryKey: 'id' },
  { table: 'attendance', primaryKey: 'id' },
  { table: 'activity_logs', primaryKey: 'id' },
  { table: 'shifts', primaryKey: 'id' },
  { table: 'cash_vouchers', primaryKey: 'id' },
]);
