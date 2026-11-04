import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, TABLE_PRIMARY_KEY } from '../../../src/db/schema';
import { createApp } from './app.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { SyncError, SyncService } from './syncService.mjs';
import { SYNCED_TABLES } from './syncTables.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const TOKEN = 'sync-token-0123456789';
const NOW = '2026-11-01T10:00:00.000Z';

/** Creates the app's real schema in a database. */
function migrate(database) {
  for (const migration of MIGRATIONS) for (const statement of migration.statements) database.exec(statement);
}

/** Inserts a store row. */
function addStore(database, id) {
  database.prepare('INSERT INTO stores (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `Store ${id}`, NOW, NOW);
}

/** Inserts a product row of a store. */
function addProduct(database, id, storeId, name = 'Coffee') {
  database.prepare('INSERT INTO products (id, store_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, storeId, name, NOW, NOW);
}

/** Calls pull until the device has caught up and returns every change and the final cursor. */
function pullAll(sync, storeId, cursor = null, limit = 500) {
  const changes = [];
  let result;
  do {
    result = sync.pull({ storeId, cursor, limit });
    changes.push(...result.changes);
    cursor = result.cursor;
  } while (!result.done);
  return { changes, cursor, epoch: result.epoch };
}

describe('SyncService', () => {
  let folder;
  let manager;
  let sync;
  let database;

  beforeEach(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-sync-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    database = manager.database;
    sync = new SyncService(() => manager.database);
  });
  afterEach(() => {
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('lists the same tables and primary keys as the app', () => {
    expect(Object.fromEntries(SYNCED_TABLES.map(({ table, primaryKey }) => [table, primaryKey]))).toEqual(TABLE_PRIMARY_KEY);
  });

  it('refuses to start before the app has created its schema', () => {
    expect(() => sync.ensureInfrastructure()).toThrow(SyncError);
    try { sync.ensureInfrastructure(); } catch (error) { expect(error.code).toBe('NOT_READY'); expect(error.message).toContain('stores'); }
  });

  it('installs three triggers per table, once', () => {
    migrate(database);
    sync.ensureInfrastructure();
    sync.ensureInfrastructure();
    const triggers = database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync\\_%' ESCAPE '\\'").get().total;
    expect(triggers).toBe(SYNCED_TABLES.length * 3);
  });

  it('logs inserts, updates and deletes made by any statement, scoped to the store', () => {
    migrate(database);
    sync.ensureInfrastructure();
    addStore(database, 'A');
    addProduct(database, 'p1', 'A');
    database.prepare("UPDATE products SET name = 'Tea' WHERE id = 'p1'").run();
    database.prepare("DELETE FROM products WHERE id = 'p1'").run();
    const log = database.prepare('SELECT table_name, row_id, op, store_id FROM sync_log ORDER BY seq').all();
    expect(log).toEqual([
      { table_name: 'stores', row_id: 'A', op: 'upsert', store_id: 'A' },
      { table_name: 'products', row_id: 'p1', op: 'upsert', store_id: 'A' },
      { table_name: 'products', row_id: 'p1', op: 'upsert', store_id: 'A' },
      { table_name: 'products', row_id: 'p1', op: 'delete', store_id: 'A' },
    ]);
  });

  it('logs the rows removed by a foreign key cascade', () => {
    migrate(database);
    sync.ensureInfrastructure();
    addStore(database, 'A');
    database.prepare("INSERT INTO orders (id, store_id, created_at, updated_at) VALUES ('o1', 'A', ?, ?)").run(NOW, NOW);
    database.prepare("INSERT INTO order_items (id, store_id, order_id, created_at) VALUES ('i1', 'A', 'o1', ?)").run(NOW);
    database.exec('DELETE FROM sync_log');
    database.prepare("DELETE FROM orders WHERE id = 'o1'").run();
    const deleted = database.prepare("SELECT table_name FROM sync_log WHERE op = 'delete' ORDER BY seq").all().map((row) => row.table_name);
    expect(deleted).toEqual(expect.arrayContaining(['orders', 'order_items']));
  });

  it('starts with a snapshot of one store only', () => {
    migrate(database);
    addStore(database, 'A');
    addStore(database, 'B');
    addProduct(database, 'p1', 'A');
    addProduct(database, 'p2', 'B');
    const { changes } = pullAll(sync, 'A');
    expect(changes.map((change) => `${change.table}:${change.rowId}`)).toEqual(['stores:A', 'products:p1']);
    expect(changes[1].row).toMatchObject({ id: 'p1', store_id: 'A', name: 'Coffee' });
  });

  it('pages through a snapshot in small pages without losing or repeating rows', () => {
    migrate(database);
    addStore(database, 'A');
    for (let i = 1; i <= 5; i++) addProduct(database, `p${i}`, 'A');
    const { changes } = pullAll(sync, 'A', null, 2);
    expect(changes.map((change) => change.rowId)).toEqual(['A', 'p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('delivers later changes through the log, one entry per row, with deletes as tombstones', () => {
    migrate(database);
    addStore(database, 'A');
    addProduct(database, 'p1', 'A');
    addProduct(database, 'p2', 'A');
    const first = pullAll(sync, 'A');
    database.prepare("UPDATE products SET name = 'One' WHERE id = 'p1'").run();
    database.prepare("UPDATE products SET name = 'Uno' WHERE id = 'p1'").run();
    database.prepare("UPDATE products SET deleted_at = ? WHERE id = 'p2'").run(NOW);
    addProduct(database, 'p3', 'A');
    database.prepare("DELETE FROM products WHERE id = 'p3'").run();
    const second = pullAll(sync, 'A', first.cursor);
    expect(second.changes).toEqual([
      expect.objectContaining({ table: 'products', rowId: 'p1', op: 'upsert', row: expect.objectContaining({ name: 'Uno' }) }),
      expect.objectContaining({ table: 'products', rowId: 'p2', op: 'upsert', row: expect.objectContaining({ deleted_at: NOW }) }),
      { table: 'products', rowId: 'p3', op: 'delete' },
    ]);
    expect(pullAll(sync, 'A', second.cursor).changes).toEqual([]);
  });

  it('does not deliver changes of other stores', () => {
    migrate(database);
    addStore(database, 'A');
    addStore(database, 'B');
    const first = pullAll(sync, 'A');
    addProduct(database, 'pb', 'B');
    expect(pullAll(sync, 'A', first.cursor).changes).toEqual([]);
  });

  it('redelivers changes made while a snapshot was running', () => {
    migrate(database);
    addStore(database, 'A');
    addProduct(database, 'p1', 'A');
    addProduct(database, 'p2', 'A');
    const firstPage = sync.pull({ storeId: 'A', limit: 2 });
    database.prepare("UPDATE products SET name = 'Late' WHERE id = 'p1'").run();
    const rest = pullAll(sync, 'A', firstPage.cursor, 2);
    const latest = [...firstPage.changes, ...rest.changes].filter((change) => change.rowId === 'p1').at(-1);
    expect(latest.row.name).toBe('Late');
  });

  it('asks for a new download after the database was restored', () => {
    migrate(database);
    addStore(database, 'A');
    manager.onRestore(() => sync.regenerateEpoch());
    const before = pullAll(sync, 'A');
    const bytes = manager.createBackupBytes();
    manager.restoreFromBytes(bytes);
    expect(() => sync.pull({ storeId: 'A', cursor: before.cursor })).toThrow(expect.objectContaining({ code: 'EPOCH_CHANGED' }));
    expect(pullAll(sync, 'A').changes.map((change) => change.rowId)).toEqual(['A']);
  });

  it('rejects a cursor that is ahead of the log, and garbage cursors', () => {
    migrate(database);
    addStore(database, 'A');
    const { epoch } = pullAll(sync, 'A');
    const ahead = sync.encodeCursor(epoch, { phase: 'log', seq: 9999 });
    expect(() => sync.pull({ storeId: 'A', cursor: ahead })).toThrow(expect.objectContaining({ code: 'CURSOR_AHEAD' }));
    expect(() => sync.pull({ storeId: 'A', cursor: 'not-a-cursor' })).toThrow(expect.objectContaining({ code: 'BAD_CURSOR' }));
  });

  it('rejects a missing store and a bad limit', () => {
    migrate(database);
    expect(() => sync.pull({ storeId: '' })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => sync.pull({ storeId: 'A', limit: 0 })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => sync.pull({ storeId: 'A', limit: 5000 })).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('GET /api/sync/pull', () => {
  let folder;
  let manager;
  let server;
  let url;

  beforeEach(async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-sync-http-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    const getDatabase = () => manager.database;
    const app = createApp({
      sqlService: new SqlService(getDatabase), explorer: new TableExplorer(getDatabase), manager,
      syncService: new SyncService(getDatabase), apiToken: TOKEN, adminToken: 'admin-token-0123456789',
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  const get = (query, token = TOKEN) => fetch(`${url}/api/sync/pull?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('needs the API token', async () => {
    expect((await get('storeId=A', '')).status).toBe(401);
  });
  it('answers 409 NOT_READY while the app has no schema', async () => {
    const response = await get('storeId=A');
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('NOT_READY');
  });
  it('returns the snapshot and then an empty, finished page', async () => {
    migrate(manager.database);
    addStore(manager.database, 'A');
    const first = await (await get('storeId=A')).json();
    expect(first.changes.map((change) => change.rowId)).toEqual(['A']);
    const second = await (await get(`storeId=A&cursor=${first.cursor}`)).json();
    expect(second).toMatchObject({ changes: [], done: true });
  });
  it('answers 400 for a bad limit and a bad cursor', async () => {
    migrate(manager.database);
    expect((await get('storeId=A&limit=abc')).status).toBe(400);
    expect((await get('storeId=A&cursor=zzz')).status).toBe(400);
  });
});
