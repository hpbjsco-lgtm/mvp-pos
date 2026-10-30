/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RemoteSqlDriver } from '../../../src/db/remoteDriver';
import { MIGRATIONS, SCHEMA_VERSION } from '../../../src/db/schema';
import { createApp } from './app.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const API_TOKEN = 'integration-token-0123';

/** Runs the app's RemoteSqlDriver against a real database server started on a random port. */
describe('RemoteSqlDriver with a real server', () => {
  let dataDir;
  let manager;
  let server;
  let url;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'pos-remote-test-'));
    manager = new DatabaseManager(path.join(dataDir, 'pos.db'), path.join(dataDir, 'backups'));
    const getDatabase = () => manager.database;
    const app = createApp({
      sqlService: new SqlService(getDatabase),
      explorer: new TableExplorer(getDatabase),
      manager,
      apiToken: API_TOKEN,
      adminToken: 'admin-token-integration-01',
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('runs the same calls the app makes: exec, run, all and batch', async () => {
    const driver = new RemoteSqlDriver({ url, token: API_TOKEN });
    await driver.exec('CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, price INTEGER, is_active INTEGER)');
    await driver.run('INSERT INTO products VALUES (?, ?, ?, ?)', ['p1', 'Coffee', 25000, true]);
    await driver.batch([
      { sql: 'INSERT INTO products VALUES (?, ?, ?, ?)', params: ['p2', 'Tea', 20000, 0] },
      { sql: 'UPDATE products SET price = ? WHERE id = ?', params: [27000, 'p1'] },
    ]);
    const rows = await driver.all('SELECT id, price, is_active FROM products ORDER BY id');
    expect(rows).toEqual([
      { id: 'p1', price: 27000, is_active: 1 },
      { id: 'p2', price: 20000, is_active: 0 },
    ]);
  });

  it('applies every real schema migration of the app through the server', async () => {
    const driver = new RemoteSqlDriver({ url, token: API_TOKEN });
    for (const migration of MIGRATIONS) {
      for (const statement of migration.statements) await driver.exec(statement);
    }
    const tables = await driver.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    expect(MIGRATIONS[MIGRATIONS.length - 1].version).toBe(SCHEMA_VERSION);
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(['products', 'orders', 'users', 'stores']));
  });

  it('rolls a failing batch back completely', async () => {
    const driver = new RemoteSqlDriver({ url, token: API_TOKEN });
    await driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await expect(driver.batch([
      { sql: 'INSERT INTO t (id) VALUES (?)', params: [1] },
      { sql: 'INSERT INTO t (id) VALUES (?)', params: [1] },
    ])).rejects.toThrow(/UNIQUE/i);
    expect(await driver.all('SELECT * FROM t')).toEqual([]);
  });

  it('reports a wrong token with a readable message', async () => {
    const driver = new RemoteSqlDriver({ url, token: 'wrong-token-0123456' });
    await expect(driver.all('SELECT 1')).rejects.toThrow('mã API');
  });

  it('reports an unreachable server with its address', async () => {
    const driver = new RemoteSqlDriver({ url: 'http://127.0.0.1:1', token: API_TOKEN });
    await expect(driver.all('SELECT 1')).rejects.toThrow('Không kết nối được máy chủ dữ liệu (http://127.0.0.1:1)');
  });
});
