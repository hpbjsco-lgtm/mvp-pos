/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import initSqlJs from 'sql.js';
import type { SqlDriver, SqlStatement } from '../db/driver';

/**
 * In-memory SQLite database (sql.js) with the `SqlDriver` interface, for tests that need real SQL behaviour
 * such as triggers. It reports itself as a phone database (`native`) so the app's migration code treats it like one.
 *
 * @returns A new, empty database.
 */
export async function createSqlJsTestDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  const bind = (params: unknown[] = []) => params.map(value => (value === undefined ? null : value)) as any[];
  return {
    platform: 'native',
    async exec(sql: string) { db.exec(sql); },
    async run(sql: string, params: unknown[] = []) { db.run(sql, bind(params)); },
    async all<T = Record<string, any>>(sql: string, params: unknown[] = []) {
      const statement = db.prepare(sql);
      try {
        statement.bind(bind(params));
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
    async batch(statements: SqlStatement[]) {
      db.run('BEGIN');
      try {
        for (const { sql, params } of statements) db.run(sql, bind(params));
        db.run('COMMIT');
      } catch (error) {
        db.run('ROLLBACK');
        throw error;
      }
    },
    async flush() {},
    async exportRawBytes() { return db.export(); },
    async importRawBytes() { return false; },
    async close() { db.close(); },
  };
}
