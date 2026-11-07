/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_MIGRATIONS } from '../db/deviceSchema';
import type { SqlDriver } from '../db/driver';
import { MIGRATIONS } from '../db/schema';
import { createSqlJsTestDriver } from './sqlJsTestDriver';
import type { PullPage, PushGroup, PushResult } from './syncClient';
import { SyncEngine, type SyncTransport } from './syncEngine';
import { SyncStore } from './syncStore';

const NOW = '2026-11-01T10:00:00.000Z';

/** Transport that records pushes and answers from prepared values. */
function fakeTransport(options: { push?: (groups: PushGroup[]) => PushResult; delay?: Promise<void> } = {}) {
  const pushes: PushGroup[][] = [];
  let pulls = 0;
  const transport: SyncTransport = {
    async push(_storeId, _deviceId, groups) {
      pushes.push(groups);
      return options.push ? options.push(groups) : { applied: [], unchanged: [], conflicts: [] };
    },
    async pull(): Promise<PullPage> {
      pulls += 1;
      await options.delay;
      return { epoch: 'E1', cursor: `c${pulls}`, changes: [], done: true, pendingConflicts: 0 };
    },
  };
  return { transport, pushes, pullCount: () => pulls };
}

describe('SyncEngine', () => {
  let driver: SqlDriver;
  let store: SyncStore;

  beforeEach(async () => {
    driver = await createSqlJsTestDriver();
    for (const migration of [...MIGRATIONS, ...DEVICE_MIGRATIONS]) for (const statement of migration.statements) await driver.exec(statement);
    store = new SyncStore(driver);
    await store.setState('storeId', 'S1');
    await store.setState('initialSync', 'done');
    await store.setState('cursor', 'c0');
  });

  it('refuses to run before the first download is finished', async () => {
    await store.setState('initialSync', 'pending');
    await expect(new SyncEngine(driver, store, fakeTransport().transport).runOnce()).rejects.toThrow(/first download/);
  });

  it('sends parents before the rows that refer to them, with the child rows and the base version', async () => {
    await driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'TAM-1', 5, ?, ?)`, [NOW, NOW]);
    await driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, created_at) VALUES ('i1', 'S1', 'o1', 'p', 'Tea', 1, 5, ?)`, [NOW]);
    await driver.run(`INSERT INTO stores (id, name, created_at, updated_at) VALUES ('S1', 'Cafe', ?, ?)`, [NOW, NOW]);
    await store.applyRemote([SyncStore.baseRevStatement('stores', 'S1', 4)]);
    const { transport, pushes } = fakeTransport();
    await new SyncEngine(driver, store, transport).runOnce();
    expect(pushes[0].map(group => group.table)).toEqual(['stores', 'orders']);
    expect(pushes[0][0].baseRev).toBe(4);
    expect(pushes[0][1].baseRev).toBeNull();
    expect(pushes[0][1].children?.order_items).toHaveLength(1);
  });

  it('drops queue entries of rows that no longer exist without calling the server', async () => {
    await driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'TAM-1', 5, ?, ?)`, [NOW, NOW]);
    await driver.run(`DELETE FROM orders WHERE id = 'o1'`);
    const { transport, pushes } = fakeTransport();
    await new SyncEngine(driver, store, transport).runOnce();
    expect(pushes).toHaveLength(0);
    expect(await store.pendingCount()).toBe(0);
  });

  it('leaves queued records in place when the push fails', async () => {
    await driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'TAM-1', 5, ?, ?)`, [NOW, NOW]);
    const { transport } = fakeTransport({ push: () => { throw new Error('offline'); } });
    await expect(new SyncEngine(driver, store, transport).runOnce()).rejects.toThrow('offline');
    expect(await store.pendingCount()).toBe(1);
  });

  it('does not overwrite a record that changed again during the push when its server version is downloaded', async () => {
    await driver.run(`INSERT INTO products (id, store_id, name, created_at, updated_at) VALUES ('p1', 'S1', 'First', ?, ?)`, [NOW, NOW]);
    const page: PullPage = { epoch: 'E1', cursor: 'c1', done: true, pendingConflicts: 0, changes: [{ table: 'products', rowId: 'p1', op: 'upsert', row: { id: 'p1', store_id: 'S1', name: 'Theirs', created_at: NOW, updated_at: NOW, rev: 2 } }] };
    const transport: SyncTransport = {
      async push() {
        // The cashier edits the product again while the upload is on its way.
        await driver.run(`UPDATE products SET name = 'Second' WHERE id = 'p1'`);
        return { applied: [{ table: 'products', rowId: 'p1', rev: 1 }], unchanged: [], conflicts: [] };
      },
      async pull() { return page; },
    };
    await new SyncEngine(driver, store, transport).runOnce();
    expect((await driver.all('SELECT name FROM products WHERE id = ?', ['p1']))[0].name).toBe('Second');
    expect(await store.pendingCount()).toBe(1);
  });

  it('runs one round at a time and shares the result', async () => {
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    const { transport, pullCount } = fakeTransport({ delay });
    const engine = new SyncEngine(driver, store, transport);
    const first = engine.runOnce();
    const second = engine.runOnce();
    release();
    expect(await second).toBe(await first);
    expect(pullCount()).toBe(1);
  });
});
