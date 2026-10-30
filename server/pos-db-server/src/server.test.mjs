/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { openDatabase, SqlService } from './sqlService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const TOKEN = 'test-token-0123456789';
const ADMIN_TOKEN = 'admin-token-0123456789';

describe('loadConfig', () => {
  it('rejects a missing or short API token', () => {
    expect(() => loadConfig({})).toThrow('API_TOKEN');
    expect(() => loadConfig({ API_TOKEN: 'short' })).toThrow('API_TOKEN');
  });

  it('requires a different admin token', () => {
    expect(() => loadConfig({ API_TOKEN: TOKEN })).toThrow('ADMIN_TOKEN');
    expect(() => loadConfig({ API_TOKEN: TOKEN, ADMIN_TOKEN: TOKEN })).toThrow('different');
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ API_TOKEN: TOKEN, ADMIN_TOKEN, PORT: 'abc' })).toThrow('PORT');
  });

  it('uses defaults and resolves the database file inside the data folder', () => {
    const config = loadConfig({ API_TOKEN: TOKEN, ADMIN_TOKEN, DATA_DIR: '/var/lib/mvp-pos' });
    expect(config.port).toBe(8790);
    expect(config.host).toBe('127.0.0.1');
    expect(config.backupDir.replace(/\\/g, '/')).toMatch(/\/var\/lib\/mvp-pos\/backups$/);
    expect(config.databaseFile.replace(/\\/g, '/')).toMatch(/\/var\/lib\/mvp-pos\/pos\.db$/);
  });
});

describe('SqlService', () => {
  let database;
  let service;

  beforeEach(() => {
    database = openDatabase(':memory:');
    service = new SqlService(() => database);
    service.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER)');
  });

  afterEach(() => database.close());

  it('writes with parameters and reads rows back', () => {
    service.run('INSERT INTO items (id, name, active) VALUES (?, ?, ?)', [1, 'Coffee', true]);
    expect(service.all('SELECT * FROM items WHERE id = ?', [1])).toEqual([{ id: 1, name: 'Coffee', active: 1 }]);
  });

  it('stores null for undefined and null parameters', () => {
    service.run('INSERT INTO items (id, name, active) VALUES (?, ?, ?)', [1, 'Tea', undefined]);
    expect(service.all('SELECT active FROM items')).toEqual([{ active: null }]);
  });

  it('rejects object parameters', () => {
    expect(() => service.run('INSERT INTO items (id, name) VALUES (?, ?)', [1, { a: 1 }])).toThrow('params may only hold');
  });

  it('applies a batch in one transaction and rolls back on failure', () => {
    service.batch([
      { sql: 'INSERT INTO items (id, name) VALUES (?, ?)', params: [1, 'A'] },
      { sql: 'INSERT INTO items (id, name) VALUES (?, ?)', params: [2, 'B'] },
    ]);
    expect(service.all('SELECT COUNT(*) AS total FROM items')).toEqual([{ total: 2 }]);

    expect(() => service.batch([
      { sql: 'INSERT INTO items (id, name) VALUES (?, ?)', params: [3, 'C'] },
      { sql: 'INSERT INTO items (id, name) VALUES (?, ?)', params: [3, 'duplicate id'] },
    ])).toThrow();
    expect(service.all('SELECT COUNT(*) AS total FROM items')).toEqual([{ total: 2 }]);
  });

  it('rejects statements that could reach other files', () => {
    expect(() => service.exec("ATTACH DATABASE '/tmp/other.db' AS other")).toThrow('not allowed');
    expect(() => service.all("VACUUM INTO '/tmp/copy.db'")).toThrow('not allowed');
    expect(() => service.all("SELECT load_extension('x')")).toThrow('not allowed');
  });

  it('rejects empty SQL', () => {
    expect(() => service.run('  ')).toThrow('SQL text is required');
  });
});

describe('HTTP API', () => {
  let dataDir;
  let manager;
  let server;
  let baseUrl;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'pos-db-test-'));
    manager = new DatabaseManager(path.join(dataDir, 'pos.db'), path.join(dataDir, 'backups'));
    const getDatabase = () => manager.database;
    const app = createApp({
      sqlService: new SqlService(getDatabase),
      explorer: new TableExplorer(getDatabase),
      manager,
      apiToken: TOKEN,
      adminToken: ADMIN_TOKEN,
    });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Sends a JSON POST to the test server, with the valid token unless another header is given. */
  const post = (path, body, authorization = `Bearer ${TOKEN}`) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify(body),
    });

  it('answers the health check without a token', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });

  it('rejects calls without a token or with a wrong one', async () => {
    expect((await post('/api/sql', { action: 'all', sql: 'SELECT 1' }, '')).status).toBe(401);
    expect((await post('/api/sql', { action: 'all', sql: 'SELECT 1' }, 'Bearer wrong-token-value')).status).toBe(401);
    expect((await post('/api/batch', { statements: [] }, '')).status).toBe(401);
  });

  it('creates a table, writes and reads through /api/sql', async () => {
    expect((await post('/api/sql', { action: 'exec', sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)' })).status).toBe(200);
    expect((await post('/api/sql', { action: 'run', sql: 'INSERT INTO t (id, v) VALUES (?, ?)', params: [1, 'x'] })).status).toBe(200);
    const response = await post('/api/sql', { action: 'all', sql: 'SELECT * FROM t' });
    expect(await response.json()).toEqual({ ok: true, rows: [{ id: 1, v: 'x' }] });
  });

  it('returns 400 with the SQLite message on a bad statement', async () => {
    const response = await post('/api/sql', { action: 'all', sql: 'SELECT * FROM missing_table' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('missing_table');
  });

  it('rejects an unknown action', async () => {
    expect((await post('/api/sql', { action: 'drop', sql: 'SELECT 1' })).status).toBe(400);
  });

  it('applies /api/batch atomically', async () => {
    await post('/api/sql', { action: 'exec', sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' });
    const failed = await post('/api/batch', {
      statements: [
        { sql: 'INSERT INTO t (id) VALUES (?)', params: [1] },
        { sql: 'INSERT INTO t (id) VALUES (?)', params: [1] },
      ],
    });
    expect(failed.status).toBe(400);
    const rows = await (await post('/api/sql', { action: 'all', sql: 'SELECT COUNT(*) AS total FROM t' })).json();
    expect(rows.rows).toEqual([{ total: 0 }]);
  });

  it('rejects a batch body that is not an array', async () => {
    expect((await post('/api/batch', { statements: 'nope' })).status).toBe(400);
  });
});

describe('Admin API', () => {
  let dataDir;
  let manager;
  let server;
  let baseUrl;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'pos-admin-test-'));
    manager = new DatabaseManager(path.join(dataDir, 'pos.db'), path.join(dataDir, 'backups'));
    const getDatabase = () => manager.database;
    const sqlService = new SqlService(getDatabase);
    sqlService.exec(`
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER, photo BLOB);
      CREATE TABLE notes (text TEXT);
      CREATE TABLE order_lines (order_id TEXT, line_no INTEGER, qty INTEGER, PRIMARY KEY (order_id, line_no));
    `);
    sqlService.run('INSERT INTO products (id, name, price) VALUES (?, ?, ?)', ['p1', 'Coffee', 25000]);
    sqlService.run('INSERT INTO products (id, name, price) VALUES (?, ?, ?)', ['p2', 'Tea', 20000]);
    sqlService.run('INSERT INTO products (id, name, price, photo) VALUES (?, ?, ?, ?)', ['p3', 'Long text ' + 'x'.repeat(400), 1, null]);
    const app = createApp({
      sqlService,
      explorer: new TableExplorer(getDatabase),
      manager,
      apiToken: TOKEN,
      adminToken: ADMIN_TOKEN,
    });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const call = (route, options = {}, authorization = `Bearer ${ADMIN_TOKEN}`) =>
    fetch(`${baseUrl}/admin/api${route}`, {
      ...options,
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...(options.headers || {}) },
    });
  const callJson = (method, route, body) =>
    call(route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('requires the admin token, and the API token is not enough', async () => {
    expect((await call('/tables', {}, '')).status).toBe(401);
    expect((await call('/tables', {}, `Bearer ${TOKEN}`)).status).toBe(401);
  });

  it('serves the admin page without data', async () => {
    const response = await fetch(`${baseUrl}/admin/db`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Quản lý cơ sở dữ liệu');
  });

  it('lists tables with row counts', async () => {
    const { tables } = await (await call('/tables')).json();
    expect(tables).toEqual([
      { name: 'notes', rowCount: 0 },
      { name: 'order_lines', rowCount: 0 },
      { name: 'products', rowCount: 3 },
    ]);
  });

  it('reads a page with columns, keys, cut long text and search', async () => {
    const page = await (await call('/tables/products')).json();
    expect(page.primaryKey).toEqual(['id']);
    expect(page.total).toBe(3);
    expect(page.rows[0].__key).toEqual({ id: 'p1' });
    expect(page.rows[2].name).toContain('characters)');

    const found = await (await call('/tables/products?search=Tea')).json();
    expect(found.total).toBe(1);
    expect(found.rows[0].id).toBe('p2');
  });

  it('returns the full text of one row', async () => {
    const response = await call(`/tables/products/row?key=${encodeURIComponent(JSON.stringify({ id: 'p3' }))}`);
    expect((await response.json()).row.name).toHaveLength('Long text '.length + 400);
  });

  it('rejects unknown tables and unknown columns', async () => {
    expect((await call('/tables/nope')).status).toBe(400);
    expect((await call('/tables/sqlite_master')).status).toBe(400);
    expect((await call('/tables/products?search=x')).status).toBe(200);
    const bad = await callJson('POST', '/tables/products/rows', { values: { 'name"; DROP TABLE products; --': 'x' } });
    expect(bad.status).toBe(400);
    expect((await (await call('/tables')).json()).tables.find((t) => t.name === 'products').rowCount).toBe(3);
  });

  it('inserts, updates and deletes a row by primary key', async () => {
    expect((await callJson('POST', '/tables/products/rows', { values: { id: 'p9', name: 'Juice', price: 30000 } })).status).toBe(200);
    expect((await callJson('PUT', '/tables/products/rows', { key: { id: 'p9' }, values: { price: 35000, photo: null } })).status).toBe(200);
    const row = (await (await call(`/tables/products/row?key=${encodeURIComponent(JSON.stringify({ id: 'p9' }))}`)).json()).row;
    expect(row.price).toBe(35000);
    expect((await callJson('DELETE', '/tables/products/rows', { key: { id: 'p9' } })).status).toBe(200);
    expect((await call(`/tables/products/row?key=${encodeURIComponent(JSON.stringify({ id: 'p9' }))}`)).status).toBe(404);
  });

  it('addresses rows of a table without primary key by rowid', async () => {
    await callJson('POST', '/tables/notes/rows', { values: { text: 'first' } });
    const page = await (await call('/tables/notes')).json();
    expect(page.primaryKey).toEqual([]);
    const key = page.rows[0].__key;
    expect(key).toHaveProperty('__rowid__');
    await callJson('PUT', '/tables/notes/rows', { key, values: { text: 'edited' } });
    expect((await (await call('/tables/notes')).json()).rows[0].text).toBe('edited');
  });

  it('supports composite primary keys and refuses an incomplete key', async () => {
    await callJson('POST', '/tables/order_lines/rows', { values: { order_id: 'o1', line_no: 1, qty: 2 } });
    expect((await callJson('PUT', '/tables/order_lines/rows', { key: { order_id: 'o1' }, values: { qty: 5 } })).status).toBe(400);
    expect((await callJson('PUT', '/tables/order_lines/rows', { key: { order_id: 'o1', line_no: 1 }, values: { qty: 5 } })).status).toBe(200);
  });

  it('reports a database constraint error as 400', async () => {
    const response = await callJson('POST', '/tables/products/rows', { values: { id: 'p1', name: 'duplicate' } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/UNIQUE/i);
  });

  it('downloads a backup that restores into a database with the same data', async () => {
    const bytes = Buffer.from(await (await call('/backup')).arrayBuffer());
    expect(bytes.subarray(0, 15).toString('latin1')).toBe('SQLite format 3');

    await callJson('DELETE', '/tables/products/rows', { key: { id: 'p1' } });
    const restored = await call('/restore', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    expect(restored.status).toBe(200);
    expect((await restored.json()).previousDataSavedAs).toMatch(/^pos-before-restore-.*\.db$/);
    expect((await (await call('/tables/products')).json()).total).toBe(3);
  });

  it('refuses to restore a file that is not a SQLite database and keeps the data', async () => {
    const response = await call('/restore', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('not a database at all, just text') });
    expect(response.status).toBe(400);
    expect((await (await call('/tables/products')).json()).total).toBe(3);
  });
});
