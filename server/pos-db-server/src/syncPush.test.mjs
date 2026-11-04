import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../../src/db/schema';
import { createApp } from './app.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { SyncService } from './syncService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const TOKEN = 'push-token-0123456789';
const NOW = '2026-11-01T10:00:00.000Z';

/** Creates the app's real schema in a database. */
function migrate(database) {
  for (const migration of MIGRATIONS) for (const statement of migration.statements) database.exec(statement);
}

/** A product row as a device sends it. */
const product = (id, name, extra = {}) => ({ id, store_id: 'A', name, created_at: NOW, updated_at: NOW, ...extra });

/** An order row with lines, as a device sends it. */
const orderGroup = (id, totalAmount, lines, baseRev = null, extra = {}) => ({
  table: 'orders', rowId: id, baseRev,
  row: { id, store_id: 'A', order_number: 'HD1', total_amount: totalAmount, created_at: NOW, updated_at: NOW, ...extra },
  children: { order_items: lines.map(([lineId, name]) => ({ id: lineId, store_id: 'A', order_id: id, product_name: name, created_at: NOW })) },
});

/** A product group. */
const productGroup = (id, name, baseRev = null) => ({ table: 'products', rowId: id, baseRev, row: product(id, name) });

describe('push and conflicts', () => {
  let folder;
  let manager;
  let sync;
  let database;

  beforeEach(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-push-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    database = manager.database;
    migrate(database);
    database.prepare("INSERT INTO stores (id, name, order_seq, created_at, updated_at) VALUES ('A', 'Store A', 7, ?, ?)").run(NOW, NOW);
    sync = new SyncService(() => manager.database);
  });
  afterEach(() => {
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  const push = (groups, deviceId = 'dev-1') => sync.push({ storeId: 'A', deviceId, groups });
  const rowOf = (table, id) => database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  const linesOf = (orderId) => database.prepare('SELECT product_name FROM order_items WHERE order_id = ? ORDER BY id').all(orderId).map((row) => row.product_name);

  it('inserts a new order with its lines and reports the version to remember', () => {
    const result = push([orderGroup('o1', 50000, [['i1', 'Coffee'], ['i2', 'Tea']])]);
    expect(result.applied).toEqual([{ table: 'orders', rowId: 'o1', rev: 1, number: 'HD1', tempNumber: '' }]);
    expect(rowOf('orders', 'o1').total_amount).toBe(50000);
    expect(linesOf('o1')).toEqual(['Coffee', 'Tea']);
  });

  it('accepts an edit made on the version the server holds, and replaces the lines as a set', () => {
    push([orderGroup('o1', 50000, [['i1', 'Coffee'], ['i2', 'Tea']])]);
    const result = push([orderGroup('o1', 30000, [['i1', 'Coffee']], 1)]);
    expect(result.applied).toEqual([{ table: 'orders', rowId: 'o1', rev: 2, number: 'HD1', tempNumber: '' }]);
    expect(rowOf('orders', 'o1').total_amount).toBe(30000);
    expect(linesOf('o1')).toEqual(['Coffee']);
  });

  it('leaves child rows alone when the group does not list them', () => {
    push([orderGroup('o1', 50000, [['i1', 'Coffee']])]);
    const parentOnly = { ...orderGroup('o1', 40000, [], 1), children: undefined };
    push([parentOnly]);
    expect(linesOf('o1')).toEqual(['Coffee']);
  });

  it('records a conflict when the server changed since the device last looked, and writes nothing', () => {
    push([productGroup('p1', 'Coffee')]);
    database.prepare("UPDATE products SET name = 'Server name', rev = rev + 1 WHERE id = 'p1'").run();
    const result = push([productGroup('p1', 'Device name', 1)]);
    expect(result.applied).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(rowOf('products', 'p1').name).toBe('Server name');
    const detail = sync.conflicts.get(result.conflicts[0].conflictId);
    expect(detail).toMatchObject({ table: 'products', rowId: 'p1', baseRev: 1, serverRev: 2, status: 'pending', deviceId: 'dev-1' });
    expect(detail.devicePayload.row.name).toBe('Device name');
    expect(detail.serverPayload.row.name).toBe('Server name');
  });

  it('does not call it a conflict when the device values equal the server values', () => {
    push([productGroup('p1', 'Coffee')]);
    database.prepare("UPDATE products SET rev = rev + 3 WHERE id = 'p1'").run();
    const result = push([productGroup('p1', 'Coffee', 1)]);
    expect(result.conflicts).toEqual([]);
    expect(result.unchanged).toEqual([{ table: 'products', rowId: 'p1', rev: 4 }]);
  });

  it('keeps one open conflict per row and refreshes it with the newest device version', () => {
    push([productGroup('p1', 'Coffee')]);
    database.prepare("UPDATE products SET name = 'Server name', rev = rev + 1 WHERE id = 'p1'").run();
    const first = push([productGroup('p1', 'Device v1', 1)]).conflicts[0].conflictId;
    const second = push([productGroup('p1', 'Device v2', 1)], 'dev-2').conflicts[0].conflictId;
    expect(second).toBe(first);
    expect(sync.conflicts.list('A')).toHaveLength(1);
    expect(sync.conflicts.get(first)).toMatchObject({ deviceId: 'dev-2' });
    expect(sync.conflicts.get(first).devicePayload.row.name).toBe('Device v2');
    expect(sync.pull({ storeId: 'A' }).pendingConflicts).toBe(1);
  });

  it('treats a row the server no longer has as a conflict, but a new row without baseRev as an insert', () => {
    const conflict = push([productGroup('gone', 'Ghost', 3)]);
    expect(conflict.conflicts).toHaveLength(1);
    expect(push([productGroup('fresh', 'Fresh')]).applied).toHaveLength(1);
  });

  it('lets the newest push win for working data such as carts and kitchen items', () => {
    const cart = (items, baseRev) => ({
      table: 'carts', rowId: 'A::T1', baseRev,
      row: { id: 'A::T1', store_id: 'A', cart_key: 'T1', created_at: NOW, updated_at: NOW },
      children: { cart_items: items.map(([id, quantity]) => ({ id, cart_id: 'A::T1', store_id: 'A', cart_key: 'T1', product_id: 'p1', quantity, updated_at: NOW })) },
    });
    push([cart([['A::T1::p1', 1]], null)]);
    database.prepare("UPDATE carts SET rev = rev + 5 WHERE id = 'A::T1'").run();
    const result = push([cart([['A::T1::p1', 4]], 1)]);
    expect(result.conflicts).toEqual([]);
    expect(database.prepare("SELECT quantity FROM cart_items WHERE id = 'A::T1::p1'").get().quantity).toBe(4);
  });

  it('never overwrites the document counters of a store', () => {
    const result = push([{
      table: 'stores', rowId: 'A', baseRev: 1,
      row: { id: 'A', name: 'Renamed', order_seq: 999, import_seq: 5, created_at: NOW, updated_at: NOW },
    }]);
    expect(result.applied).toHaveLength(1);
    expect(rowOf('stores', 'A')).toMatchObject({ name: 'Renamed', order_seq: 7, import_seq: 0 });
  });

  it('rejects bad input and writes nothing, even for groups before the bad one', () => {
    const bad = (group, text) => {
      expect(() => push([productGroup('ok', 'Fine'), group])).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining(text) }));
      expect(rowOf('products', 'ok')).toBeUndefined();
    };
    bad({ table: 'nope', rowId: 'x', row: {} }, 'not synchronised');
    bad({ table: 'order_items', rowId: 'x', row: {} }, 'with its parent');
    bad({ ...productGroup('x', 'n'), row: { ...product('x', 'n'), evil_column: 1 } }, 'no column');
    bad({ ...productGroup('x', 'n'), row: { ...product('x', 'n'), store_id: 'B' } }, 'belongs to store');
    bad({ ...productGroup('x', 'n'), rowId: 'y' }, 'does not match');
    bad({ ...productGroup('x', 'n'), row: { ...product('x', 'n'), name: { sql: 1 } } }, 'must be text');
    bad({ ...productGroup('x', 'n'), baseRev: 'one' }, 'baseRev');
    bad({ ...productGroup('x', 'n'), children: { order_items: [] } }, 'not a child table');
    bad({ ...orderGroup('o9', 1, [['i9', 'x']]), children: { order_items: [{ id: 'i9', store_id: 'A', order_id: 'other', created_at: NOW }] } }, 'does not belong');
  });

  describe('resolving', () => {
    /** Creates a pending conflict on product p1 and returns its id. */
    const conflictOnProduct = () => {
      push([productGroup('p1', 'Coffee')]);
      database.prepare("UPDATE products SET name = 'Server name', rev = rev + 1 WHERE id = 'p1'").run();
      return push([productGroup('p1', 'Device name', 1)]).conflicts[0].conflictId;
    };

    it('writes the device version when the manager chooses it', () => {
      const id = conflictOnProduct();
      sync.conflicts.resolve(id, 'device', 'Manager A');
      expect(rowOf('products', 'p1')).toMatchObject({ name: 'Device name', rev: 3 });
      expect(sync.conflicts.get(id)).toMatchObject({ status: 'resolved', resolution: 'device', resolvedBy: 'Manager A' });
      expect(sync.pull({ storeId: 'A' }).pendingConflicts).toBe(0);
    });

    it('keeps the server version but publishes it again when the manager chooses it', () => {
      const first = sync.pull({ storeId: 'A' });
      let cursor = first.cursor;
      while (!sync.pull({ storeId: 'A', cursor }).done) cursor = sync.pull({ storeId: 'A', cursor }).cursor;
      const id = conflictOnProduct();
      const before = sync.pull({ storeId: 'A', cursor });
      sync.conflicts.resolve(id, 'server', 'Manager A');
      const after = sync.pull({ storeId: 'A', cursor: before.cursor });
      expect(rowOf('products', 'p1')).toMatchObject({ name: 'Server name', rev: 3 });
      expect(after.changes.some((change) => change.table === 'products' && change.rowId === 'p1' && change.row.rev === 3)).toBe(true);
    });

    it('publishes the lines of an order again when the server version is kept', () => {
      push([orderGroup('o1', 50000, [['i1', 'Coffee']])]);
      database.prepare("UPDATE orders SET total_amount = 1, rev = rev + 1 WHERE id = 'o1'").run();
      const id = push([orderGroup('o1', 99, [['i1', 'Coffee'], ['i2', 'Extra']], 1)]).conflicts[0].conflictId;
      const cursor = sync.pull({ storeId: 'A' }).cursor;
      sync.conflicts.resolve(id, 'server', 'Manager A');
      const tables = sync.pull({ storeId: 'A', cursor }).changes.map((change) => change.table);
      expect(tables).toEqual(expect.arrayContaining(['orders', 'order_items']));
      expect(linesOf('o1')).toEqual(['Coffee']);
    });

    it('applies the device lines of an order when the device version is chosen', () => {
      push([orderGroup('o1', 50000, [['i1', 'Coffee']])]);
      database.prepare("UPDATE orders SET total_amount = 1, rev = rev + 1 WHERE id = 'o1'").run();
      const id = push([orderGroup('o1', 99, [['i1', 'Coffee'], ['i2', 'Extra']], 1)]).conflicts[0].conflictId;
      sync.conflicts.resolve(id, 'device', 'Manager A');
      expect(rowOf('orders', 'o1').total_amount).toBe(99);
      expect(linesOf('o1')).toEqual(['Coffee', 'Extra']);
    });

    it('refuses to decide on stale data and refreshes the server version instead', () => {
      const id = conflictOnProduct();
      database.prepare("UPDATE products SET name = 'Changed again', rev = rev + 1 WHERE id = 'p1'").run();
      expect(() => sync.conflicts.resolve(id, 'device', 'Manager A')).toThrow(expect.objectContaining({ code: 'CONFLICT_STALE' }));
      const detail = sync.conflicts.get(id);
      expect(detail.status).toBe('pending');
      expect(detail.serverPayload.row.name).toBe('Changed again');
      expect(rowOf('products', 'p1').name).toBe('Changed again');
      sync.conflicts.resolve(id, 'device', 'Manager A');
      expect(rowOf('products', 'p1').name).toBe('Device name');
    });

    it('rejects a second resolution, an unknown conflict and a bad choice', () => {
      const id = conflictOnProduct();
      sync.conflicts.resolve(id, 'server', 'Manager A');
      expect(() => sync.conflicts.resolve(id, 'device', 'Manager A')).toThrow(expect.objectContaining({ code: 'NOT_PENDING' }));
      expect(() => sync.conflicts.resolve('missing', 'server', 'Manager A')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(() => sync.conflicts.resolve(id, 'maybe', 'Manager A')).toThrow(expect.objectContaining({ status: 400 }));
      expect(() => sync.conflicts.resolve(id, 'server', ' ')).toThrow(expect.objectContaining({ status: 400 }));
    });

    it('lists resolved conflicts separately', () => {
      const id = conflictOnProduct();
      sync.conflicts.resolve(id, 'server', 'Manager A');
      expect(sync.conflicts.list('A')).toEqual([]);
      expect(sync.conflicts.list('A', 'resolved')).toEqual([expect.objectContaining({ id, resolution: 'server', resolvedBy: 'Manager A' })]);
    });
  });
});

describe('push and conflict routes', () => {
  let folder;
  let manager;
  let server;
  let url;

  beforeEach(async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-push-http-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    migrate(manager.database);
    manager.database.prepare("INSERT INTO stores (id, name, created_at, updated_at) VALUES ('A', 'Store A', ?, ?)").run(NOW, NOW);
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

  const call = (method, route, body, token = TOKEN) => fetch(`${url}/api/sync${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  it('needs the API token', async () => {
    expect((await call('POST', '/push', {}, '')).status).toBe(401);
    expect((await call('GET', '/conflicts?storeId=A', undefined, '')).status).toBe(401);
  });

  it('pushes, lists, shows and resolves a conflict over HTTP', async () => {
    await call('POST', '/push', { storeId: 'A', deviceId: 'd1', groups: [productGroup('p1', 'Coffee')] });
    manager.database.prepare("UPDATE products SET name = 'Server', rev = rev + 1 WHERE id = 'p1'").run();
    const pushed = await (await call('POST', '/push', { storeId: 'A', deviceId: 'd1', groups: [productGroup('p1', 'Device', 1)] })).json();
    expect(pushed.conflicts).toHaveLength(1);
    const { conflictId } = pushed.conflicts[0];

    const list = await (await call('GET', '/conflicts?storeId=A')).json();
    expect(list.conflicts.map((conflict) => conflict.id)).toEqual([conflictId]);
    const detail = await (await call('GET', `/conflicts/${conflictId}`)).json();
    expect(detail.serverPayload.row.name).toBe('Server');

    const resolved = await call('POST', `/conflicts/${conflictId}/resolve`, { choice: 'device', resolvedBy: 'Manager A' });
    expect(resolved.status).toBe(200);
    expect(manager.database.prepare("SELECT name FROM products WHERE id = 'p1'").get().name).toBe('Device');
    const again = await call('POST', `/conflicts/${conflictId}/resolve`, { choice: 'device', resolvedBy: 'Manager A' });
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe('NOT_PENDING');
  });

  it('answers 400 for invalid pushes and a missing store', async () => {
    expect((await call('POST', '/push', { storeId: 'A', deviceId: 'd1', groups: 'x' })).status).toBe(400);
    expect((await call('POST', '/push', { deviceId: 'd1', groups: [] })).status).toBe(400);
    expect((await call('GET', '/conflicts')).status).toBe(400);
    expect((await call('GET', '/conflicts/missing')).status).toBe(404);
  });
});
