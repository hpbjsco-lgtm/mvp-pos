/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Device-only schema for synchronisation with the database server.
 *
 * These tables and triggers exist only in the SQLite file of a phone app (platform `native`). They record
 * which rows changed on the device since the last upload, so the sync engine can send exactly those.
 * A browser (own or server database) never gets them: a server database already keeps its own change log.
 */

import type { SqlDriver } from './driver';
import { SYNCED_TABLES, TABLE_PRIMARY_KEY } from './schema';

/**
 * Child tables travel with their parent row (an order is pushed together with its lines), so a change to a
 * child row marks its parent as changed. Value: the parent table and the child column that holds the parent id.
 * Mirrors `CHILD_TABLES` of the server (`syncPolicy.mjs`); a test fails when the two differ.
 */
export const CHILD_TABLE_PARENTS: Readonly<Record<string, { parentTable: string; foreignKey: string }>> = Object.freeze({
  order_items: { parentTable: 'orders', foreignKey: 'order_id' },
  inventory_transaction_items: { parentTable: 'inventory_transactions', foreignKey: 'transaction_id' },
  cart_items: { parentTable: 'carts', foreignKey: 'cart_id' },
});

/** Prefix of the names of the change-tracking triggers. */
const TRIGGER_PREFIX = 'outbox_';

/** Condition that keeps triggers quiet while rows downloaded from the server are written (see `SyncStore.applyRemote`). */
const NOT_APPLYING_REMOTE = `COALESCE((SELECT value FROM sync_state WHERE key = 'applying'), '0') = '0'`;

/**
 * Builds one trigger. The text is shaped for the phone SQLite plugin, which splits a script at `;` followed
 * by a line break and recognises a trigger by an `END` line: one statement in the body, and `END;` on its
 * own line followed by a line break.
 *
 * @param name Trigger name.
 * @param event `INSERT`, `UPDATE` or `DELETE`.
 * @param table Table the trigger watches.
 * @param queuedTable Table whose row is marked as changed.
 * @param rowIdExpression SQL expression (using NEW or OLD) for the id of that row.
 * @param storeIdExpression SQL expression for the store of that row.
 * @returns The CREATE TRIGGER statement.
 */
function buildTrigger(name: string, event: 'INSERT' | 'UPDATE' | 'DELETE', table: string, queuedTable: string, rowIdExpression: string, storeIdExpression: string): string {
  return [
    `CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${event} ON ${table}`,
    `WHEN ${NOT_APPLYING_REMOTE}`,
    'BEGIN',
    `  INSERT INTO sync_outbox (table_name, row_id, store_id) VALUES ('${queuedTable}', CAST(${rowIdExpression} AS TEXT), ${storeIdExpression})`,
    `  ON CONFLICT(table_name, row_id) DO UPDATE SET change_count = change_count + 1, queued_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`,
    'END;',
    '',
  ].join('\n');
}

/**
 * Change-tracking triggers for every synced table: inserts and updates of a row mark that row (or the parent
 * of a child row) as changed. Rows are never deleted from synced tables except child rows that the app replaces
 * as a set, which is why only child tables also watch deletes.
 *
 * @returns CREATE TRIGGER statements.
 */
export function buildOutboxTriggers(): string[] {
  const statements: string[] = [];
  for (const table of SYNCED_TABLES) {
    const primaryKey = TABLE_PRIMARY_KEY[table];
    const child = CHILD_TABLE_PARENTS[table];
    if (child) {
      const events: Array<['INSERT' | 'UPDATE' | 'DELETE', string, string]> = [['INSERT', 'ai', 'NEW'], ['UPDATE', 'au', 'NEW'], ['DELETE', 'ad', 'OLD']];
      for (const [event, suffix, alias] of events) {
        statements.push(buildTrigger(`${TRIGGER_PREFIX}${table}_${suffix}`, event, table, child.parentTable, `${alias}.${child.foreignKey}`, `COALESCE(${alias}.store_id, '')`));
      }
    } else {
      const storeId = (alias: string) => (table === 'stores' ? `${alias}.id` : `COALESCE(${alias}.store_id, '')`);
      statements.push(buildTrigger(`${TRIGGER_PREFIX}${table}_ai`, 'INSERT', table, table, `NEW.${primaryKey}`, storeId('NEW')));
      statements.push(buildTrigger(`${TRIGGER_PREFIX}${table}_au`, 'UPDATE', table, table, `NEW.${primaryKey}`, storeId('NEW')));
    }
  }
  return statements;
}

/**
 * Migrations that run on phone apps only, after the shared ones. Their versions start at 1001 so they never
 * collide with `MIGRATIONS` in the shared `schema_migrations` table.
 */
export const DEVICE_MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1001,
    statements: [
      /* Small key/value store: device id, store, server epoch, download cursor, `applying` switch. */
      `CREATE TABLE IF NOT EXISTS sync_state (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );`,
      /* One row per changed record waiting for upload. `change_count` lets the engine remove an entry only
         when the record did not change again while it was being uploaded. */
      `CREATE TABLE IF NOT EXISTS sync_outbox (
        table_name    TEXT NOT NULL,
        row_id        TEXT NOT NULL,
        store_id      TEXT NOT NULL DEFAULT '',
        change_count  INTEGER NOT NULL DEFAULT 1,
        queued_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (table_name, row_id)
      );`,
      /* Server version (rev) of each record as this device last received or sent it; sent as baseRev. */
      `CREATE TABLE IF NOT EXISTS sync_row_base (
        table_name  TEXT NOT NULL,
        row_id      TEXT NOT NULL,
        base_rev    INTEGER NOT NULL,
        PRIMARY KEY (table_name, row_id)
      );`,
      ...buildOutboxTriggers(),
    ],
  },
];

/**
 * Number of change-tracking triggers the device schema must have.
 *
 * @returns Trigger count.
 */
export function expectedOutboxTriggerCount(): number {
  return buildOutboxTriggers().length;
}

/**
 * Fails loudly when the change-tracking triggers are missing, for example when the phone SQLite plugin
 * mis-split a trigger script. Without them local edits would silently never reach the server.
 *
 * @param driver The device database.
 * @throws {Error} When fewer triggers than expected exist.
 */
export async function verifyDeviceSyncSchema(driver: SqlDriver): Promise<void> {
  const rows = await driver.all<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'outbox\\_%' ESCAPE '\\'`,
  );
  const found = Number(rows[0]?.total ?? 0);
  const expected = expectedOutboxTriggerCount();
  if (found !== expected) {
    throw new Error(`The device database has ${found} of ${expected} change-tracking triggers, so local changes cannot be synchronised. Reinstall the app or contact support.`);
  }
}
