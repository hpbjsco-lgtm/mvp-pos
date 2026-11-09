/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { InventoryBatch, InventoryTransactionType, KitchenItem, KitchenStatus, Product, StockPick } from '../types';
import { moveKitchenPortions } from './kitchenSync';
import {
  applyRestore, buildStockVoucher, deductForLine, deductForLines, describeShortages, NEGATIVE_BATCH_CODE, scalePicks, settleKitchenStock, splitTicketStock, unstockedLines, type StockState,
} from './kitchenStock';

const prod = (id: string, extra: Partial<Product>): Product => ({ id, name: id, sku: id, price: 0, cost: 0, category: 'x', isAvailable: true, createdAt: '', ...extra });
const batch = (id: string, productId: string, quantity: number, expiryDate = '2027-01-01'): InventoryBatch => ({ id, productId, batchCode: id.toUpperCase(), expiryDate, quantity, originalQuantity: quantity, createdAt: '' });

const milk = prod('milk', { unit: 'Lít', cost: 30000 });
const latte = prod('latte', { dishKind: 'prepared', recipe: [{ ingredientId: 'milk', quantity: 0.2 }] });
const soda = prod('soda', { dishKind: 'regular', cost: 8000 });
const state = (ingredientBatches: InventoryBatch[], batches: InventoryBatch[] = []): StockState => ({ ingredientBatches, batches });

describe('deductForLine', () => {
  it('takes ingredients in FEFO order and records what it took', () => {
    const result = deductForLine({ productId: 'latte', quantity: 2 }, [latte], [milk], state([batch('m2', 'milk', 5, '2027-06-01'), batch('m1', 'milk', 0.3, '2027-01-01')]));
    expect(result.picks.map(p => [p.batchId, p.take])).toEqual([['m1', 0.3], ['m2', 0.1]]);
    expect(result.state.ingredientBatches.map(b => [b.id, b.quantity])).toEqual([['m2', 4.9], ['m1', 0]]);
    expect(result.shortages).toEqual([]);
  });

  it('goes below zero when there is not enough, and says what was short', () => {
    const result = deductForLine({ productId: 'latte', quantity: 3 }, [latte], [milk], state([batch('m1', 'milk', 0.2)]));
    expect(result.shortages).toEqual([{ kind: 'ingredient', productId: 'milk', needed: 0.6, available: 0.2 }]);
    expect(result.state.ingredientBatches[0].quantity).toBe(-0.4);
    expect(result.picks.map(p => p.take)).toEqual([0.2, 0.4]);
  });

  it('puts the missing quantity on the placeholder batch when there is one, else on the latest batch', () => {
    const withPlaceholder = deductForLine({ productId: 'latte', quantity: 1 }, [latte], [milk], state([batch('m1', 'milk', 0, '2027-01-01'), { ...batch('neg', 'milk', -1), batchCode: NEGATIVE_BATCH_CODE }]));
    expect(withPlaceholder.state.ingredientBatches.find(b => b.id === 'neg')!.quantity).toBe(-1.2);
    const latest = deductForLine({ productId: 'latte', quantity: 1 }, [latte], [milk], state([batch('old', 'milk', 0, '2026-12-01'), batch('late', 'milk', 0, '2027-09-01')]));
    expect(latest.state.ingredientBatches.find(b => b.id === 'late')!.quantity).toBe(-0.2);
    expect(latest.state.ingredientBatches.find(b => b.id === 'old')!.quantity).toBe(0);
  });

  it('creates a placeholder batch for an ingredient that has no batch yet', () => {
    const result = deductForLine({ productId: 'latte', quantity: 1 }, [latte], [milk], state([]));
    expect(result.state.ingredientBatches).toHaveLength(1);
    expect(result.state.ingredientBatches[0]).toMatchObject({ id: 'NEG-milk', productId: 'milk', batchCode: NEGATIVE_BATCH_CODE, quantity: -0.2, importPrice: 30000 });
    expect(result.picks[0]).toMatchObject({ kind: 'ingredient', batchId: 'NEG-milk', take: 0.2 });
  });

  it('takes the own stock of a regular dish, below zero when used up, and ignores a dish without any batch', () => {
    const own = deductForLine({ productId: 'soda', quantity: 2 }, [soda], [], state([], [batch('s1', 'soda', 1)]));
    expect(own.state.batches[0].quantity).toBe(-1);
    expect(own.shortages).toEqual([{ kind: 'product', productId: 'soda', needed: 2, available: 1 }]);
    const unmanaged = deductForLine({ productId: 'soda', quantity: 2 }, [soda], [], state([], []));
    expect(unmanaged.picks).toEqual([]);
    expect(unmanaged.shortages).toEqual([]);
    const usedUp = deductForLine({ productId: 'soda', quantity: 1 }, [soda], [], state([], [batch('s1', 'soda', 0)]));
    expect(usedUp.state.batches[0].quantity).toBe(-1);
  });

  it('counts the toppings of the line', () => {
    const pearl = prod('pearl', { isTopping: true, toppingKind: 'prepared', recipe: [{ ingredientId: 'tapioca', quantity: 30 }] });
    const tapioca = prod('tapioca', { unit: 'Gram' });
    const result = deductForLine({ productId: 'latte', quantity: 2, toppings: [{ productId: 'pearl', quantity: 1 }] }, [latte, pearl], [milk, tapioca], state([batch('t1', 'tapioca', 100), batch('m1', 'milk', 5)]));
    expect(result.picks.find(p => p.productId === 'tapioca')!.take).toBe(60);
  });
});

describe('deductForLines', () => {
  it('lets a later line see what the earlier ones took and combines the shortages of one item', () => {
    const result = deductForLines([{ productId: 'latte', quantity: 1 }, { productId: 'latte', quantity: 2 }], [latte], [milk], state([batch('m1', 'milk', 0.3)]));
    expect(result.picksPerLine[0].map(p => p.take)).toEqual([0.2]);
    expect(result.picksPerLine[1].map(p => p.take)).toEqual([0.1, 0.3]);
    expect(result.shortages).toEqual([{ kind: 'ingredient', productId: 'milk', needed: 0.4, available: 0.1 }]);
  });
});

describe('describeShortages', () => {
  it('shows what is needed and what is left, with the unit', () => {
    const text = describeShortages([{ kind: 'ingredient', productId: 'milk', needed: 0.4, available: 0.1 }], () => ({ name: 'Sữa tươi', unit: 'Lít' }));
    expect(text).toEqual(['Sữa tươi: cần 0,4 Lít, còn 0,1 Lít']);
  });
});

const ticket = (extra: Partial<KitchenItem>): KitchenItem => ({
  id: 'k1', orderId: 'NB-1', productId: 'latte', productName: 'Latte', quantity: 3, status: KitchenStatus.PENDING, tableNumber: 'Bàn 1', createdAt: '2026-11-01T10:00:00Z', ...extra,
});
const picks = (...takes: number[]): StockPick[] => takes.map((take, index) => ({ kind: 'ingredient', batchId: `m${index + 1}`, productId: 'milk', batchCode: `M${index + 1}`, take }));

describe('settleKitchenStock', () => {
  it('gives back the share of a ticket that lost portions', () => {
    const { items, restores } = settleKitchenStock([ticket({ quantity: 2, stockPortions: 3, stockPicks: picks(0.3, 0.3) })]);
    expect(restores).toEqual([{ sendId: 'NB-1', tableNumber: 'Bàn 1', picks: picks(0.1, 0.1) }]);
    expect(items[0]).toMatchObject({ stockPortions: 2, quantity: 2 });
    expect(items[0].stockPicks).toEqual(picks(0.2, 0.2));
  });

  it('gives everything back for a cancelled ticket and clears its stock fields', () => {
    const { items, restores } = settleKitchenStock([ticket({ status: KitchenStatus.CANCELLED, stockPortions: 3, stockPicks: picks(0.6) })]);
    expect(restores[0].picks).toEqual(picks(0.6));
    expect(items[0].stockPortions).toBeUndefined();
    expect(items[0].stockPicks).toBeUndefined();
  });

  it('changes nothing when the ticket is whole, served, or never took stock, and is repeatable', () => {
    const whole = ticket({ stockPortions: 3, stockPicks: picks(0.6) });
    const served = ticket({ id: 'k2', status: KitchenStatus.SERVED, quantity: 1, stockPortions: 3, stockPicks: picks(0.6) });
    const never = ticket({ id: 'k3', status: KitchenStatus.CANCELLED });
    const first = settleKitchenStock([whole, served, never]);
    expect(first.restores).toEqual([]);
    expect(first.items).toEqual([whole, served, never]);
    const reduced = settleKitchenStock([ticket({ quantity: 1, stockPortions: 3, stockPicks: picks(0.6) })]);
    expect(settleKitchenStock(reduced.items).restores).toEqual([]);
  });

  it('groups what goes back by send action', () => {
    const { restores } = settleKitchenStock([
      ticket({ id: 'a', orderId: 'NB-1', status: KitchenStatus.CANCELLED, stockPortions: 1, stockPicks: picks(0.2) }),
      ticket({ id: 'b', orderId: 'NB-2', status: KitchenStatus.CANCELLED, stockPortions: 1, stockPicks: picks(0.2) }),
      ticket({ id: 'c', orderId: 'NB-1', status: KitchenStatus.CANCELLED, stockPortions: 1, stockPicks: picks(0.2) }),
    ]);
    expect(restores.map(r => [r.sendId, r.picks.length])).toEqual([['NB-1', 2], ['NB-2', 1]]);
  });
});

describe('moving portions keeps the stock with them', () => {
  it('splits the stock of a ticket that moves in part, and does not give anything back afterwards', () => {
    const moved = moveKitchenPortions([ticket({ stockPortions: 3, stockPicks: picks(0.6) })], () => true, 1, 'Mang đi', () => 'copy');
    const original = moved.find(k => k.id === 'k1')!;
    const copy = moved.find(k => k.id === 'copy')!;
    expect([original.quantity, original.stockPortions, copy.quantity, copy.stockPortions]).toEqual([2, 2, 1, 1]);
    expect(original.stockPicks![0].take + copy.stockPicks![0].take).toBeCloseTo(0.6);
    expect(settleKitchenStock(moved).restores).toEqual([]);
  });

  it('splitTicketStock gives nothing to a ticket without stock', () => {
    expect(splitTicketStock({ stockPortions: undefined, stockPicks: undefined }, 1).moved.stockPortions).toBeUndefined();
  });
});

describe('putting stock back and vouchers', () => {
  it('adds quantities back, also into a batch that is below zero', () => {
    expect(applyRestore([batch('m1', 'milk', -0.4)], picks(0.4))[0].quantity).toBe(0);
  });
  it('scales picks and drops what rounds to nothing', () => {
    expect(scalePicks(picks(1, 0.0000000001), 0.5)).toEqual(picks(0.5));
  });
  it('totals picks per batch into the lines of a voucher', () => {
    const voucher = buildStockVoucher(
      { id: 'T', transactionNumber: 'PXK1', staffId: 's', note: 'n', createdAt: 'x', kitchenBatchId: 'NB-1' },
      InventoryTransactionType.EXPORT,
      [{ ...picks(0.2)[0], price: 100 }, { ...picks(0.3)[0], price: 100 }, { ...picks(1)[0], batchId: 'm2', price: 10 }],
    );
    expect(voucher.items).toEqual([{ productId: 'milk', batchId: 'm1', batchCode: 'M1', quantity: 0.5, price: 100 }, { productId: 'milk', batchId: 'm2', batchCode: 'M1', quantity: 1, price: 10 }]);
    expect(voucher.totalAmount).toBeCloseTo(60);
    expect(voucher).toMatchObject({ type: InventoryTransactionType.EXPORT, kitchenBatchId: 'NB-1' });
  });
});

describe('a table from sending dishes to paying', () => {
  it('follows the stock through send, a cancelled portion and the rest at payment', () => {
    // 1.0 litre of milk, a latte takes 0.2
    let current = state([batch('m1', 'milk', 1)]);
    const sent = deductForLine({ productId: 'latte', quantity: 3 }, [latte], [milk], current);
    current = sent.state;
    expect(current.ingredientBatches[0].quantity).toBeCloseTo(0.4);

    // The customer cancels one portion: the ticket drops to 2 portions and 0.2 goes back
    const settled = settleKitchenStock([ticket({ quantity: 2, stockPortions: 3, stockPicks: sent.picks })]);
    current = { ...current, ingredientBatches: applyRestore(current.ingredientBatches, settled.restores.flatMap(r => r.picks)) };
    expect(current.ingredientBatches[0].quantity).toBeCloseTo(0.6);

    // Two portions are sent in the kitchen, the customer then asks for a third: only that one is taken at payment
    const stockedPortions = settled.items[0].stockPortions!;
    const atPayment = deductForLine({ productId: 'latte', quantity: 3 - stockedPortions }, [latte], [milk], current);
    expect(stockedPortions).toBe(2);
    expect(atPayment.state.ingredientBatches[0].quantity).toBeCloseTo(0.4);
    expect(atPayment.shortages).toEqual([]);
  });
});

describe('unstockedLines', () => {
  const same = (k: KitchenItem, line: { productId: string }) => k.productId === line.productId;

  it('leaves out lines whose portions all took stock when sent and keeps only what is missing', () => {
    const lines = [{ productId: 'latte', quantity: 3 }, { productId: 'soda', quantity: 2 }, { productId: 'tea', quantity: 1 }];
    const tickets = [ticket({ productId: 'latte', stockPortions: 3 }), ticket({ id: 'k2', productId: 'soda', stockPortions: 1 })];
    expect(unstockedLines(lines, tickets, same)).toEqual([
      { productId: 'soda', quantity: 1, toppings: undefined },
      { productId: 'tea', quantity: 1, toppings: undefined },
    ]);
  });

  it('adds up several tickets of one line, counts a ticket without stock as nothing, and never goes below zero', () => {
    const tickets = [ticket({ productId: 'latte', stockPortions: 2 }), ticket({ id: 'k2', productId: 'latte', stockPortions: 2 }), ticket({ id: 'k3', productId: 'latte' })];
    expect(unstockedLines([{ productId: 'latte', quantity: 3 }], tickets, same)).toEqual([]);
    expect(unstockedLines([{ productId: 'latte', quantity: 5 }], tickets, same)).toEqual([{ productId: 'latte', quantity: 1, toppings: undefined }]);
  });

  it('keeps the toppings of the line', () => {
    const toppings = [{ productId: 'pearl', quantity: 1 }];
    expect(unstockedLines([{ productId: 'latte', quantity: 1, toppings }], [], same)).toEqual([{ productId: 'latte', quantity: 1, toppings }]);
  });
});

