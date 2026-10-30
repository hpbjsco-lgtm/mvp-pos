/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';

/**
 * One SQL statement with optional positional parameters.
 *
 * @typedef {Object} SqlStatement
 * @property {string} sql Statement text with `?` placeholders.
 * @property {unknown[]} [params] Values bound to the placeholders.
 */

/**
 * Statements that could reach files outside the database file. A token holder must not be able to
 * create or read other SQLite files on the server, so these are rejected before they run.
 */
const FORBIDDEN_STATEMENT = /\b(ATTACH|DETACH)\s+DATABASE\b|\bVACUUM\s+INTO\b|\bLOAD_EXTENSION\b/i;

/**
 * Opens (and creates when missing) the SQLite database used by the server.
 *
 * @param {string} filePath Path of the SQLite file, or `:memory:` for tests.
 * @returns {import('better-sqlite3').Database} Opened connection with WAL and foreign keys enabled.
 */
export function openDatabase(filePath) {
  const database = new Database(filePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  return database;
}

/**
 * Executes SQL sent by clients against one SQLite connection.
 * Its methods mirror the `SqlDriver` interface of the app (`exec`, `run`, `all`, `batch`).
 */
export class SqlService {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection; called on every
   *   request so the connection can be replaced after a restore.
   */
  constructor(getDatabase) {
    this.getDatabase = getDatabase;
  }

  /**
   * Runs one or more statements without parameters (used for DDL such as CREATE TABLE).
   *
   * @param {string} sql Statement text; may contain several statements separated by `;`.
   * @throws {Error} When the SQL is forbidden or SQLite rejects it.
   */
  exec(sql) {
    this.assertAllowed(sql);
    this.getDatabase().exec(sql);
  }

  /**
   * Runs one write statement with parameters.
   *
   * @param {string} sql Statement text with `?` placeholders.
   * @param {unknown[]} [params] Values bound to the placeholders.
   * @throws {Error} When the SQL is forbidden or SQLite rejects it.
   */
  run(sql, params = []) {
    this.assertAllowed(sql);
    this.getDatabase().prepare(sql).run(...this.normalizeParams(params));
  }

  /**
   * Runs a query and returns every row.
   *
   * @param {string} sql Query text with `?` placeholders.
   * @param {unknown[]} [params] Values bound to the placeholders.
   * @returns {Record<string, unknown>[]} Rows as plain objects keyed by column name.
   * @throws {Error} When the SQL is forbidden or SQLite rejects it.
   */
  all(sql, params = []) {
    this.assertAllowed(sql);
    return this.getDatabase().prepare(sql).all(...this.normalizeParams(params));
  }

  /**
   * Runs several statements in one transaction: either all succeed or none is applied.
   *
   * @param {SqlStatement[]} statements Statements to run in order.
   * @throws {Error} When any statement is forbidden or fails; the transaction is rolled back.
   */
  batch(statements) {
    for (const statement of statements) this.assertAllowed(statement.sql);
    const database = this.getDatabase();
    const runAll = database.transaction((items) => {
      for (const item of items) {
        database.prepare(item.sql).run(...this.normalizeParams(item.params));
      }
    });
    runAll(statements);
  }

  /**
   * Rejects statements that are not allowed to run.
   *
   * @param {string} sql Statement text to check.
   * @throws {Error} When the text is empty, not a string or contains a forbidden statement.
   */
  assertAllowed(sql) {
    if (typeof sql !== 'string' || sql.trim() === '') {
      throw new Error('SQL text is required.');
    }
    if (FORBIDDEN_STATEMENT.test(sql)) {
      throw new Error('This statement is not allowed on the server.');
    }
  }

  /**
   * Converts JSON values to values SQLite can bind: booleans become 0/1 and undefined becomes null.
   *
   * @param {unknown[] | undefined} params Values received from the client.
   * @returns {unknown[]} Values safe to pass to a prepared statement.
   * @throws {Error} When `params` is not an array or holds an object that cannot be bound.
   */
  normalizeParams(params) {
    if (params === undefined || params === null) return [];
    if (!Array.isArray(params)) throw new Error('params must be an array.');
    return params.map((value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (typeof value === 'object') throw new Error('params may only hold strings, numbers, booleans or null.');
      return value;
    });
  }
}
