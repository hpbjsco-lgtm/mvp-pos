/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createSqlJsTestDriver } from '../sync/sqlJsTestDriver';
import { COLLECTIONS } from './collections';
import { MIGRATIONS } from './schema';

describe('discounts, channels and debt kept with the data', () => {
  it('writes the line discounts and the channel of an order, and reads them back', () => {
    const spec = COLLECTIONS.orders;
    const order = {
      id: 'o1', orderNumber: 'HD1', totalAmount: 70000, lineDiscountAmount: 10000, channelName: 'GrabFood', commissionPercent: 25, commissionAmount: 17500,
      items: [{ productId: 'p', name: 'Latte', quantity: 2, price: 40000, discount: 10000 }],
    };
    const row = spec.toRow(order, 'S1');
    expect(row).toMatchObject({ line_discount_amount: 10000, channel_name: 'GrabFood', commission_percent: 25, commission_amount: 17500 });
    expect(spec.children!.toRows(order, 'S1')[0]).toMatchObject({ discount: 10000 });
    const parent = spec.fromRow({ ...row, id: 'o1' });
    spec.children!.attach([parent], new Map([['o1', spec.children!.toRows(order, 'S1')]]));
    expect(parent).toMatchObject({ lineDiscountAmount: 10000, channelName: 'GrabFood', commissionPercent: 25, commissionAmount: 17500 });
    expect(parent.items[0].discount).toBe(10000);
  });

  it('an order without them reads back with nothing set', () => {
    const row = COLLECTIONS.orders.toRow({ id: 'o2', orderNumber: 'HD2', totalAmount: 1, items: [] }, 'S1');
    expect(row).toMatchObject({ line_discount_amount: 0, channel_name: '', commission_amount: 0 });
    expect(COLLECTIONS.orders.fromRow({ ...row, id: 'o2' })).toMatchObject({ lineDiscountAmount: undefined, channelName: undefined, commissionAmount: undefined });
  });

  it('keeps the debt of a customer', () => {
    const spec = COLLECTIONS.customers;
    const row = spec.toRow({ id: 'c1', name: 'An', phone: '', email: '', points: 0, debt: 150000 }, 'S1');
    expect(row.debt).toBe(150000);
    expect(spec.fromRow({ ...row, id: 'c1' }).debt).toBe(150000);
  });

  it('migration 21 gives existing rows no discount, no channel, no debt and no channels list', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of MIGRATIONS.filter(m => m.version < 21)) for (const statement of migration.statements) await driver.exec(statement);
    await driver.run(`INSERT INTO orders (id, store_id, order_number, total_amount, created_at, updated_at) VALUES ('o', 'S1', 'HD1', 5, 'x', 'x')`);
    await driver.run(`INSERT INTO customers (id, store_id, name, created_at, updated_at) VALUES ('c', 'S1', 'An', 'x', 'x')`);
    await driver.run(`INSERT INTO stores (id, name, created_at, updated_at) VALUES ('S1', 'Cafe', 'x', 'x')`);
    for (const statement of MIGRATIONS.find(m => m.version === 21)!.statements) await driver.exec(statement);
    expect((await driver.all("SELECT line_discount_amount, channel_name, commission_percent, commission_amount FROM orders"))[0]).toEqual({ line_discount_amount: 0, channel_name: '', commission_percent: 0, commission_amount: 0 });
    expect((await driver.all('SELECT debt FROM customers'))[0]).toEqual({ debt: 0 });
    expect((await driver.all('SELECT sales_channels FROM stores'))[0]).toEqual({ sales_channels: '' });
  });
});
