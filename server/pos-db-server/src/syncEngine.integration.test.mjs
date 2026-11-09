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
import { compareConflict } from '../../../src/sync/conflictPresenter';
import { ServerEndpoints } from '../../../src/db/serverEndpoints';
import { runInitialSync } from '../../../src/sync/initialSync';
import { createSqlJsTestDriver } from '../../../src/sync/sqlJsTestDriver';
import { SyncClient } from '../../../src/sync/syncClient';
import { SyncEngine } from '../../../src/sync/syncEngine';
import { SyncStore } from '../../../src/sync/syncStore';
import { createApp } from './app.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { SyncService } from './syncService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const API_TOKEN = 'integration-token-0123';
const NOW = '2026-11-01T10:00:00.000Z';

/** Two phone databases keeping one store in step with a real server, through the app's own sync code. */
describe('synchronisation rounds against a real server', () => {
  let dataDir;
  let manager;
  let server;
  let url;

  /** Builds a device that finished its first download of store S1. */
  async function createDevice() {
    const driver = await createSqlJsTestDriver();
    for (const migration of [...MIGRATIONS, ...DEVICE_MIGRATIONS]) for (const statement of migration.statements) await driver.exec(statement);
    const store = new SyncStore(driver);
    const client = new SyncClient(new ServerEndpoints({ domainUrl: url, localUrl: '' }), API_TOKEN);
    await store.markInitialSyncPending('S1');
    await runInitialSync(store, client);
    return { driver, store, engine: new SyncEngine(driver, store, client) };
  }

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'pos-engine-'));
    manager = new DatabaseManager(path.join(dataDir, 'pos.db'), path.join(dataDir, 'backups'));
    const getDatabase = () => manager.database;
    for (const migration of MIGRATIONS) for (const statement of migration.statements) manager.database.exec(statement);
    manager.database.prepare('INSERT INTO stores (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('S1', 'Cafe', NOW, NOW);
    manager.database.prepare('INSERT INTO products (id, store_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('p1', 'S1', 'Coffee', NOW, NOW);
    const app = createApp({
      sqlService: new SqlService(getDatabase), explorer: new TableExplorer(getDatabase), manager,
      apiToken: API_TOKEN, adminToken: 'admin-token-integration-01', syncService: new SyncService(getDatabase),
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('gives an order made offline its official number and keeps the temporary code', async () => {
    const device = await createDevice();
    await device.driver.run(`INSERT INTO orders (id, store_id, order_number, temp_order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'TAM-A-1', 'TAM-A-1', 50, ?, ?)`, [NOW, NOW]);
    await device.driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, created_at) VALUES ('i1', 'S1', 'o1', 'p1', 'Coffee', 2, 25, ?)`, [NOW]);

    const result = await device.engine.runOnce();
    expect(result).toMatchObject({ uploaded: 1, conflicts: 0 });

    const onServer = manager.database.prepare("SELECT order_number, temp_order_number FROM orders WHERE id = 'o1'").get();
    expect(onServer).toEqual({ order_number: 'HD00001', temp_order_number: 'TAM-A-1' });
    expect(manager.database.prepare("SELECT COUNT(*) AS total FROM order_items WHERE order_id = 'o1'").get().total).toBe(1);
    const local = (await device.driver.all("SELECT order_number, temp_order_number, rev FROM orders WHERE id = 'o1'"))[0];
    expect(local).toEqual({ order_number: 'HD00001', temp_order_number: 'TAM-A-1', rev: 1 });
    expect(await device.store.pendingCount()).toBe(0);
  });

  it('uploads an edit once and then has nothing left to send', async () => {
    const device = await createDevice();
    await device.driver.run("UPDATE products SET name = 'Espresso' WHERE id = 'p1'");
    expect(await device.engine.runOnce()).toMatchObject({ uploaded: 1 });
    expect(manager.database.prepare("SELECT name, rev FROM products WHERE id = 'p1'").get()).toEqual({ name: 'Espresso', rev: 2 });
    expect(await device.engine.runOnce()).toMatchObject({ uploaded: 0, alreadyKnown: 0, conflicts: 0 });
    expect((await device.driver.all("SELECT rev FROM products WHERE id = 'p1'"))[0].rev).toBe(2);
  });

  it('brings a change of another device down', async () => {
    const first = await createDevice();
    const second = await createDevice();
    await first.driver.run("UPDATE products SET name = 'Latte' WHERE id = 'p1'");
    await first.engine.runOnce();
    const result = await second.engine.runOnce();
    expect(result.downloaded).toBeGreaterThan(0);
    expect((await second.driver.all("SELECT name FROM products WHERE id = 'p1'"))[0].name).toBe('Latte');
    expect(await second.store.pendingCount()).toBe(0);
  });

  it('records a conflict when two devices edit the same row, and shows the server version meanwhile', async () => {
    const first = await createDevice();
    const second = await createDevice();
    await first.driver.run("UPDATE products SET name = 'Latte' WHERE id = 'p1'");
    await second.driver.run("UPDATE products SET name = 'Mocha' WHERE id = 'p1'");
    await first.engine.runOnce();
    const result = await second.engine.runOnce();
    expect(result).toMatchObject({ conflicts: 1, pendingConflicts: 1 });
    expect(manager.database.prepare("SELECT name FROM products WHERE id = 'p1'").get().name).toBe('Latte');
    expect(manager.database.prepare("SELECT COUNT(*) AS total FROM sync_conflicts WHERE status = 'pending'").get().total).toBe(1);
    expect(await second.store.pendingCount()).toBe(0);
    expect((await second.driver.all("SELECT name FROM products WHERE id = 'p1'"))[0].name).toBe('Latte');
  });

  it('replaces the lines of an order as a set', async () => {
    const device = await createDevice();
    await device.driver.run(`INSERT INTO orders (id, store_id, order_number, temp_order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'TAM-A-1', 'TAM-A-1', 50, ?, ?)`, [NOW, NOW]);
    await device.driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, created_at) VALUES ('i1', 'S1', 'o1', 'p1', 'Coffee', 2, 25, ?)`, [NOW]);
    await device.engine.runOnce();
    await device.driver.run("DELETE FROM order_items WHERE order_id = 'o1'");
    await device.driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, created_at) VALUES ('i2', 'S1', 'o1', 'p1', 'Coffee', 1, 25, ?)`, [NOW]);
    await device.engine.runOnce();
    expect(manager.database.prepare("SELECT id FROM order_items WHERE order_id = 'o1'").all().map((row) => row.id)).toEqual(['i2']);
  });

  it('keeps queued edits when the server cannot be reached', async () => {
    const device = await createDevice();
    await device.driver.run("UPDATE products SET name = 'Espresso' WHERE id = 'p1'");
    await new Promise((resolve) => server.close(resolve));
    await expect(device.engine.runOnce()).rejects.toThrow();
    expect(await device.store.pendingCount()).toBe(1);
  });

  it('hands out rising official numbers, and an order numbered online keeps its number when uploaded', async () => {
    const device = await createDevice();
    const client = new SyncClient(new ServerEndpoints({ domainUrl: url, localUrl: '' }), API_TOKEN);
    expect(await client.nextNumber('S1', 'order')).toBe('HD00001');
    const second = await client.nextNumber('S1', 'order');
    expect(second).toBe('HD00002');
    await device.driver.run(`INSERT INTO orders (id, store_id, order_number, temp_order_number, total_amount, created_at, updated_at) VALUES ('o2', 'S1', ?, '', 10, ?, ?)`, [second, NOW, NOW]);
    await device.engine.runOnce();
    expect(manager.database.prepare("SELECT order_number, temp_order_number FROM orders WHERE id = 'o2'").get()).toEqual({ order_number: 'HD00002', temp_order_number: '' });
  });

  it('numbers every kind of document in its own sequence', async () => {
    const client = new SyncClient(new ServerEndpoints({ domainUrl: url, localUrl: '' }), API_TOKEN);
    expect(await client.nextNumber('S1', 'import')).toBe('PNK0001');
    expect(await client.nextNumber('S1', 'export')).toBe('PXK0001');
    expect(await client.nextNumber('S1', 'receipt')).toBe('PT0001');
    expect(await client.nextNumber('S1', 'payment')).toBe('PC0001');
    expect(await client.nextNumber('S1', 'stocktake')).toBe('KK0001');
    await expect(client.nextNumber('S1', 'nonsense')).rejects.toThrow(/kind must be one of/);
  });

  it('tells which tables changed, so the screens know what to reload', async () => {
    const first = await createDevice();
    const second = await createDevice();
    await first.driver.run(`INSERT INTO orders (id, store_id, order_number, temp_order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'TAM-A-1', 'TAM-A-1', 50, ?, ?)`, [NOW, NOW]);
    // The device that made the order learns its official number.
    expect((await first.engine.runOnce()).changedTables).toEqual(['orders']);
    // The other device downloads it.
    expect((await second.engine.runOnce()).changedTables).toEqual(['orders']);
    // Nothing new: nothing to reload.
    expect((await second.engine.runOnce()).changedTables).toEqual([]);
  });

  it('uploads queued edits and then reports a restored server database with its error code', async () => {
    const device = await createDevice();
    await device.driver.run("UPDATE products SET name = 'Espresso' WHERE id = 'p1'");
    new SyncService(() => manager.database).regenerateEpoch();
    await expect(device.engine.runOnce()).rejects.toMatchObject({ code: 'EPOCH_CHANGED' });
    expect(await device.store.pendingCount()).toBe(0);
  });

  /** Two devices edit the name of product p1 differently; the second one's edit becomes a conflict. */
  async function makeConflict() {
    const first = await createDevice();
    const second = await createDevice();
    await first.driver.run("UPDATE products SET name = 'Latte' WHERE id = 'p1'");
    await second.driver.run("UPDATE products SET name = 'Mocha' WHERE id = 'p1'");
    await first.engine.runOnce();
    await second.engine.runOnce();
    const client = new SyncClient(new ServerEndpoints({ domainUrl: url, localUrl: '' }), API_TOKEN);
    const [summary] = await client.listConflicts('S1', 'pending');
    return { first, second, client, summary };
  }

  it('lists a conflict and shows both versions in words', async () => {
    const { client, summary } = await makeConflict();
    expect(summary).toMatchObject({ table: 'products', rowId: 'p1', status: 'pending' });
    const comparison = compareConflict(await client.getConflict(summary.id));
    expect(comparison).toMatchObject({ tableLabel: 'Món / hàng hóa', rowLabel: 'Latte', serverRemoved: false });
    expect(comparison.fields).toEqual([{ column: 'name', label: 'Tên', serverValue: 'Latte', deviceValue: 'Mocha' }]);
  });

  it("stores the device's version when a manager chooses it, and moves the conflict to the resolved list", async () => {
    const { first, second, client, summary } = await makeConflict();
    await client.resolveConflict(summary.id, 'device', 'Lan');
    expect(manager.database.prepare("SELECT name FROM products WHERE id = 'p1'").get().name).toBe('Mocha');
    expect(await client.listConflicts('S1', 'pending')).toEqual([]);
    expect(await client.listConflicts('S1', 'resolved')).toMatchObject([{ id: summary.id, resolution: 'device', resolvedBy: 'Lan' }]);
    // Both devices receive the result in their next round.
    await first.engine.runOnce();
    await second.engine.runOnce();
    expect((await first.driver.all("SELECT name FROM products WHERE id = 'p1'"))[0].name).toBe('Mocha');
    expect((await second.driver.all("SELECT name FROM products WHERE id = 'p1'"))[0].name).toBe('Mocha');
  });

  it('keeps the server data when a manager chooses it, and every device downloads it again', async () => {
    const { first, second, client, summary } = await makeConflict();
    await client.resolveConflict(summary.id, 'server', 'Lan');
    expect(manager.database.prepare("SELECT name FROM products WHERE id = 'p1'").get().name).toBe('Latte');
    expect((await second.engine.runOnce()).changedTables).toContain('products');
    expect((await second.driver.all("SELECT name FROM products WHERE id = 'p1'"))[0].name).toBe('Latte');
    expect((await first.driver.all("SELECT name FROM products WHERE id = 'p1'"))[0].name).toBe('Latte');
  });

  it('refuses to resolve on stale data, refreshes the server version and refuses a second resolution', async () => {
    const { client, summary } = await makeConflict();
    manager.database.prepare("UPDATE products SET name = 'Cortado', rev = rev + 1 WHERE id = 'p1'").run();
    await expect(client.resolveConflict(summary.id, 'device', 'Lan')).rejects.toMatchObject({ code: 'CONFLICT_STALE' });
    expect(compareConflict(await client.getConflict(summary.id)).fields[0].serverValue).toBe('Cortado');
    await client.resolveConflict(summary.id, 'server', 'Lan');
    await expect(client.resolveConflict(summary.id, 'server', 'Lan')).rejects.toMatchObject({ code: 'NOT_PENDING' });
  });
});

