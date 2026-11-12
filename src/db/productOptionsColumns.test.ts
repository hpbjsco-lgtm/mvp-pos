/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createSqlJsTestDriver } from '../sync/sqlJsTestDriver';
import { diffCartStatements, COLLECTIONS, diffStatements } from './collections';
import { MIGRATIONS } from './schema';
import { defaultDrinkOptionGroups } from '../utils/productOptions';
import type { Product } from '../types';

/** Runs the migrations up to a version (inclusive) on a fresh in-memory database. */
async function databaseAt(version: number) {
  const driver = await createSqlJsTestDriver();
  for (const migration of MIGRATIONS.filter(m => m.version <= version)) for (const statement of migration.statements) await driver.exec(statement);
  // The rows below are tiny samples, not whole orders with their parents; migration 1 turned the checks on.
  await driver.exec('PRAGMA foreign_keys = OFF');
  return driver;
}

/** Inserts a minimal product row. */
const insertProduct = (driver: Awaited<ReturnType<typeof databaseAt>>, id: string, menuType: string, category: string, kind = 'product', deleted: string | null = null) =>
  driver.run(
    `INSERT INTO products (id, store_id, kind, name, category, menu_type, created_at, updated_at, deleted_at) VALUES (?, 'S1', ?, ?, ?, ?, 'x', 'x', ?)`,
    [id, kind, id, category, menuType, deleted],
  );

describe('migration 22: option groups', () => {
  it('turns the sugar and ice of existing lines into options, and leaves lines without them empty', async () => {
    const driver = await databaseAt(21);
    await driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, sugar_level, ice_level, created_at) VALUES ('a', 'S1', 'o', 'p', 'x', 1, 1, '50%', '70%', 'x')`);
    await driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, sugar_level, ice_level, created_at) VALUES ('b', 'S1', 'o', 'p', 'x', 1, 1, '30%', '', 'x')`);
    await driver.run(`INSERT INTO order_items (id, store_id, order_id, product_id, product_name, quantity, price, sugar_level, ice_level, created_at) VALUES ('c', 'S1', 'o', 'p', 'x', 1, 1, '', '', 'x')`);
    await driver.run(`INSERT INTO kitchen_items (id, store_id, product_name, ice_level, created_at, updated_at) VALUES ('k', 'S1', 'x', '100%', 'x', 'x')`);
    for (const statement of MIGRATIONS.find(m => m.version === 22)!.statements) await driver.exec(statement);
    const lines = await driver.all<{ id: string; options: string }>('SELECT id, options FROM order_items ORDER BY id');
    expect(lines.map(line => line.options)).toEqual([
      '[{"group":"Đường","choice":"50%"},{"group":"Đá","choice":"70%"}]',
      '[{"group":"Đường","choice":"30%"}]',
      '',
    ]);
    expect((await driver.all<{ options: string }>('SELECT options FROM kitchen_items'))[0].options).toBe('[{"group":"Đá","choice":"100%"}]');
  });

  it('gives Sugar and Ice to existing drinks only, with the same ids the app builds', async () => {
    const driver = await databaseAt(21);
    await insertProduct(driver, 'tea', 'drink', 'Trà');
    await insertProduct(driver, 'old-drink', '', 'Đồ uống');
    await insertProduct(driver, 'rice', 'food', 'Cơm');
    await insertProduct(driver, 'milk', 'drink', 'Nguyên liệu', 'ingredient');
    await insertProduct(driver, 'gone', 'drink', 'Trà', 'product', '2026-01-01');
    for (const statement of MIGRATIONS.find(m => m.version === 22)!.statements) await driver.exec(statement);

    const groups = await driver.all<{ id: string; product_id: string; name: string; allow_multiple: number; line_no: number }>('SELECT * FROM product_option_groups ORDER BY id');
    expect(groups.map(group => `${group.product_id}/${group.name}`)).toEqual(['old-drink/Đá', 'old-drink/Đường', 'tea/Đá', 'tea/Đường']);
    expect(groups.every(group => group.allow_multiple === 0)).toBe(true);

    const expected = defaultDrinkOptionGroups('tea');
    const choices = await driver.all<{ id: string; group_id: string; label: string; is_default: number }>("SELECT * FROM product_option_choices WHERE product_id = 'tea' ORDER BY group_id, line_no");
    const fromApp = expected.flatMap(group => group.choices.map(choice => ({ id: choice.id, group_id: group.id, label: choice.label, is_default: choice.isDefault ? 1 : 0 })));
    expect(choices.map(({ id, group_id, label, is_default }) => ({ id, group_id, label, is_default })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(fromApp.sort((a, b) => a.id.localeCompare(b.id)));
  });
});

describe('option groups of a dish kept with the data', () => {
  const dish = (): Product => ({
    id: 'p1', sku: '', name: 'Trà sữa', price: 30000, cost: 0, category: 'Trà', isAvailable: true, menuType: 'drink', createdAt: '2026-11-01T00:00:00Z',
    optionGroups: [
      ...defaultDrinkOptionGroups('p1'),
      { id: 'g-notes', name: 'Ghi chú nhanh', allowMultiple: true, choices: [{ id: 'n1', label: 'Ít cay', isDefault: false }, { id: 'n2', label: 'Không hành', isDefault: true }] },
    ],
  });

  it('writes the groups and the choices as rows of their own, in order', () => {
    const [groups, choices] = COLLECTIONS.products.children!;
    const rows = groups.toRows(dish(), 'S1');
    expect(rows.map(row => [row.id, row.name, row.allow_multiple, row.line_no])).toEqual([['p1::sugar', 'Đường', 0, 0], ['p1::ice', 'Đá', 0, 1], ['g-notes', 'Ghi chú nhanh', 1, 2]]);
    const choiceRows = choices.toRows(dish(), 'S1');
    expect(choiceRows).toHaveLength(12);
    expect(choiceRows.filter(row => row.group_id === 'g-notes').map(row => [row.id, row.label, row.is_default, row.line_no])).toEqual([['n1', 'Ít cay', 0, 0], ['n2', 'Không hành', 1, 1]]);
    expect(choiceRows.every(row => row.product_id === 'p1' && row.store_id === 'S1')).toBe(true);
  });

  it('reads them back into the groups of the dish', () => {
    const [groups, choices] = COLLECTIONS.products.children!;
    const parent = COLLECTIONS.products.fromRow({ ...COLLECTIONS.products.toRow(dish(), 'S1'), id: 'p1' });
    groups.attach([parent], new Map([['p1', groups.toRows(dish(), 'S1')]]));
    choices.attach([parent], new Map([['p1', choices.toRows(dish(), 'S1')]]));
    expect(parent.optionGroups).toEqual(dish().optionGroups);
  });

  it('gives a dish without groups no groups', () => {
    const [groups] = COLLECTIONS.products.children!;
    const parent = COLLECTIONS.products.fromRow({ ...COLLECTIONS.products.toRow({ ...dish(), optionGroups: undefined }, 'S1'), id: 'p1' });
    groups.attach([parent], new Map());
    expect(parent.optionGroups).toBeUndefined();
  });

  it('saves a changed choice by replacing the groups and choices of that dish only', () => {
    const before = dish();
    const after = { ...dish(), optionGroups: before.optionGroups!.map(group => (group.id === 'g-notes' ? { ...group, choices: [...group.choices, { id: 'n3', label: 'Mang đi', isDefault: false }] } : group)) };
    const statements = diffStatements('products', [before], [after], 'S1').map(statement => statement.sql);
    expect(statements.filter(sql => sql.startsWith('DELETE FROM product_option_groups'))).toHaveLength(1);
    expect(statements.filter(sql => sql.startsWith('DELETE FROM product_option_choices'))).toHaveLength(1);
    expect(statements.filter(sql => sql.includes('INSERT INTO product_option_choices'))).toHaveLength(13);
    expect(diffStatements('products', [before], [dish()], 'S1')).toEqual([]);
  });
});

describe('options on lines kept with the data', () => {
  const options = [{ group: 'Đường', choice: '50%' }, { group: 'Ghi chú nhanh', choice: 'Ít cay', multiple: true }];

  it('writes and reads the options of an order line and of a kitchen ticket', () => {
    const order = { id: 'o1', orderNumber: 'HD1', totalAmount: 1, items: [{ productId: 'p', name: 'Latte', quantity: 1, price: 1, options }] };
    const spec = COLLECTIONS.orders;
    const lineRow = spec.children![0].toRows(order, 'S1')[0];
    expect(lineRow.options).toBe(JSON.stringify(options));
    expect(lineRow).not.toHaveProperty('sugar_level');
    const parent = spec.fromRow({ ...spec.toRow(order, 'S1'), id: 'o1' });
    spec.children![0].attach([parent], new Map([['o1', [lineRow]]]));
    expect(parent.items[0].options).toEqual(options);

    const ticket = COLLECTIONS.kitchenItems.toRow({ id: 'k1', orderId: 'NB', productId: 'p', productName: 'Latte', quantity: 1, status: 'pending', options, createdAt: 'x' }, 'S1');
    expect(ticket.options).toBe(JSON.stringify(options));
    expect(COLLECTIONS.kitchenItems.fromRow({ ...ticket, id: 'k1' }).options).toEqual(options);
    expect(COLLECTIONS.kitchenItems.fromRow({ ...ticket, options: '', id: 'k1' }).options).toBeUndefined();
  });

  it('keeps the options of a cart line', async () => {
    const driver = await databaseAt(22);
    const statements = diffCartStatements({}, { T1: [{ productId: 'p', quantity: 1, note: '', options }] }, 'S1');
    for (const statement of statements) await driver.run(statement.sql, statement.params as any[]);
    const stored = await driver.all<{ options: string }>('SELECT options FROM cart_items');
    expect(stored[0].options).toBe(JSON.stringify(options));
  });
});
