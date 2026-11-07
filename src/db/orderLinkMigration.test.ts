/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createSqlJsTestDriver } from '../sync/sqlJsTestDriver';
import { MIGRATIONS } from './schema';
import { COLLECTIONS } from './collections';

describe('migration 16: link stock vouchers to orders', () => {
  it('links old export vouchers to their order by the note, and leaves the others empty', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of MIGRATIONS.filter(m => m.version < 16)) for (const statement of migration.statements) await driver.exec(statement);
    const now = '2026-11-01T10:00:00Z';
    await driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o1', 'S1', 'HD-00012', 1, ?, ?), ('o2', 'S1', 'HD-00013', 1, ?, ?), ('o3', 'S2', 'HD-00012', 1, ?, ?)`, [now, now, now, now, now, now]);
    const insert = (id: string, store: string, type: string, note: string) =>
      driver.run(`INSERT INTO inventory_transactions (id, store_id, transaction_number, type, note, created_at, updated_at) VALUES (?, ?, 'X', ?, ?, ?, ?)`, [id, store, type, note, now, now]);
    await insert('t1', 'S1', 'export', 'Bán hàng HD-00012');
    await insert('t2', 'S1', 'export', 'Bán hàng HD-00013 (thiếu tồn một số nguyên liệu)');
    await insert('t3', 'S1', 'export', 'Bán hàng HD-99999');
    await insert('t4', 'S1', 'export', 'Hư hỏng');
    await insert('t5', 'S1', 'import', 'Bán hàng HD-00012');

    for (const statement of MIGRATIONS.find(m => m.version === 16)!.statements) await driver.exec(statement);
    const links = await driver.all<{ id: string; order_id: string }>('SELECT id, order_id FROM inventory_transactions ORDER BY id');
    expect(links).toEqual([
      { id: 't1', order_id: 'o1' },
      { id: 't2', order_id: 'o2' },
      { id: 't3', order_id: '' },
      { id: 't4', order_id: '' },
      { id: 't5', order_id: '' },
    ]);
  });

  it('writes and reads the order link of a voucher', () => {
    const spec = COLLECTIONS.transactions;
    expect(spec.toRow({ id: 't1', orderId: 'o1', type: 'export' }, 'S1')).toMatchObject({ order_id: 'o1' });
    expect(spec.toRow({ id: 't1', type: 'export' }, 'S1')).toMatchObject({ order_id: '' });
    expect(spec.fromRow({ id: 't1', order_id: 'o1', type: 'export' }).orderId).toBe('o1');
    expect(spec.fromRow({ id: 't1', order_id: '', type: 'export' }).orderId).toBeUndefined();
  });
});
