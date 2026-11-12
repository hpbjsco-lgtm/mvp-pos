/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createSqlJsTestDriver } from '../sync/sqlJsTestDriver';
import { COLLECTIONS } from './collections';
import { MIGRATIONS } from './schema';

describe('what a stocktake keeps', () => {
  const voucher = {
    id: 'T1', transactionNumber: 'KK0001', type: 'stocktake', staffId: 'u1', staffName: 'An', shiftId: 'sh1', stocktakeKind: 'close', createdAt: '2026-11-09T10:00:00Z',
    items: [{ productId: 'milk', batchCode: 'L1, L2', quantity: -2, price: 30000, systemQuantity: 10, countedQuantity: 8 }],
  };

  it('writes the shift, the kind and the stock before and after of each line, and reads them back', () => {
    const spec = COLLECTIONS.transactions;
    expect(spec.toRow(voucher, 'S1')).toMatchObject({ shift_id: 'sh1', stocktake_kind: 'close', staff_name: 'An' });
    expect(spec.children![0].toRows(voucher, 'S1')[0]).toMatchObject({ quantity: -2, system_quantity: 10, counted_quantity: 8, batch_code: 'L1, L2' });
    const parent = spec.fromRow({ ...spec.toRow(voucher, 'S1'), id: 'T1' });
    spec.children![0].attach([parent], new Map([['T1', spec.children![0].toRows(voucher, 'S1')]]));
    expect(parent).toMatchObject({ shiftId: 'sh1', stocktakeKind: 'close', staffName: 'An' });
    expect(parent.items[0]).toMatchObject({ quantity: -2, systemQuantity: 10, countedQuantity: 8 });
  });

  it('shows no count on the lines of other vouchers', () => {
    const spec = COLLECTIONS.transactions;
    const exportVoucher = { id: 'T2', transactionNumber: 'PXK1', type: 'export', staffId: 'u1', createdAt: 'x', items: [{ productId: 'milk', batchCode: 'L1', quantity: 2 }] };
    const parent = spec.fromRow({ ...spec.toRow(exportVoucher, 'S1'), id: 'T2' });
    spec.children![0].attach([parent], new Map([['T2', spec.children![0].toRows(exportVoucher, 'S1')]]));
    expect(parent.items[0].systemQuantity).toBeUndefined();
    expect(parent.items[0].countedQuantity).toBeUndefined();
  });

  it('keeps the "check each shift" mark of an item', () => {
    const spec = COLLECTIONS.products;
    const row = spec.toRow({ id: 'p', name: 'Milk', sku: 'NL1', price: 0, cost: 0, category: 'x', checkEachShift: true }, 'S1');
    expect(row.check_each_shift).toBe(1);
    expect(spec.fromRow({ ...row, id: 'p' }).checkEachShift).toBe(true);
    expect(spec.fromRow({ ...spec.toRow({ id: 'q', name: 'Tea', sku: 'NL2', price: 0, cost: 0, category: 'x' }, 'S1'), id: 'q' }).checkEachShift).toBe(false);
  });

  it('migration 20 leaves existing rows with no shift, no kind and no mark', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of MIGRATIONS.filter(m => m.version < 20)) for (const statement of migration.statements) await driver.exec(statement);
    await driver.run(`INSERT INTO products (id, store_id, name, created_at, updated_at) VALUES ('p', 'S1', 'Milk', 'x', 'x')`);
    await driver.run(`INSERT INTO inventory_transactions (id, store_id, transaction_number, type, created_at, updated_at) VALUES ('t', 'S1', 'X', 'import', 'x', 'x')`);
    for (const statement of MIGRATIONS.find(m => m.version === 20)!.statements) await driver.exec(statement);
    expect((await driver.all("SELECT check_each_shift FROM products"))[0]).toEqual({ check_each_shift: 0 });
    expect((await driver.all("SELECT shift_id, stocktake_kind FROM inventory_transactions"))[0]).toEqual({ shift_id: '', stocktake_kind: '' });
  });
});
