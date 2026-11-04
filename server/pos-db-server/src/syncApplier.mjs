/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CHILD_TABLE_NAMES, CHILD_TABLES, NUMBERED_TABLES, OVERWRITE_TABLES, serverOwnedColumns, TIMESTAMP_COLUMNS } from './syncPolicy.mjs';
import { SyncError } from './syncError.mjs';
import { SYNCED_TABLES } from './syncTables.mjs';

/** A row of a table as plain values. */
/** @typedef {Record<string, string | number | null>} Row */

/**
 * One unit of synchronisation: a row, optionally with the child rows that belong to it.
 *
 * @typedef {Object} Group
 * @property {string} table Parent table.
 * @property {string} rowId Primary key of the parent row.
 * @property {number | null} [baseRev] Row version the device last received from the server; null or absent for a row the device created.
 * @property {Row} row The parent row.
 * @property {Record<string, Row[]>} [children] Child rows per child table; a table listed here is replaced as a set, a table left out is untouched.
 */

/**
 * Result of applying one group.
 *
 * @typedef {Object} ApplyResult
 * @property {'applied' | 'unchanged' | 'conflict'} status What happened.
 * @property {number | null} [rev] Row version on the server after `applied` or `unchanged`.
 * @property {{ number: string, tempNumber: string } | null} [numbering] For a numbered document: its official number and the temporary code it came with; null for other rows.
 * @property {Group | null} [serverGroup] The server's current group when `status` is `conflict` (null when the row is gone).
 */

const PRIMARY_KEYS = new Map(SYNCED_TABLES.map(({ table, primaryKey }) => [table, primaryKey]));

/**
 * Writes groups received from devices into the database and reads groups back. It decides, row by row,
 * whether a push is accepted, already known, or a conflict; it never throws away a conflicting edit.
 */
export class SyncApplier {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection.
   * @param {import('./numbering.mjs').NumberingService} numbering Hands out official document numbers.
   */
  constructor(getDatabase, numbering) {
    this.getDatabase = getDatabase;
    this.numbering = numbering;
  }

  /**
   * Column names of a table.
   *
   * @param {string} table Table name.
   * @returns {Set<string>} Columns.
   */
  columnsOf(table) {
    return new Set(this.getDatabase().prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  }

  /**
   * Reads the current state of a group from the database.
   *
   * @param {string} table Parent table.
   * @param {string} rowId Primary key of the parent row.
   * @returns {Group | null} The group, or null when the parent row does not exist.
   */
  readGroup(table, rowId) {
    const database = this.getDatabase();
    const primaryKey = PRIMARY_KEYS.get(table);
    const row = database.prepare(`SELECT * FROM ${table} WHERE ${primaryKey} = ?`).get(rowId);
    if (!row) return null;
    const group = { table, rowId, row };
    const children = CHILD_TABLES[table];
    if (children) {
      group.children = {};
      for (const child of children) {
        group.children[child.table] = database
          .prepare(`SELECT * FROM ${child.table} WHERE ${child.foreignKey} = ? ORDER BY ${PRIMARY_KEYS.get(child.table)}`)
          .all(rowId);
      }
    }
    return group;
  }

  /**
   * Checks the shape of a group received from a device.
   *
   * @param {string} storeId Store the device is pushing for.
   * @param {Group} group Group to check.
   * @throws {SyncError} Status 400 when the group names an unknown table or column, belongs to another store, has a child table that is not allowed, or holds a value that is not text, a number, a boolean or null.
   */
  validateGroup(storeId, group) {
    const bad = (message) => new SyncError('BAD_REQUEST', `${group?.table ?? '?'}/${group?.rowId ?? '?'}: ${message}`, 400);
    const primaryKey = PRIMARY_KEYS.get(group?.table);
    if (!primaryKey) throw bad('table is not synchronised.');
    if (CHILD_TABLE_NAMES.has(group.table)) throw bad('push this table together with its parent.');
    if (typeof group.rowId !== 'string' || !group.rowId) throw bad('rowId is required.');
    if (group.baseRev !== undefined && group.baseRev !== null && !Number.isInteger(group.baseRev)) throw bad('baseRev must be a whole number or null.');

    this.validateRow(group.table, group.row, bad);
    if (String(group.row[primaryKey]) !== group.rowId) throw bad(`row.${primaryKey} does not match rowId.`);
    const owner = group.table === 'stores' ? group.row.id : group.row.store_id;
    if (owner !== storeId) throw bad(`the row belongs to store "${owner}", not "${storeId}".`);

    const allowedChildren = new Map((CHILD_TABLES[group.table] ?? []).map((child) => [child.table, child.foreignKey]));
    for (const [childTable, rows] of Object.entries(group.children ?? {})) {
      if (!allowedChildren.has(childTable)) throw bad(`${childTable} is not a child table of ${group.table}.`);
      if (!Array.isArray(rows)) throw bad(`children.${childTable} must be a list.`);
      for (const childRow of rows) {
        this.validateRow(childTable, childRow, bad);
        if (typeof childRow[PRIMARY_KEYS.get(childTable)] !== 'string' || !childRow[PRIMARY_KEYS.get(childTable)]) throw bad(`a ${childTable} row has no ${PRIMARY_KEYS.get(childTable)}.`);
        if (childRow[allowedChildren.get(childTable)] !== group.rowId) throw bad(`a ${childTable} row does not belong to this ${group.table}.`);
        if (childRow.store_id !== storeId) throw bad(`a ${childTable} row belongs to another store.`);
      }
    }
  }

  /**
   * @param {string} table Table of the row.
   * @param {Row} row Row from a device.
   * @param {(message: string) => SyncError} bad Builds the error to throw.
   * @throws {SyncError} When the row is not an object, names a column the table does not have, or holds a value of an unsupported type.
   */
  validateRow(table, row, bad) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw bad('row must be an object.');
    const columns = this.columnsOf(table);
    for (const [name, value] of Object.entries(row)) {
      if (!columns.has(name)) throw bad(`${table} has no column "${name}".`);
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw bad(`column "${name}" must be text, a number, a boolean or null.`);
    }
  }

  /**
   * Applies one group, deciding between accept, already-known and conflict. Run inside a transaction.
   *
   * New rows are inserted. For an existing row of a conflict-checked table the push is accepted when the
   * device's `baseRev` equals the server's current `rev`; when it does not, the push is still accepted if
   * the device's values are identical to the server's, and is a conflict otherwise. Tables in
   * `OVERWRITE_TABLES` are always accepted.
   *
   * A numbered document (see `NUMBERED_TABLES`) that arrives with a temporary code and has no number yet on
   * the server gets its official number when it is written; a conflict does not use up a number. Once a
   * document has its number, a device can no longer change the number or the temporary code.
   *
   * @param {Group} group A validated group.
   * @param {{ force?: boolean }} [options] `force` accepts the group even when it conflicts (a manager chose the device's version).
   * @returns {ApplyResult} The decision.
   */
  applyGroup(group, { force = false } = {}) {
    const database = this.getDatabase();
    const { table } = group;
    const primaryKey = PRIMARY_KEYS.get(table);
    const hasRev = this.columnsOf(table).has('rev');
    const current = this.readGroup(table, group.rowId);
    const numbered = NUMBERED_TABLES[table];

    // Columns the server controls for this row. A document that already has its number keeps it.
    const owned = new Set(serverOwnedColumns(table));
    const alreadyNumbered = Boolean(numbered && current && current.row[numbered.tempColumn]);
    if (alreadyNumbered) {
      owned.add(numbered.numberColumn);
      owned.add(numbered.tempColumn);
    }
    const numberKind = numbered && !alreadyNumbered && typeof group.row[numbered.tempColumn] === 'string' && group.row[numbered.tempColumn]
      ? numbered.kindOf(group.row)
      : null;
    /** Gives the row its official number just before it is written. */
    const withOfficialNumber = (row) => (numberKind
      ? { ...row, [numbered.numberColumn]: this.numbering.next(row.store_id, numberKind) }
      : row);

    if (!current) {
      // A device that knew the row (baseRev set) but finds it gone means it was removed on the server.
      if (hasRev && group.baseRev !== null && group.baseRev !== undefined && !OVERWRITE_TABLES.has(table) && !force) {
        return { status: 'conflict', serverGroup: null };
      }
      this.insertRow(table, withOfficialNumber(group.row), owned);
    } else {
      const sameRow = this.sameValues(group.row, current.row, owned);
      const sameChildren = this.sameChildren(group, current);
      const knownVersion = hasRev && group.baseRev === current.row.rev;
      if (!OVERWRITE_TABLES.has(table) && !force && !knownVersion && !(sameRow && sameChildren)) {
        return { status: 'conflict', serverGroup: current };
      }
      if (sameRow && sameChildren && !force && !numberKind) {
        return { status: 'unchanged', rev: hasRev ? current.row.rev : null, numbering: this.numberingOf(table, current.row) };
      }
      this.updateRow(table, primaryKey, withOfficialNumber(group.row), hasRev, owned);
    }

    const childSets = group.children ?? {};
    for (const child of CHILD_TABLES[table] ?? []) {
      if (!(child.table in childSets)) continue;
      database.prepare(`DELETE FROM ${child.table} WHERE ${child.foreignKey} = ?`).run(group.rowId);
      for (const childRow of childSets[child.table]) this.insertRow(child.table, childRow, serverOwnedColumns(child.table));
    }
    const stored = database.prepare(`SELECT * FROM ${table} WHERE ${primaryKey} = ?`).get(group.rowId);
    return { status: 'applied', rev: hasRev ? stored.rev : null, numbering: this.numberingOf(table, stored) };
  }

  /**
   * @param {string} table Table of the row.
   * @param {Row} row Stored row.
   * @returns {{ number: string, tempNumber: string } | null} The document number and temporary code, or null for tables that are not numbered.
   */
  numberingOf(table, row) {
    const numbered = NUMBERED_TABLES[table];
    return numbered ? { number: String(row[numbered.numberColumn] ?? ''), tempNumber: String(row[numbered.tempColumn] ?? '') } : null;
  }

  /**
   * Inserts a row, leaving the columns the server owns at their defaults.
   *
   * @param {string} table Table name.
   * @param {Row} row Values from a device.
   * @param {Set<string>} owned Columns not taken from the device.
   */
  insertRow(table, row, owned) {
    const names = Object.keys(row).filter((name) => !owned.has(name));
    this.getDatabase()
      .prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
      .run(...names.map((name) => this.bindable(row[name])));
  }

  /**
   * Updates a row from device values and raises its version. `created_at` and the owned columns are kept.
   *
   * @param {string} table Table name.
   * @param {string} primaryKey Primary key column.
   * @param {Row} row Values from a device.
   * @param {boolean} hasRev Whether the table has a `rev` column.
   * @param {Set<string>} owned Columns not taken from the device.
   */
  updateRow(table, primaryKey, row, hasRev, owned) {
    const names = Object.keys(row).filter((name) => name !== primaryKey && name !== 'created_at' && !owned.has(name));
    const assignments = names.map((name) => `${name} = ?`);
    if (hasRev) assignments.push('rev = rev + 1');
    if (assignments.length === 0) return;
    this.getDatabase()
      .prepare(`UPDATE ${table} SET ${assignments.join(', ')} WHERE ${primaryKey} = ?`)
      .run(...names.map((name) => this.bindable(row[name])), row[primaryKey]);
  }

  /**
   * @param {string | number | boolean | null | undefined} value Value from a device.
   * @returns {string | number | null} Value SQLite can bind (booleans become 0 or 1).
   */
  bindable(value) {
    if (value === undefined || value === null) return null;
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }

  /**
   * Compares the values a device sent with a stored row, ignoring owned and timestamp columns.
   *
   * @param {Row} incoming Row from a device (may hold only some columns).
   * @param {Row} stored Row from the database.
   * @param {Set<string>} owned Columns to leave out of the comparison.
   * @returns {boolean} True when every other column the device sent has the same value in the database.
   */
  sameValues(incoming, stored, owned) {
    return Object.keys(incoming)
      .filter((name) => !owned.has(name) && !TIMESTAMP_COLUMNS.has(name))
      .every((name) => this.bindable(incoming[name]) === this.bindable(stored[name]));
  }

  /**
   * Compares the child sets a device sent with the stored ones.
   *
   * @param {Group} group Group from a device.
   * @param {Group} current Stored group.
   * @returns {boolean} True when every child set the device sent holds the same rows as the database.
   */
  sameChildren(group, current) {
    for (const [childTable, rows] of Object.entries(group.children ?? {})) {
      const primaryKey = PRIMARY_KEYS.get(childTable);
      const stored = new Map((current.children?.[childTable] ?? []).map((row) => [String(row[primaryKey]), row]));
      if (stored.size !== rows.length) return false;
      for (const row of rows) {
        const match = stored.get(String(row[primaryKey]));
        if (!match || !this.sameValues(row, match, serverOwnedColumns(childTable))) return false;
      }
    }
    return true;
  }
}
