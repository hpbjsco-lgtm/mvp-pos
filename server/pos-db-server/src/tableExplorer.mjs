/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Smallest and largest page size the explorer returns. */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Text longer than this is cut in table listings; the full value is available through `readRow`. */
const LIST_TEXT_LIMIT = 200;

/** Pseudo column used to address rows of tables that have no primary key. */
export const ROWID_KEY = '__rowid__';

/**
 * Error for requests that name a missing table, an unknown column or an unusable key.
 * The HTTP layer answers these with status 400.
 */
export class ExplorerError extends Error {}

/**
 * Generic browse and edit operations over any table of the SQLite file, used by the admin page.
 * Table and column names are only ever taken from the database itself (never from the request text),
 * and all values are bound as parameters.
 */
export class TableExplorer {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection.
   */
  constructor(getDatabase) {
    this.getDatabase = getDatabase;
  }

  /**
   * Lists the user tables with their row counts.
   *
   * @returns {{ name: string, rowCount: number }[]} Tables sorted by name (internal `sqlite_` tables are hidden).
   */
  listTables() {
    const database = this.getDatabase();
    const names = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    return names.map((name) => ({
      name,
      rowCount: database.prepare(`SELECT COUNT(*) AS total FROM ${this.quote(name)}`).get().total,
    }));
  }

  /**
   * Describes the columns of a table.
   *
   * @param {string} table Table name; must exist.
   * @returns {{ columns: { name: string, type: string, notNull: boolean, primaryKeyOrder: number }[], primaryKey: string[] }}
   *   Columns in table order and the primary key column names (empty when the table is addressed by rowid).
   * @throws {ExplorerError} When the table does not exist.
   */
  describeTable(table) {
    this.assertTable(table);
    const info = this.getDatabase().prepare(`PRAGMA table_info(${this.quote(table)})`).all();
    const columns = info.map((column) => ({
      name: column.name,
      type: column.type,
      notNull: column.notnull === 1,
      primaryKeyOrder: column.pk,
    }));
    const primaryKey = columns
      .filter((column) => column.primaryKeyOrder > 0)
      .sort((a, b) => a.primaryKeyOrder - b.primaryKeyOrder)
      .map((column) => column.name);
    return { columns, primaryKey };
  }

  /**
   * Reads one page of rows.
   *
   * @param {string} table Table name; must exist.
   * @param {{ limit?: number, offset?: number, search?: string }} [options] Page size (max 200), start offset and a
   *   text that must appear in at least one column.
   * @returns {{ columns: object[], primaryKey: string[], rows: object[], total: number }} The page, with long text cut.
   *   Every row carries `__key` (values that identify it for update and delete).
   * @throws {ExplorerError} When the table does not exist.
   */
  readRows(table, { limit = DEFAULT_PAGE_SIZE, offset = 0, search = '' } = {}) {
    const { columns, primaryKey } = this.describeTable(table);
    const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const start = Math.max(Number(offset) || 0, 0);

    const params = [];
    let where = '';
    const text = String(search || '').trim();
    if (text) {
      where = ` WHERE ${columns.map((column) => `CAST(${this.quote(column.name)} AS TEXT) LIKE ?`).join(' OR ')}`;
      for (let i = 0; i < columns.length; i += 1) params.push(`%${text}%`);
    }

    const orderBy = primaryKey.length > 0 ? primaryKey.map((name) => this.quote(name)).join(', ') : 'rowid';
    const rowIdSelect = primaryKey.length > 0 ? '' : ', rowid AS __rowid__';
    const database = this.getDatabase();
    const total = database.prepare(`SELECT COUNT(*) AS total FROM ${this.quote(table)}${where}`).get(...params).total;
    const rawRows = database
      .prepare(`SELECT *${rowIdSelect} FROM ${this.quote(table)}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, start);

    const rows = rawRows.map((raw) => this.toDisplayRow(raw, primaryKey, true));
    return { columns, primaryKey, rows, total };
  }

  /**
   * Reads one full row (no text cutting), used to fill the edit form.
   *
   * @param {string} table Table name; must exist.
   * @param {Record<string, unknown>} key Primary key values, or `{ __rowid__ }` for tables without a primary key.
   * @returns {Record<string, unknown> | null} The row, or null when it no longer exists.
   * @throws {ExplorerError} When the table or key is invalid.
   */
  readRow(table, key) {
    const { primaryKey } = this.describeTable(table);
    const { clause, params } = this.buildKeyClause(primaryKey, key);
    const rowIdSelect = primaryKey.length > 0 ? '' : ', rowid AS __rowid__';
    const raw = this.getDatabase()
      .prepare(`SELECT *${rowIdSelect} FROM ${this.quote(table)} WHERE ${clause}`)
      .get(...params);
    return raw ? this.toDisplayRow(raw, primaryKey, false) : null;
  }

  /**
   * Inserts a row.
   *
   * @param {string} table Table name; must exist.
   * @param {Record<string, unknown>} values Column values; columns left out get their default.
   * @returns {number | bigint} The rowid of the new row.
   * @throws {ExplorerError} When a column name does not exist.
   * @throws {Error} When SQLite rejects the row (constraint, foreign key).
   */
  insertRow(table, values) {
    const names = this.assertColumns(table, values);
    const sql = names.length === 0
      ? `INSERT INTO ${this.quote(table)} DEFAULT VALUES`
      : `INSERT INTO ${this.quote(table)} (${names.map((name) => this.quote(name)).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
    return this.getDatabase().prepare(sql).run(...names.map((name) => this.bindable(values[name]))).lastInsertRowid;
  }

  /**
   * Updates one row identified by its key.
   *
   * @param {string} table Table name; must exist.
   * @param {Record<string, unknown>} key Primary key values, or `{ __rowid__ }`.
   * @param {Record<string, unknown>} values Columns to change.
   * @returns {number} Number of rows changed (0 when the row no longer exists).
   * @throws {ExplorerError} When the table, key or a column name is invalid, or `values` is empty.
   */
  updateRow(table, key, values) {
    const { primaryKey } = this.describeTable(table);
    const names = this.assertColumns(table, values);
    if (names.length === 0) throw new ExplorerError('There is nothing to update.');
    const { clause, params } = this.buildKeyClause(primaryKey, key);
    const assignments = names.map((name) => `${this.quote(name)} = ?`).join(', ');
    return this.getDatabase()
      .prepare(`UPDATE ${this.quote(table)} SET ${assignments} WHERE ${clause}`)
      .run(...names.map((name) => this.bindable(values[name])), ...params).changes;
  }

  /**
   * Deletes one row identified by its key.
   *
   * @param {string} table Table name; must exist.
   * @param {Record<string, unknown>} key Primary key values, or `{ __rowid__ }`.
   * @returns {number} Number of rows deleted (0 when the row no longer exists).
   * @throws {ExplorerError} When the table or key is invalid.
   * @throws {Error} When a foreign key still references the row.
   */
  deleteRow(table, key) {
    const { primaryKey } = this.describeTable(table);
    const { clause, params } = this.buildKeyClause(primaryKey, key);
    return this.getDatabase().prepare(`DELETE FROM ${this.quote(table)} WHERE ${clause}`).run(...params).changes;
  }

  /**
   * Quotes an identifier that was already checked against the database.
   *
   * @param {string} identifier Table or column name.
   * @returns {string} Name wrapped in double quotes, with embedded quotes doubled.
   */
  quote(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
  }

  /**
   * @param {string} table Name to check.
   * @throws {ExplorerError} When no user table has this name.
   */
  assertTable(table) {
    const found = this.getDatabase()
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%'")
      .get(table);
    if (!found) throw new ExplorerError(`Table "${table}" does not exist.`);
  }

  /**
   * @param {string} table Table whose columns are checked.
   * @param {Record<string, unknown>} values Object whose keys must all be column names.
   * @returns {string[]} The column names in `values`.
   * @throws {ExplorerError} When `values` is not an object or holds an unknown column.
   */
  assertColumns(table, values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new ExplorerError('values must be an object.');
    }
    const known = new Set(this.describeTable(table).columns.map((column) => column.name));
    const names = Object.keys(values);
    for (const name of names) {
      if (!known.has(name)) throw new ExplorerError(`Column "${name}" does not exist in table "${table}".`);
    }
    return names;
  }

  /**
   * Builds the WHERE clause that selects exactly one row.
   *
   * @param {string[]} primaryKey Primary key column names of the table; empty means rowid.
   * @param {Record<string, unknown>} key Values sent by the client.
   * @returns {{ clause: string, params: unknown[] }} SQL fragment and its parameters.
   * @throws {ExplorerError} When a key value is missing.
   */
  buildKeyClause(primaryKey, key) {
    if (!key || typeof key !== 'object') throw new ExplorerError('key must be an object.');
    if (primaryKey.length === 0) {
      if (key[ROWID_KEY] === undefined || key[ROWID_KEY] === null) throw new ExplorerError(`key must hold ${ROWID_KEY}.`);
      return { clause: 'rowid = ?', params: [key[ROWID_KEY]] };
    }
    for (const name of primaryKey) {
      if (key[name] === undefined || key[name] === null) throw new ExplorerError(`key is missing the value of "${name}".`);
    }
    return {
      clause: primaryKey.map((name) => `${this.quote(name)} = ?`).join(' AND '),
      params: primaryKey.map((name) => key[name]),
    };
  }

  /**
   * Converts a database row to a JSON-safe row: binary data becomes a placeholder, long text can be cut,
   * and `__key` is added.
   *
   * @param {Record<string, unknown>} raw Row from SQLite.
   * @param {string[]} primaryKey Primary key column names (empty for rowid tables).
   * @param {boolean} cutLongText True to shorten text longer than the list limit.
   * @returns {Record<string, unknown>} Row ready to be sent as JSON.
   */
  toDisplayRow(raw, primaryKey, cutLongText) {
    const row = {};
    for (const [name, value] of Object.entries(raw)) {
      if (name === ROWID_KEY) continue;
      if (Buffer.isBuffer(value)) {
        row[name] = { __blob: value.length };
      } else if (cutLongText && typeof value === 'string' && value.length > LIST_TEXT_LIMIT) {
        row[name] = `${value.slice(0, LIST_TEXT_LIMIT)}… (${value.length} characters)`;
      } else {
        row[name] = value;
      }
    }
    row.__key = primaryKey.length > 0
      ? Object.fromEntries(primaryKey.map((name) => [name, raw[name]]))
      : { [ROWID_KEY]: raw[ROWID_KEY] };
    return row;
  }

  /**
   * Converts a JSON value to a value SQLite can bind.
   *
   * @param {unknown} value Value from the client.
   * @returns {unknown} null, number, string (booleans become 0/1).
   * @throws {ExplorerError} When the value is an object or array.
   */
  bindable(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'object') throw new ExplorerError('Values may only be strings, numbers, booleans or null.');
    return value;
  }
}
