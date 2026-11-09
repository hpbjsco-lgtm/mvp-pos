/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { InventoryTransaction, InventoryTransactionType, Product, Shift } from '../types';
import { parseCsv } from './csv';
import { describeShift, listStocktakes, stocktakesToCsv } from './stocktakeHistory';

const product = (id: string, name: string, sku: string, unit = 'Chai'): Product => ({ id, name, sku, price: 0, cost: 0, category: 'x', isAvailable: true, createdAt: '', unit });
const products = [product('milk', 'Sữa tươi', 'NL0001', 'Lít'), product('tea', 'Trà đen', 'NL0002', 'Kg')];
const shift: Shift = { id: 'sh1', staffId: 'u1', staffName: 'An', openingCash: 0, status: 'open', openedAt: new Date(2026, 10, 9, 8, 0).toISOString(), createdAt: '' };

const stocktake = (id: string, createdAt: string, extra: Partial<InventoryTransaction> = {}): InventoryTransaction => ({
  id, transactionNumber: `KK-${id}`, type: InventoryTransactionType.STOCKTAKE, staffId: 'u1', staffName: 'An', createdAt,
  items: [
    { productId: 'milk', batchCode: 'L1', quantity: -2, price: 30000, systemQuantity: 10, countedQuantity: 8 },
    { productId: 'tea', batchCode: 'L2', quantity: 1, price: 4000, systemQuantity: 3, countedQuantity: 4 },
  ],
  ...extra,
});
const times = { a: new Date(2026, 10, 9, 20, 0).toISOString(), b: new Date(2026, 10, 10, 8, 0).toISOString(), c: new Date(2026, 10, 1, 9, 0).toISOString() };

describe('listStocktakes', () => {
  const vouchers = [
    stocktake('a', times.a, { shiftId: 'sh1', stocktakeKind: 'close' }),
    stocktake('b', times.b, { stocktakeKind: 'open', staffName: 'Bình' }),
    stocktake('c', times.c),
    { ...stocktake('x', times.a), type: InventoryTransactionType.EXPORT },
  ];

  it('lists only stocktakes, newest first, with their totals and shift name', () => {
    const entries = listStocktakes(vouchers, [shift], {}, products);
    expect(entries.map(e => e.voucher.id)).toEqual(['b', 'a', 'c']);
    expect(entries[1]).toMatchObject({ differentItems: 2, shortValue: 60000, surplusValue: 4000, netValue: -56000, shiftName: 'An, mở 09/11 08:00' });
    expect(entries[0].shiftName).toBe('');
  });

  it('narrows by period, shift, kind, person and item', () => {
    const ids = (filter: Parameters<typeof listStocktakes>[2]) => listStocktakes(vouchers, [shift], filter, products).map(e => e.voucher.id);
    expect(ids({ from: new Date(2026, 10, 9).getTime(), to: new Date(2026, 10, 9, 23, 59).getTime() })).toEqual(['a']);
    expect(ids({ shiftId: 'sh1' })).toEqual(['a']);
    expect(ids({ kind: 'open' })).toEqual(['b']);
    expect(ids({ staffName: 'Bình' })).toEqual(['b']);
    expect(ids({ item: 'trà' })).toEqual(['b', 'a', 'c']);
    expect(ids({ item: 'nl0001' })).toEqual(['b', 'a', 'c']);
    expect(ids({ item: 'cà phê' })).toEqual([]);
  });
});

describe('describeShift', () => {
  it('names who worked the shift and when it opened', () => {
    expect(describeShift(shift)).toBe('An, mở 09/11 08:00');
  });
});

describe('stocktakesToCsv', () => {
  it('writes one row per counted line with the stock before, the count and the value', () => {
    const entries = listStocktakes([stocktake('a', times.a, { shiftId: 'sh1', stocktakeKind: 'close', note: 'Kiểm kho cuối ca' })], [shift], {}, products);
    const rows = parseCsv(stocktakesToCsv(entries, products)).map(row => row.cells);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['KK-a', '2026-11-09 20:00', 'Cuối ca', 'An, mở 09/11 08:00', 'An', 'NL0001', 'Sữa tươi', 'Lít', '10', '8', '-2', '-60000', 'Kiểm kho cuối ca']);
    expect(rows[2].slice(10, 12)).toEqual(['1', '4000']);
  });
});
