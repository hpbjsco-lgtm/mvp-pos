/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_MIGRATIONS } from '../db/deviceSchema';
import type { SqlDriver } from '../db/driver';
import { MIGRATIONS } from '../db/schema';
import { runInitialSync } from './initialSync';
import { buildPullStatements } from './pullApplier';
import { SyncRequestError, type PullChange, type PullPage, type PullSource } from './syncClient';
import { createSqlJsTestDriver } from './sqlJsTestDriver';
import { SyncStore } from './syncStore';

const NOW = '2026-11-01T10:00:00.000Z';

const storeChange = (id: string, name = 'Cafe'): PullChange => ({
  table: 'stores', rowId: id, op: 'upsert',
  row: { id, name, created_at: NOW, updated_at: NOW, rev: 3 },
});
const orderChange = (id: string, storeId = 'S1'): PullChange => ({
  table: 'orders', rowId: id, op: 'upsert',
  row: { id, store_id: storeId, order_number: `HD-${id}`, total_amount: 10, created_at: NOW, updated_at: NOW, rev: 2 },
});
const itemChange = (id: string, orderId: string): PullChange => ({
  table: 'order_items', rowId: id, op: 'upsert',
  row: { id, store_id: 'S1', order_id: orderId, product_id: 'p', product_name: 'Tea', quantity: 1, price: 10, created_at: NOW },
});

/** Pull source that serves prepared pages and records the cursors it was asked for. */
function pagesSource(pages: PullPage[]): PullSource & { cursors: Array<string | null> } {
  const cursors: Array<string | null> = [];
  let index = 0;
  return { cursors, async pull(_storeId, cursor) { cursors.push(cursor); return pages[index++]; } };
}
const page = (changes: PullChange[], cursor: string, done: boolean): PullPage => ({ epoch: 'E1', cursor, changes, done, pendingConflicts: 0 });

async function createDevice(): Promise<{ driver: SqlDriver; store: SyncStore }> {
  const driver = await createSqlJsTestDriver();
  for (const migration of [...MIGRATIONS, ...DEVICE_MIGRATIONS]) for (const statement of migration.statements) await driver.exec(statement);
  const store = new SyncStore(driver);
  await store.markInitialSyncPending('S1');
  return { driver, store };
}

describe('buildPullStatements', () => {
  it('writes parents before children and remembers the row version', async () => {
    const { driver, store } = await createDevice();
    await store.applyRemote(buildPullStatements([itemChange('i1', 'o1'), orderChange('o1'), storeChange('S1')]));
    expect((await driver.all('SELECT id FROM order_items')).length).toBe(1);
    expect(await store.getBaseRev('orders', 'o1')).toBe(2);
    expect(await store.getBaseRev('stores', 'S1')).toBe(3);
    expect(await store.pendingCount()).toBe(0);
  });

  it('updates an existing row and deletes rows, children before parents', async () => {
    const { driver, store } = await createDevice();
    await store.applyRemote(buildPullStatements([storeChange('S1'), orderChange('o1'), itemChange('i1', 'o1')]));
    const changed = { ...orderChange('o1'), row: { ...orderChange('o1').row!, total_amount: 99, rev: 5 } };
    await store.applyRemote(buildPullStatements([changed, { table: 'order_items', rowId: 'i1', op: 'delete' }]));
    expect((await driver.all<{ total_amount: number }>('SELECT total_amount FROM orders'))[0].total_amount).toBe(99);
    expect(await driver.all('SELECT id FROM order_items')).toEqual([]);
    expect(await store.getBaseRev('orders', 'o1')).toBe(5);
  });

  it('leaves out records with a pending local edit', () => {
    const statements = buildPullStatements([orderChange('o1'), orderChange('o2')], new Set(['orders:o1']));
    expect(statements.some(statement => statement.params?.includes('o1'))).toBe(false);
    expect(statements.some(statement => statement.params?.includes('o2'))).toBe(true);
  });

  it('refuses unknown tables and column names that are not identifiers', () => {
    expect(() => buildPullStatements([{ table: 'sqlite_master', rowId: 'x', op: 'delete' }])).toThrow(/does not synchronise/);
    expect(() => buildPullStatements([{ table: 'orders', rowId: 'x', op: 'upsert', row: { 'id) VALUES (1); --': 1 } }])).toThrow(/invalid column name/);
  });
});

describe('runInitialSync', () => {
  let driver: SqlDriver;
  let store: SyncStore;

  beforeEach(async () => { ({ driver, store } = await createDevice()); });

  it('wipes old data, downloads all pages and marks the download done', async () => {
    await driver.run(`INSERT INTO stores (id, name, created_at, updated_at) VALUES ('OLD', 'Old', 'now', 'now')`);
    const source = pagesSource([page([storeChange('S1')], 'c1', false), page([orderChange('o1'), itemChange('i1', 'o1')], 'c2', true)]);
    const progress: number[] = [];
    await runInitialSync(store, source, p => progress.push(p.downloaded));
    expect((await driver.all<{ id: string }>('SELECT id FROM stores')).map(row => row.id)).toEqual(['S1']);
    expect(await driver.all('SELECT id FROM order_items')).toHaveLength(1);
    expect(await store.getState('initialSync')).toBe('done');
    expect(await store.getState('cursor')).toBe('c2');
    expect(await store.pendingCount()).toBe(0);
    expect(progress).toEqual([1, 3]);
    expect(source.cursors).toEqual([null, 'c1']);
  });

  it('resumes from the saved position without wiping again', async () => {
    const first = pagesSource([page([storeChange('S1')], 'c1', false)]);
    const failing: PullSource = { async pull(storeId, cursor) { if (cursor === null) return first.pull(storeId, cursor); throw new Error('network down'); } };
    await expect(runInitialSync(store, failing)).rejects.toThrow('network down');
    expect(await store.getState('initialSync')).toBe('pending');
    expect(await store.getState('cursor')).toBe('c1');

    const second = pagesSource([page([orderChange('o1')], 'c2', true)]);
    await runInitialSync(store, second);
    expect(second.cursors).toEqual(['c1']);
    expect((await driver.all('SELECT id FROM stores')).length).toBe(1);
    expect((await driver.all('SELECT id FROM orders')).length).toBe(1);
  });

  it('starts again from scratch when the server database was restored', async () => {
    await store.setState('cursor', 'stale');
    await store.setState('epoch', 'E0');
    let calls = 0;
    const source: PullSource = {
      async pull(_storeId, cursor) {
        calls += 1;
        if (cursor === 'stale') throw new SyncRequestError('restored', 'EPOCH_CHANGED', 409);
        return page([storeChange('S1')], 'c1', true);
      },
    };
    await runInitialSync(store, source);
    expect(calls).toBe(2);
    expect(await store.getState('initialSync')).toBe('done');
  });

  it('does nothing when the download is already done and fails without a chosen store', async () => {
    await store.setState('initialSync', 'done');
    await runInitialSync(store, pagesSource([]));
    const { store: other } = await createDevice();
    await other.setState('storeId', '');
    await expect(runInitialSync(other, pagesSource([]))).rejects.toThrow(/no store chosen/);
  });

  it('stops when the server repeats the same position', async () => {
    const source = pagesSource([page([], 'same', false), page([], 'same', false)]);
    await expect(runInitialSync(store, source)).rejects.toThrow(/same download position/);
  });
});
