/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { InventoryBatch, InventoryTransactionType, Product } from '../types';
import { NEGATIVE_BATCH_CODE } from './kitchenStock';
import { buildStocktakeVoucher, planStocktake } from './stocktake';

const prod = (id: string, cost = 0): Product => ({ id, name: id, sku: id, price: 0, cost, category: 'x', isAvailable: true, createdAt: '' });
const batch = (id: string, productId: string, quantity: number, expiryDate = '2027-01-01', extra: Partial<InventoryBatch> = {}): InventoryBatch =>
  ({ id, productId, batchCode: id.toUpperCase(), expiryDate, quantity, originalQuantity: Math.max(quantity, 0), importPrice: 100, createdAt: '', ...extra });
const NOW = new Date(2026, 10, 9, 10, 0, 0);
const quantities = (batches: InventoryBatch[]) => Object.fromEntries(batches.map(b => [b.id, b.quantity]));

describe('planStocktake', () => {
  it('takes what is missing out of the batches that expire first', () => {
    const plan = planStocktake([{ productId: 'milk', counted: 4 }], [prod('milk')], [batch('a', 'milk', 3, '2027-01-01'), batch('b', 'milk', 5, '2027-06-01')], NOW);
    expect(quantities(plan.batches)).toEqual({ a: 0, b: 4 });
    expect(plan.items).toEqual([{ productId: 'milk', batchCode: 'A, B', quantity: -4, price: 100, systemQuantity: 8, countedQuantity: 4 }]);
    expect(plan.differences).toEqual([{ productId: 'milk', system: 8, counted: 4, delta: -4 }]);
  });

  it('adds a surplus to the batch with the latest expiry', () => {
    const plan = planStocktake([{ productId: 'milk', counted: 10 }], [prod('milk')], [batch('a', 'milk', 3, '2027-01-01'), batch('b', 'milk', 5, '2027-06-01')], NOW);
    expect(quantities(plan.batches)).toEqual({ a: 3, b: 7 });
    expect(plan.items).toEqual([{ productId: 'milk', batchCode: 'B', quantity: 2, price: 100, systemQuantity: 8, countedQuantity: 10 }]);
  });

  it('fills batches below zero first, the placeholder before the others, then adds the rest', () => {
    const batches = [batch('a', 'milk', -1, '2027-01-01'), batch('neg', 'milk', -2, '2099-12-31', { batchCode: NEGATIVE_BATCH_CODE }), batch('c', 'milk', 1, '2027-03-01')];
    const plan = planStocktake([{ productId: 'milk', counted: 5 }], [prod('milk')], batches, NOW);
    // The system had -2, the count is 5: a surplus of 7. The placeholder takes 2, batch a takes 1, the rest (4) goes to the latest expiry.
    expect(quantities(plan.batches)).toEqual({ a: 0, neg: 4, c: 1 });
    expect(plan.items).toEqual([{ productId: 'milk', batchCode: 'ÂM, A', quantity: 7, price: 100, systemQuantity: -2, countedQuantity: 5 }]);
    expect(plan.batches.reduce((sum, b) => sum + b.quantity, 0)).toBe(5);
  });

  it('creates a batch for an item that has none, with its cost', () => {
    const plan = planStocktake([{ productId: 'sugar', counted: 3 }], [prod('sugar', 20000)], [], NOW);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]).toMatchObject({ productId: 'sugar', batchCode: 'KK-20261109', expiryDate: '2099-12-31', quantity: 3, originalQuantity: 3, importPrice: 20000 });
    expect(plan.items[0]).toMatchObject({ batchCode: 'KK-20261109', quantity: 3, price: 20000, systemQuantity: 0, countedQuantity: 3 });
  });

  it('counting zero empties the item, and an item that matches changes nothing', () => {
    const plan = planStocktake([{ productId: 'milk', counted: 0 }, { productId: 'tea', counted: 2 }], [prod('milk'), prod('tea')], [batch('a', 'milk', 3), batch('t', 'tea', 2)], NOW);
    expect(quantities(plan.batches)).toEqual({ a: 0, t: 2 });
    expect(plan.differences.map(d => d.productId)).toEqual(['milk']);
    expect(plan.items.map(i => i.productId)).toEqual(['milk']);
  });

  it('leaves the stock of other items alone and handles decimals without drift', () => {
    const plan = planStocktake([{ productId: 'milk', counted: 0.7 }], [prod('milk')], [batch('a', 'milk', 1.1), batch('o', 'other', 9)], NOW);
    expect(quantities(plan.batches)).toEqual({ a: 0.7, o: 9 });
  });

  it('refuses a count that is not a number of 0 or more', () => {
    expect(() => planStocktake([{ productId: 'milk', counted: -1 }], [prod('milk')], [], NOW)).toThrow('từ 0 trở lên');
    expect(() => planStocktake([{ productId: 'milk', counted: Number.NaN }], [prod('milk')], [], NOW)).toThrow('từ 0 trở lên');
  });

  it('the voucher lines keep the sign and the total is the signed value', () => {
    const plan = planStocktake([{ productId: 'milk', counted: 2 }], [prod('milk')], [batch('a', 'milk', 5)], NOW);
    const voucher = buildStocktakeVoucher({ id: 'T', transactionNumber: 'KK0001', staffId: 's', staffName: 'An', note: 'Kiểm kho', createdAt: 'x', shiftId: 'sh1', stocktakeKind: 'close' }, plan.items);
    expect(voucher).toMatchObject({ type: InventoryTransactionType.STOCKTAKE, totalAmount: -300, staffName: 'An', shiftId: 'sh1', stocktakeKind: 'close' });
    expect(voucher.items[0].quantity).toBe(-3);
  });
});
