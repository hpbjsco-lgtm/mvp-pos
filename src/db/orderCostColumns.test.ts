/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createSqlJsTestDriver } from '../sync/sqlJsTestDriver';
import { COLLECTIONS } from './collections';
import { MIGRATIONS } from './schema';

describe('cost kept on an order', () => {
  it('is written with the order and its lines, and read back', () => {
    const spec = COLLECTIONS.orders;
    const order = { id: 'o1', orderNumber: 'HD1', totalAmount: 50000, totalCost: 21000, costRecorded: true, items: [{ productId: 'p', name: 'Latte', quantity: 2, price: 25000, cost: 10500 }] };
    const row = spec.toRow(order, 'S1');
    expect(row).toMatchObject({ total_cost: 21000, cost_recorded: 1 });
    expect(spec.children!.toRows(order, 'S1')[0]).toMatchObject({ cost: 10500 });
    expect(spec.fromRow({ ...row, id: 'o1' })).toMatchObject({ totalCost: 21000, costRecorded: true });
  });

  it('an order that never recorded cost reads back as not recorded', () => {
    const row = COLLECTIONS.orders.toRow({ id: 'o2', orderNumber: 'HD2', totalAmount: 1, items: [] }, 'S1');
    expect(row.cost_recorded).toBe(0);
    expect(COLLECTIONS.orders.fromRow({ ...row, id: 'o2' }).costRecorded).toBe(false);
  });

  it('migration 19 leaves existing orders as "not recorded"', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of MIGRATIONS.filter(m => m.version < 19)) for (const statement of migration.statements) await driver.exec(statement);
    await driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('old', 'S1', 'HD1', 5, 'x', 'x')`);
    for (const statement of MIGRATIONS.find(m => m.version === 19)!.statements) await driver.exec(statement);
    expect((await driver.all<{ cost_recorded: number }>("SELECT cost_recorded FROM orders WHERE id = 'old'"))[0].cost_recorded).toBe(0);
  });
});
