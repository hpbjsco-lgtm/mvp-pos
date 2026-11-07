/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../db/schema';
import { compareConflict, formatValue, isColumnCovered, LABELLED_TABLES } from './conflictPresenter';
import type { ConflictDetail, PushGroup } from './syncClient';
import { createSqlJsTestDriver } from './sqlJsTestDriver';

const group = (table: string, rowId: string, row: PushGroup['row'], children?: PushGroup['children']): PushGroup => ({ table, rowId, baseRev: 1, row, children });
const conflict = (table: string, device: PushGroup, server: PushGroup | null): ConflictDetail => ({
  id: 'c1', storeId: 'S1', table, rowId: device.rowId, deviceId: 'device-1', baseRev: 1, serverRev: 2, status: 'pending',
  resolution: null, resolvedBy: null, resolvedAt: null, createdAt: '2026-11-07T10:00:00Z', devicePayload: device, serverPayload: server,
});

describe('compareConflict', () => {
  it('lists only the fields that differ, with names and money in words', () => {
    const server = group('products', 'p1', { id: 'p1', store_id: 'S1', name: 'Latte', price: 30000, rev: 2, updated_at: 'a', is_available: 1 });
    const device = group('products', 'p1', { id: 'p1', store_id: 'S1', name: 'Mocha', price: 35000, rev: 1, updated_at: 'b', is_available: 1 });
    const result = compareConflict(conflict('products', device, server));
    expect(result).toMatchObject({ tableLabel: 'Món / hàng hóa', rowLabel: 'Latte', serverRemoved: false });
    expect(result.fields.map(field => [field.label, field.serverValue, field.deviceValue])).toEqual([
      ['Tên', 'Latte', 'Mocha'],
      ['Giá bán', `${(30000).toLocaleString('vi-VN')} đ`, `${(35000).toLocaleString('vi-VN')} đ`],
    ]);
  });

  it('never shows a password or a PIN', () => {
    const server = group('users', 'u1', { uid: 'u1', store_id: 'S1', password_hash: 'secret-hash-1', pin_code: '1234', name: 'An' });
    const device = group('users', 'u1', { uid: 'u1', store_id: 'S1', password_hash: 'secret-hash-2', pin_code: '9999', name: 'An' });
    const shown = JSON.stringify(compareConflict(conflict('users', device, server)));
    expect(shown).not.toContain('secret-hash');
    expect(shown).not.toContain('1234');
    expect(shown).not.toContain('9999');
    expect(shown).toContain('••••••');
  });

  it('says so when the record was removed on the server', () => {
    const device = group('customers', 'c9', { id: 'c9', store_id: 'S1', name: 'Binh' });
    expect(compareConflict(conflict('customers', device, null))).toMatchObject({ serverRemoved: true, rowLabel: 'Binh', fields: [], children: [] });
  });

  it('compares the lines of an order: added, removed and changed', () => {
    const line = (id: string, name: string, quantity: number) => ({ id, store_id: 'S1', order_id: 'o1', product_name: name, quantity, price: 10, created_at: 'x' });
    const server = group('orders', 'o1', { id: 'o1', store_id: 'S1', order_number: 'HD00001', total_amount: 20 }, { order_items: [line('i1', 'Tea', 1), line('i2', 'Cake', 1)] });
    const device = group('orders', 'o1', { id: 'o1', store_id: 'S1', order_number: 'HD00001', total_amount: 30 }, { order_items: [line('i1', 'Tea', 2), line('i3', 'Pie', 1)] });
    const result = compareConflict(conflict('orders', device, server));
    expect(result.rowLabel).toBe('HD00001');
    expect(result.fields.map(field => field.label)).toEqual(['Tổng tiền']);
    expect(result.children).toEqual([{
      label: 'Dòng món', serverCount: 2, deviceCount: 2, added: ['Pie x1'], removed: ['Cake x1'], changed: ['Tea x2: Số lượng 1 → 2'],
    }]);
  });

  it('treats an empty text and null as the same, and shows no child difference when lines are equal', () => {
    const server = group('suppliers', 's1', { id: 's1', store_id: 'S1', name: 'A', note: null });
    const device = group('suppliers', 's1', { id: 's1', store_id: 'S1', name: 'A', note: '' });
    expect(compareConflict(conflict('suppliers', device, server)).fields).toEqual([]);
  });
});

describe('formatValue', () => {
  it('formats empty values, yes and no, dates and long text', () => {
    expect(formatValue('note', '')).toBe('(trống)');
    expect(formatValue('note', null)).toBe('(trống)');
    expect(formatValue('is_active', 1)).toBe('Có');
    expect(formatValue('is_active', 0)).toBe('Không');
    expect(formatValue('expiry_date', '2026-12-31')).toBe('31/12/2026');
    expect(formatValue('note', 'x'.repeat(100))).toBe(`${'x'.repeat(80)}…`);
  });
});

describe('column names in words', () => {
  it('cover every column of the tables where conflicts can happen', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of MIGRATIONS) for (const statement of migration.statements) await driver.exec(statement);
    const missing: string[] = [];
    for (const table of [...LABELLED_TABLES, 'order_items', 'inventory_transaction_items']) {
      for (const column of await driver.all<{ name: string }>(`PRAGMA table_info(${table})`)) {
        if (!isColumnCovered(table, column.name)) missing.push(`${table}.${column.name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
