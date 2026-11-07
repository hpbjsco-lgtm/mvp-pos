/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_MIGRATIONS } from '../../../src/db/deviceSchema';
import { MIGRATIONS } from '../../../src/db/schema';
import { ServerEndpoints } from '../../../src/db/serverEndpoints';
import { runInitialSync } from '../../../src/sync/initialSync';
import { createSqlJsTestDriver } from '../../../src/sync/sqlJsTestDriver';
import { SyncClient } from '../../../src/sync/syncClient';
import { SyncStore } from '../../../src/sync/syncStore';
import { createApp } from './app.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { SyncService } from './syncService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const API_TOKEN = 'integration-token-0123';
const NOW = '2026-11-01T10:00:00.000Z';

/** A phone database of the app's real schema, with the first download pending for store S1. */
async function createDevice() {
  const driver = await createSqlJsTestDriver();
  for (const migration of [...MIGRATIONS, ...DEVICE_MIGRATIONS]) for (const statement of migration.statements) await driver.exec(statement);
  const store = new SyncStore(driver);
  await store.markInitialSyncPending('S1');
  return { driver, store };
}

/** Downloads a store from a real server into a phone database, through the app's own client. */
describe('first download from a real server', () => {
  let dataDir;
  let manager;
  let server;
  let client;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'pos-initial-sync-'));
    manager = new DatabaseManager(path.join(dataDir, 'pos.db'), path.join(dataDir, 'backups'));
    const getDatabase = () => manager.database;
    for (const migration of MIGRATIONS) for (const statement of migration.statements) manager.database.exec(statement);
    const insert = manager.database.prepare('INSERT INTO stores (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)');
    insert.run('S1', 'Cafe Mot', NOW, NOW);
    insert.run('S2', 'Cafe Hai', NOW, NOW);
    const product = manager.database.prepare('INSERT INTO products (id, store_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    for (let index = 0; index < 25; index += 1) product.run(`p${String(index).padStart(2, '0')}`, 'S1', `Item ${index}`, NOW, NOW);
    product.run('other', 'S2', 'Not mine', NOW, NOW);
    manager.database.prepare("INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'HD1', 10, ?, ?)").run(NOW, NOW);
    manager.database.prepare("INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, created_at) VALUES ('i1', 'S1', 'o1', 'p00', 'Item 0', 1, 10, ?)").run(NOW);

    const app = createApp({
      sqlService: new SqlService(getDatabase),
      explorer: new TableExplorer(getDatabase),
      manager,
      apiToken: API_TOKEN,
      adminToken: 'admin-token-integration-01',
      syncService: new SyncService(getDatabase),
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    client = new SyncClient(new ServerEndpoints({ domainUrl: `http://127.0.0.1:${server.address().port}`, localUrl: '' }), API_TOKEN);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('lists the stores to choose from', async () => {
    expect(await client.listStores()).toEqual([{ id: 'S2', name: 'Cafe Hai' }, { id: 'S1', name: 'Cafe Mot' }]);
  });

  it('copies one store, and only that store, to the device', async () => {
    const { driver, store } = await createDevice();
    await runInitialSync(store, client);
    expect((await driver.all('SELECT id FROM stores')).map((row) => row.id)).toEqual(['S1']);
    expect(await driver.all('SELECT id FROM products')).toHaveLength(25);
    expect(await driver.all('SELECT id FROM order_items')).toHaveLength(1);
    expect(await store.getState('initialSync')).toBe('done');
    expect(await store.getBaseRev('orders', 'o1')).toBe(1);
    expect(await store.pendingCount()).toBe(0);
  });

  it('makes later local edits visible to the upload queue', async () => {
    const { driver, store } = await createDevice();
    await runInitialSync(store, client);
    await driver.run("UPDATE products SET name = 'Renamed' WHERE id = 'p01'");
    expect((await store.listPending()).map((entry) => `${entry.tableName}:${entry.rowId}`)).toEqual(['products:p01']);
  });

  it('reports a wrong token in words', async () => {
    const bad = new SyncClient(new ServerEndpoints({ domainUrl: `http://127.0.0.1:${server.address().port}`, localUrl: '' }), 'wrong-token-0123456');
    await expect(bad.listStores()).rejects.toThrow('mã API');
  });
});
