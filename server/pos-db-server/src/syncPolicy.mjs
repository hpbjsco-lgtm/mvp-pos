/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tables whose edits never become a conflict: working data that changes all the time (carts, kitchen
 * tickets) or is only ever added (activity log). The newest push simply wins.
 */
export const OVERWRITE_TABLES = new Set(['carts', 'cart_items', 'kitchen_items', 'activity_logs']);

/**
 * Child tables that travel with their parent as one group: a device pushes an order together with its
 * lines, and the lines are replaced as a set. `foreignKey` is the child column holding the parent id.
 *
 * @type {Readonly<Record<string, ReadonlyArray<{ table: string, foreignKey: string }>>>}
 */
export const CHILD_TABLES = Object.freeze({
  orders: [{ table: 'order_items', foreignKey: 'order_id' }],
  inventory_transactions: [{ table: 'inventory_transaction_items', foreignKey: 'transaction_id' }],
  carts: [{ table: 'cart_items', foreignKey: 'cart_id' }],
});

/** Names of the child tables; they cannot be pushed on their own. */
export const CHILD_TABLE_NAMES = new Set(Object.values(CHILD_TABLES).flat().map((child) => child.table));

/**
 * Columns the server controls, which a device can neither overwrite nor use to detect a difference:
 * the row version everywhere, and the document counters of a store (the server hands out numbers).
 *
 * @param {string} table Table name.
 * @returns {Set<string>} Column names.
 */
export function serverOwnedColumns(table) {
  return new Set(table === 'stores' ? ['rev', 'order_seq', 'import_seq', 'export_seq'] : ['rev']);
}

/**
 * Documents that get an official number from the server. A device offline gives a new document a temporary
 * code in `tempColumn` (and the same text in `numberColumn`); when the server first stores it, the official number
 * replaces the text in `numberColumn` and the temporary code stays in `tempColumn`.
 *
 * `kindOf` maps a row to a number kind of `NUMBER_KINDS`, or null for rows that are not numbered
 * (for example a stock adjustment).
 *
 * @type {Readonly<Record<string, { numberColumn: string, tempColumn: string, kindOf: (row: Record<string, unknown>) => string | null }>>}
 */
export const NUMBERED_TABLES = Object.freeze({
  orders: { numberColumn: 'order_number', tempColumn: 'temp_order_number', kindOf: () => 'order' },
  inventory_transactions: {
    numberColumn: 'transaction_number',
    tempColumn: 'temp_code',
    kindOf: (row) => (row.type === 'import' ? 'import' : row.type === 'export' ? 'export' : null),
  },
  cash_vouchers: {
    numberColumn: 'code',
    tempColumn: 'temp_code',
    kindOf: (row) => (row.voucher_type === 'payment' ? 'payment' : 'receipt'),
  },
});

/** Columns that hold times set by whoever edits; they differ between devices without meaning a real difference. */
export const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at']);
