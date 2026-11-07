/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildOutboxTriggers, CHILD_TABLE_PARENTS, DEVICE_MIGRATIONS, expectedOutboxTriggerCount, verifyDeviceSyncSchema } from '../db/deviceSchema';
import type { SqlDriver } from '../db/driver';
import { MIGRATIONS, SCHEMA_VERSION, SYNCED_TABLES } from '../db/schema';
import { SyncStore } from './syncStore';
import { createSqlJsTestDriver } from './sqlJsTestDriver';

/** Builds a device database: shared migrations, then device migrations. */
async function createDeviceDatabase(): Promise<SqlDriver> {
  const driver = await createSqlJsTestDriver();
  for (const migration of [...MIGRATIONS, ...DEVICE_MIGRATIONS]) {
    for (const statement of migration.statements) await driver.exec(statement);
  }
  return driver;
}

const insertOrder = (driver: SqlDriver, id: string, storeId = 'store-1') =>
  driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES (?, ?, 'HD1', 100, 'now', 'now')`, [id, storeId]);

describe('device schema', () => {
  it('has one version per shared migration and device versions that do not collide', () => {
    expect(MIGRATIONS[MIGRATIONS.length - 1].version).toBe(SCHEMA_VERSION);
    const versions = [...MIGRATIONS, ...DEVICE_MIGRATIONS].map(migration => migration.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('drops the old sync tables and creates the new ones', async () => {
    const driver = await createDeviceDatabase();
    const columns = await driver.all<{ name: string }>('PRAGMA table_info(sync_outbox)');
    expect(columns.map(column => column.name)).toEqual(['table_name', 'row_id', 'store_id', 'change_count', 'queued_at']);
  });

  it('installs the expected triggers and verifies them', async () => {
    const driver = await createDeviceDatabase();
    await expect(verifyDeviceSyncSchema(driver)).resolves.toBeUndefined();
    const children = Object.keys(CHILD_TABLE_PARENTS).length;
    expect(expectedOutboxTriggerCount()).toBe((SYNCED_TABLES.length - children) * 2 + children * 3);
  });

  it('fails loudly when a trigger is missing', async () => {
    const driver = await createDeviceDatabase();
    await driver.exec('DROP TRIGGER outbox_orders_au');
    await expect(verifyDeviceSyncSchema(driver)).rejects.toThrow(/change-tracking triggers/);
  });

  it('shapes every trigger the way the phone SQLite plugin can split it', () => {
    for (const trigger of buildOutboxTriggers()) {
      // One statement in the body, END on its own line, a line break after END; and no comment or lower case "end;"
      expect(trigger.endsWith('\nEND;\n')).toBe(true);
      expect(trigger.split(';\n')).toHaveLength(3);
      expect(trigger).not.toContain('--');
      expect(trigger).not.toContain('end;');
    }
  });
});

describe('change tracking triggers', () => {
  let driver: SqlDriver;
  let store: SyncStore;

  beforeEach(async () => {
    driver = await createDeviceDatabase();
    store = new SyncStore(driver);
  });

  it('queues a record once and counts repeated changes', async () => {
    await insertOrder(driver, 'o1');
    await driver.run(`UPDATE orders SET total_amount = 200 WHERE id = 'o1'`);
    const pending = await store.listPending();
    expect(pending).toEqual([{ tableName: 'orders', rowId: 'o1', storeId: 'store-1', changeCount: 2 }]);
  });

  it('queues the parent when a child row changes', async () => {
    await insertOrder(driver, 'o1');
    await store.removeUploaded(await store.listPending());
    await driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, created_at) VALUES ('i1', 'store-1', 'o1', 'p1', 'Tea', 1, 10, 'now')`);
    expect((await store.listPending()).map(entry => `${entry.tableName}:${entry.rowId}`)).toEqual(['orders:o1']);
    await store.removeUploaded(await store.listPending());
    await driver.run(`DELETE FROM order_items WHERE order_id = 'o1'`);
    expect((await store.listPending()).map(entry => `${entry.tableName}:${entry.rowId}`)).toEqual(['orders:o1']);
  });

  it('lists parents before the tables that refer to them', async () => {
    await insertOrder(driver, 'o1');
    await driver.run(`INSERT INTO stores (id, name, created_at, updated_at) VALUES ('store-1', 'Cafe', 'now', 'now')`);
    const tables = (await store.listPending()).map(entry => entry.tableName);
    expect(tables).toEqual(['stores', 'orders']);
  });

  it('keeps an entry whose record changed again during the upload', async () => {
    await insertOrder(driver, 'o1');
    const [entry] = await store.listPending();
    await driver.run(`UPDATE orders SET total_amount = 300 WHERE id = 'o1'`);
    await store.removeUploaded([entry]);
    expect(await store.pendingCount()).toBe(1);
    await store.removeUploaded(await store.listPending());
    expect(await store.pendingCount()).toBe(0);
  });

  it('does not queue rows written while applying server data, and turns the switch off again', async () => {
    await store.applyRemote([
      { sql: `INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o9', 'store-1', 'HD9', 5, 'now', 'now')` },
      SyncStore.baseRevStatement('orders', 'o9', 4),
    ]);
    expect(await store.pendingCount()).toBe(0);
    expect(await store.getBaseRev('orders', 'o9')).toBe(4);
    expect(await store.getState('applying')).toBe('0');
    await driver.run(`UPDATE orders SET total_amount = 6 WHERE id = 'o9'`);
    expect(await store.pendingCount()).toBe(1);
  });

  it('turns the switch off when applying fails, because nothing is written', async () => {
    await expect(store.applyRemote([{ sql: 'INSERT INTO missing_table VALUES (1)' }])).rejects.toThrow();
    expect(await store.getState('applying')).not.toBe('1');
  });
});

describe('SyncStore state', () => {
  it('creates the device id once and keeps it', async () => {
    const store = new SyncStore(await createDeviceDatabase());
    const first = await store.getDeviceId();
    expect(first).toMatch(/^device-/);
    expect(await store.getDeviceId()).toBe(first);
  });

  it('returns null for an unknown record base version', async () => {
    const store = new SyncStore(await createDeviceDatabase());
    expect(await store.getBaseRev('orders', 'none')).toBeNull();
  });
});
