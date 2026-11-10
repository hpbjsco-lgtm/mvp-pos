/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DiningTable, KitchenItem, KitchenStatus, Product, TableStatus } from '../types';
import { settleKitchenStock } from './kitchenStock';
import { canCancelFromKitchen, cancelKitchenTicket, cartIdForTicketLabel, removeCancelledTicketFromCart, ticketMatchesLine } from './kitchenSync';

const product = (id: string, name: string): Product => ({ id, name, sku: id, price: 0, cost: 0, category: 'x', isAvailable: true, createdAt: '' });
const products = [product('latte', 'Latte'), product('pearl', 'Trân châu')];
const table = (id: string, name: string, extra: Partial<DiningTable> = {}): DiningTable => ({ id, name, status: TableStatus.EMPTY, capacity: 4, createdAt: '', ...extra });
const ticket = (extra: Partial<KitchenItem> = {}): KitchenItem => ({
  id: 'k1', orderId: 'NB-1', productId: 'latte', productName: 'Latte', quantity: 2, status: KitchenStatus.PENDING, tableNumber: 'Bàn 1', note: '', createdAt: '2026-11-10T10:00:00Z', ...extra,
});
const line = (extra: Record<string, unknown> = {}) => ({ productId: 'latte', quantity: 3, note: '', sentQuantity: 3, ...extra });

describe('canCancelFromKitchen', () => {
  it('is possible while the dish waits or is being cooked, not once it is made, served or cancelled', () => {
    expect(canCancelFromKitchen(KitchenStatus.PENDING)).toBe(true);
    expect(canCancelFromKitchen(KitchenStatus.PREPARING)).toBe(true);
    expect(canCancelFromKitchen(KitchenStatus.COMPLETED)).toBe(false);
    expect(canCancelFromKitchen(KitchenStatus.SERVED)).toBe(false);
    expect(canCancelFromKitchen(KitchenStatus.CANCELLED)).toBe(false);
  });
});

describe('cancelKitchenTicket', () => {
  it('cancels the ticket with who and when, and leaves the others alone', () => {
    const result = cancelKitchenTicket([ticket(), ticket({ id: 'k2' })], 'k1', 'Bình', 'now');
    expect(result[0]).toMatchObject({ status: KitchenStatus.CANCELLED, cancelledBy: 'Bình', cancelledAt: 'now' });
    expect(result[1].status).toBe(KitchenStatus.PENDING);
  });

  it('does not touch a dish that is already made or served', () => {
    const made = ticket({ status: KitchenStatus.COMPLETED });
    expect(cancelKitchenTicket([made], 'k1', 'Bình', 'now')[0]).toBe(made);
  });

  it('gives the stock of the cancelled ticket back through the usual settling', () => {
    const picks = [{ kind: 'ingredient' as const, batchId: 'm1', productId: 'milk', batchCode: 'M1', take: 0.4 }];
    const cancelled = cancelKitchenTicket([ticket({ stockPortions: 2, stockPicks: picks })], 'k1', 'Bình', 'now');
    const settled = settleKitchenStock(cancelled);
    expect(settled.restores).toEqual([{ sendId: 'NB-1', tableNumber: 'Bàn 1', picks }]);
    expect(settled.items[0].stockPortions).toBeUndefined();
  });
});

describe('cartIdForTicketLabel', () => {
  const tables = [table('T1', 'Bàn 1'), table('T2', 'Bàn 2', { mergedIntoId: 'T1' }), table('T3', 'Bàn 3')];
  it('finds the cart of a table, of a merged group (its main table), and of takeaway or delivery', () => {
    expect(cartIdForTicketLabel(tables, 'Bàn 3')).toBe('T3');
    expect(cartIdForTicketLabel(tables, 'Bàn 1 + Bàn 2')).toBe('T1');
    expect(cartIdForTicketLabel(tables, 'Bàn 2')).toBe('T1');
    expect(cartIdForTicketLabel(tables, 'Mang về')).toBe('takeaway');
    expect(cartIdForTicketLabel(tables, 'Giao đi')).toBe('delivery');
  });
  it('says there is no cart for an unknown table', () => {
    expect(cartIdForTicketLabel(tables, 'Bàn 9')).toBeNull();
    expect(cartIdForTicketLabel(tables, '')).toBeNull();
  });
});

describe('removeCancelledTicketFromCart', () => {
  it('takes the cancelled portions off the matching line, also from the portions counted as sent', () => {
    const result = removeCancelledTicketFromCart([line()], ticket({ quantity: 2 }), products);
    expect(result).toEqual([{ productId: 'latte', quantity: 1, note: '', sentQuantity: 1 }]);
  });

  it('removes the line when nothing is left, and keeps the lines that do not match', () => {
    const other = line({ productId: 'pearl' });
    expect(removeCancelledTicketFromCart([line({ quantity: 2, sentQuantity: 2 }), other], ticket({ quantity: 2 }), products)).toEqual([other]);
    expect(removeCancelledTicketFromCart([other], ticket(), products)).toEqual([other]);
  });

  it('matches the line by options and toppings, so a plain latte does not lose the portions of a latte with pearls', () => {
    const plain = line({ quantity: 2, sentQuantity: 2 });
    const withPearl = line({ quantity: 1, sentQuantity: 1, toppings: [{ productId: 'pearl', quantity: 1 }] });
    const cancelled = ticket({ quantity: 1, toppings: 'Trân châu x1' });
    expect(ticketMatchesLine(cancelled, withPearl, products)).toBe(true);
    expect(ticketMatchesLine(cancelled, plain, products)).toBe(false);
    expect(removeCancelledTicketFromCart([plain, withPearl], cancelled, products)).toEqual([plain]);
  });

  it('keeps the portions that were not sent yet', () => {
    const result = removeCancelledTicketFromCart([line({ quantity: 4, sentQuantity: 2 })], ticket({ quantity: 2 }), products);
    expect(result).toEqual([{ productId: 'latte', quantity: 2, note: '' }]);
  });
});
