/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Documents that get an official number from the server: the column that holds the number shown to people and
 * the column that keeps the temporary code a device gave the document while it was offline.
 * Mirrors `NUMBERED_TABLES` of the server (`syncPolicy.mjs`); a test fails when the two differ.
 */
export const NUMBERED_TABLE_COLUMNS: Readonly<Record<string, { numberColumn: string; tempColumn: string }>> = Object.freeze({
  orders: { numberColumn: 'order_number', tempColumn: 'temp_order_number' },
  inventory_transactions: { numberColumn: 'transaction_number', tempColumn: 'temp_code' },
  cash_vouchers: { numberColumn: 'code', tempColumn: 'temp_code' },
});
