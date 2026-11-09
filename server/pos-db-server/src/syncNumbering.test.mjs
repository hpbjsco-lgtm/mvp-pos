import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, SCHEMA_VERSION } from '../../../src/db/schema';
import { createApp } from './app.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { SyncService } from './syncService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const TOKEN = 'number-token-0123456789';
const NOW = '2026-11-01T10:00:00.000Z';

/** Creates the app's real schema in a database. */
function migrate(database) {
  for (const migration of MIGRATIONS) for (const statement of migration.statements) database.exec(statement);
}

/** An order created offline: it carries a temporary code in both columns. */
const offlineOrder = (id, tempCode, baseRev = null, extra = {}) => ({
  table: 'orders', rowId: id, baseRev,
  row: { id, store_id: 'A', order_number: tempCode, temp_order_number: tempCode, total_amount: 10, created_at: NOW, updated_at: NOW, ...extra },
});

/** An inventory transaction group. */
const stockGroup = (id, type, tempCode = '') => ({
  table: 'inventory_transactions', rowId: id, baseRev: null,
  row: { id, store_id: 'A', type, transaction_number: tempCode, temp_code: tempCode, created_at: NOW, updated_at: NOW },
});

/** A cash voucher group. */
const voucherGroup = (id, voucherType, tempCode = '') => ({
  table: 'cash_vouchers', rowId: id, baseRev: null,
  row: { id, store_id: 'A', code: tempCode, temp_code: tempCode, voucher_type: voucherType, amount: 5, created_at: NOW, updated_at: NOW },
});

describe('document numbering', () => {
  let folder;
  let manager;
  let sync;
  let database;

  beforeEach(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-number-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    database = manager.database;
    migrate(database);
    for (const id of ['A', 'B']) database.prepare('INSERT INTO stores (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `Store ${id}`, NOW, NOW);
    sync = new SyncService(() => manager.database);
  });
  afterEach(() => {
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  const push = (groups) => sync.push({ storeId: 'A', deviceId: 'dev-1', groups });
  const orderRow = (id) => database.prepare('SELECT order_number, temp_order_number FROM orders WHERE id = ?').get(id);

  it('has the schema columns for temporary codes', () => {
    expect(MIGRATIONS.at(-1).version).toBe(SCHEMA_VERSION);
    const columns = (table) => database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    expect(columns('orders')).toContain('temp_order_number');
    expect(columns('inventory_transactions')).toContain('temp_code');
    expect(columns('cash_vouchers')).toContain('temp_code');
  });

  describe('next number', () => {
    it('counts up per kind and per store, with the formats of each document', () => {
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD00001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD00002');
      expect(sync.nextNumber({ storeId: 'B', kind: 'order' }).number).toBe('HD00001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'import' }).number).toBe('PNK0001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'export' }).number).toBe('PXK0001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'receipt' }).number).toBe('PT0001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'payment' }).number).toBe('PC0001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'payment' }).number).toBe('PC0002');
      expect(sync.nextNumber({ storeId: 'A', kind: 'stocktake' }).number).toBe('KK0001');
      expect(sync.nextNumber({ storeId: 'A', kind: 'stocktake' }).number).toBe('KK0002');
    });

    it('continues after numbers already used by stored documents and ignores other formats', () => {
      for (const [id, number] of [['o1', 'HD00007'], ['o2', 'HD-42734'], ['o3', 'TAM-A3-0009'], ['o4', 'HD00003']]) {
        database.prepare('INSERT INTO orders (id, store_id, order_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, 'A', number, NOW, NOW);
      }
      database.prepare("INSERT INTO cash_vouchers (id, store_id, code, voucher_type, created_at, updated_at) VALUES ('v1', 'A', 'PT0012', 'receipt', ?, ?)").run(NOW, NOW);
      database.prepare("INSERT INTO cash_vouchers (id, store_id, code, voucher_type, created_at, updated_at) VALUES ('v2', 'A', 'PC0030', 'payment', ?, ?)").run(NOW, NOW);
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD00008');
      expect(sync.nextNumber({ storeId: 'A', kind: 'receipt' }).number).toBe('PT0013');
      expect(sync.nextNumber({ storeId: 'A', kind: 'payment' }).number).toBe('PC0031');
    });

    it('grows past the minimum width', () => {
      database.prepare("INSERT INTO orders (id, store_id, order_number, created_at, updated_at) VALUES ('o1', 'A', 'HD99999', ?, ?)").run(NOW, NOW);
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD100000');
    });

    it('rejects an unknown kind, a missing store and an unknown store', () => {
      expect(() => sync.nextNumber({ storeId: 'A', kind: 'invoice' })).toThrow(expect.objectContaining({ status: 400 }));
      expect(() => sync.nextNumber({ storeId: 'A', kind: 'constructor' })).toThrow(expect.objectContaining({ status: 400 }));
      expect(() => sync.nextNumber({ storeId: '', kind: 'order' })).toThrow(expect.objectContaining({ status: 400 }));
      expect(() => sync.nextNumber({ storeId: 'ZZ', kind: 'order' })).toThrow(expect.objectContaining({ status: 404 }));
    });
  });

  describe('official numbers on push', () => {
    it('replaces the temporary code with the next official number and keeps the temporary code', () => {
      const result = push([offlineOrder('o1', 'TAM-A3-0001'), offlineOrder('o2', 'TAM-A3-0002')]);
      expect(result.applied).toEqual([
        expect.objectContaining({ rowId: 'o1', number: 'HD00001', tempNumber: 'TAM-A3-0001' }),
        expect.objectContaining({ rowId: 'o2', number: 'HD00002', tempNumber: 'TAM-A3-0002' }),
      ]);
      expect(orderRow('o1')).toEqual({ order_number: 'HD00001', temp_order_number: 'TAM-A3-0001' });
      expect(orderRow('o2')).toEqual({ order_number: 'HD00002', temp_order_number: 'TAM-A3-0002' });
    });

    it('keeps numbers rising across devices and across pushes', () => {
      push([offlineOrder('o1', 'TAM-A3-0001')]);
      sync.push({ storeId: 'A', deviceId: 'dev-2', groups: [offlineOrder('o2', 'TAM-B7-0001')] });
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD00003');
      expect(orderRow('o2').order_number).toBe('HD00002');
    });

    it('leaves a document that already has a normal number alone', () => {
      const group = offlineOrder('o1', '');
      group.row.order_number = 'HD00042';
      push([group]);
      expect(orderRow('o1')).toEqual({ order_number: 'HD00042', temp_order_number: '' });
    });

    it('does not let a later push bring the temporary code back as the number', () => {
      push([offlineOrder('o1', 'TAM-A3-0001')]);
      const result = push([offlineOrder('o1', 'TAM-A3-0001', 1, { total_amount: 99 })]);
      expect(result.applied).toEqual([expect.objectContaining({ rowId: 'o1', rev: 2, number: 'HD00001', tempNumber: 'TAM-A3-0001' })]);
      expect(database.prepare("SELECT total_amount FROM orders WHERE id = 'o1'").get().total_amount).toBe(99);
      expect(orderRow('o1')).toEqual({ order_number: 'HD00001', temp_order_number: 'TAM-A3-0001' });
    });

    it('reports the official number again when the same document is pushed unchanged', () => {
      push([offlineOrder('o1', 'TAM-A3-0001')]);
      const result = push([offlineOrder('o1', 'TAM-A3-0001', 1)]);
      expect(result.unchanged).toEqual([expect.objectContaining({ rowId: 'o1', number: 'HD00001', tempNumber: 'TAM-A3-0001' })]);
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD00002');
    });

    it('does not use up a number when the document conflicts', () => {
      push([offlineOrder('o1', 'TAM-A3-0001')]);
      database.prepare("UPDATE orders SET total_amount = 5, rev = rev + 1 WHERE id = 'o1'").run();
      const result = push([offlineOrder('o1', 'TAM-A3-0001', 1, { total_amount: 77 })]);
      expect(result.conflicts).toHaveLength(1);
      expect(sync.nextNumber({ storeId: 'A', kind: 'order' }).number).toBe('HD00002');
    });

    it('numbers stock documents by type and leaves adjustments alone', () => {
      const result = push([stockGroup('t1', 'import', 'TAM-A3-0001'), stockGroup('t2', 'export', 'TAM-A3-0002'), stockGroup('t3', 'adjustment', 'TAM-A3-0003')]);
      const numbers = result.applied.map((entry) => entry.number);
      expect(numbers).toEqual(['PNK0001', 'PXK0001', 'TAM-A3-0003']);
    });

    it('numbers a stocktake in its own sequence', () => {
      const result = push([stockGroup('k1', 'stocktake', 'TAM-A3-0001'), stockGroup('t1', 'export', 'TAM-A3-0002'), stockGroup('k2', 'stocktake', 'TAM-A3-0003')]);
      expect(result.applied.map((entry) => entry.number)).toEqual(['KK0001', 'PXK0001', 'KK0002']);
    });

    it('numbers receipts and payments separately', () => {
      const result = push([voucherGroup('v1', 'receipt', 'TAM-A3-0001'), voucherGroup('v2', 'payment', 'TAM-A3-0002'), voucherGroup('v3', 'receipt', 'TAM-A3-0003')]);
      expect(result.applied.map((entry) => entry.number)).toEqual(['PT0001', 'PC0001', 'PT0002']);
    });

    it('gives the official number when a manager resolves in favour of the device, and keeps the temporary code', () => {
      push([offlineOrder('o1', 'TAM-A3-0001')]);
      database.prepare("UPDATE orders SET total_amount = 5, rev = rev + 1 WHERE id = 'o1'").run();
      const id = push([offlineOrder('o1', 'TAM-A3-0001', 1, { total_amount: 77 })]).conflicts[0].conflictId;
      sync.conflicts.resolve(id, 'device', 'Manager A');
      expect(database.prepare("SELECT total_amount FROM orders WHERE id = 'o1'").get().total_amount).toBe(77);
      expect(orderRow('o1')).toEqual({ order_number: 'HD00001', temp_order_number: 'TAM-A3-0001' });
    });
  });
});

describe('POST /api/sync/next-number', () => {
  let folder;
  let manager;
  let server;
  let url;

  beforeEach(async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-number-http-'));
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

  const call = (body, token = TOKEN) => fetch(`${url}/api/sync/next-number`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  it('needs the API token', async () => {
    expect((await call({ storeId: 'A', kind: 'order' }, '')).status).toBe(401);
  });
  it('returns rising numbers and clear errors', async () => {
    expect(await (await call({ storeId: 'A', kind: 'order' })).json()).toEqual({ number: 'HD00001' });
    expect(await (await call({ storeId: 'A', kind: 'order' })).json()).toEqual({ number: 'HD00002' });
    expect((await call({ storeId: 'A', kind: 'nope' })).status).toBe(400);
    expect((await call({ storeId: 'ZZ', kind: 'order' })).status).toBe(404);
  });
});
