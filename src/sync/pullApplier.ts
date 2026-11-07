/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SqlStatement } from '../db/driver';
import { SYNCED_TABLES, TABLE_PRIMARY_KEY, TABLES_WITH_REV } from '../db/schema';
import type { PullChange } from './syncClient';
import { SyncStore } from './syncStore';

/** Column names come from the server's schema; anything else is refused instead of being put into SQL. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Position of each synced table in dependency order (parents first). */
const TABLE_ORDER = new Map<string, number>(SYNCED_TABLES.map((table, index) => [table, index]));

/**
 * Turns downloaded changes into SQL for the device database. Upserts come first, parents before the rows that
 * refer to them, then deletes, children before parents, so a foreign key never points at a missing row.
 * For tables with a row version the version is remembered as the base of the next upload.
 *
 * @param changes Changes of one page.
 * @param skip Keys (`table:rowId`) of records with a pending local edit; their server version is not applied here,
 *   the next upload decides between the two versions.
 * @returns Statements to run through `SyncStore.applyRemote`.
 * @throws {Error} For a table that is not synchronised or a column name that is not an identifier.
 */
export function buildPullStatements(changes: PullChange[], skip: ReadonlySet<string> = new Set()): SqlStatement[] {
  const indexOf = (table: string) => {
    const index = TABLE_ORDER.get(table);
    if (index === undefined) throw new Error(`The server sent a change for the table "${table}", which this app does not synchronise.`);
    return index;
  };
  // Checked here, not only inside the sort: sorting one item never calls the comparison function.
  for (const change of changes) indexOf(change.table);
  const wanted = changes.filter(change => !skip.has(`${change.table}:${change.rowId}`));
  const upserts = wanted.filter(change => change.op === 'upsert').sort((a, b) => indexOf(a.table) - indexOf(b.table));
  const deletes = wanted.filter(change => change.op === 'delete').sort((a, b) => indexOf(b.table) - indexOf(a.table));

  const statements: SqlStatement[] = [];
  for (const change of upserts) {
    if (!change.row) throw new Error(`The server sent an upsert of ${change.table}:${change.rowId} without a row.`);
    const primaryKey = TABLE_PRIMARY_KEY[change.table];
    const columns = Object.keys(change.row);
    for (const column of columns) {
      if (!IDENTIFIER.test(column)) throw new Error(`The server sent an invalid column name "${column}" for ${change.table}.`);
    }
    const updates = columns.filter(column => column !== primaryKey).map(column => `${column} = excluded.${column}`);
    statements.push({
      sql: `INSERT INTO ${change.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) `
        + (updates.length > 0 ? `ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates.join(', ')}` : `ON CONFLICT(${primaryKey}) DO NOTHING`),
      params: columns.map(column => change.row![column]),
    });
    if (TABLES_WITH_REV[change.table] && typeof change.row.rev === 'number') {
      statements.push(SyncStore.baseRevStatement(change.table, change.rowId, change.row.rev));
    }
  }
  for (const change of deletes) {
    statements.push({ sql: `DELETE FROM ${change.table} WHERE ${TABLE_PRIMARY_KEY[change.table]} = ?`, params: [change.rowId] });
  }
  return statements;
}
