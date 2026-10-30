/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { openDatabase, SqlService } from './sqlService.mjs';

const TOKEN = 'test-token-0123456789';

describe('loadConfig', () => {
  it('rejects a missing or short API token', () => {
    expect(() => loadConfig({})).toThrow('API_TOKEN');
    expect(() => loadConfig({ API_TOKEN: 'short' })).toThrow('API_TOKEN');
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ API_TOKEN: TOKEN, PORT: 'abc' })).toThrow('PORT');
  });

  it('uses defaults and resolves the database file inside the data folder', () => {
    const config = loadConfig({ API_TOKEN: TOKEN, DATA_DIR: '/var/lib/mvp-pos' });
    expect(config.port).toBe(8790);
    expect(config.host).toBe('127.0.0.1');
    expect(config.databaseFile.replace(/\\/g, '/')).toMatch(/\/var\/lib\/mvp-pos\/pos\.db$/);
  });
});

describe('SqlService', () => {
  let database;
  let service;

  beforeEach(() => {
    database = openDatabase(':memory:');
    service = new SqlService(database);
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
  let database;
  let server;
  let baseUrl;

  beforeEach(async () => {
    database = openDatabase(':memory:');
    const app = createApp({ sqlService: new SqlService(database), apiToken: TOKEN });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
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
