/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { InventoryTransaction, InventoryTransactionType, Order, PaymentMethod } from '../types';
import { summarizeProfit } from './profit';

const order = (id: string, total: number, extra: Partial<Order> = {}): Order => ({
  id, orderNumber: id, items: [], totalAmount: total, paymentMethod: PaymentMethod.CASH, paidAmount: total, changeAmount: 0, staffId: 's', createdAt: '2026-11-01T10:00:00Z', ...extra,
});
const voucher = (type: InventoryTransactionType, extra: Partial<InventoryTransaction>): InventoryTransaction => ({
  id: 'v', transactionNumber: 'X', type, items: [], staffId: 's', createdAt: '2026-11-01T10:00:00Z', ...extra,
});

describe('summarizeProfit', () => {
  it('counts only orders that recorded their cost, without VAT, and says how many were left out', () => {
    const result = summarizeProfit([
      order('A', 110000, { taxAmount: 10000, totalCost: 40000, costRecorded: true }),
      order('B', 50000, { totalCost: 20000, costRecorded: true }),
      order('OLD', 99999),
    ], []);
    expect(result).toMatchObject({ revenueExTax: 150000, cost: 60000, grossProfit: 90000, commission: 0, ordersWithCost: 2, ordersWithoutCost: 1 });
    expect(result.netProfit).toBe(90000);
  });

  it('a recorded cost of zero is a real cost, not a missing one', () => {
    const result = summarizeProfit([order('FREE', 30000, { totalCost: 0, costRecorded: true })], []);
    expect(result).toMatchObject({ grossProfit: 30000, ordersWithCost: 1, ordersWithoutCost: 0 });
  });

  it('adds up loss adjustments and stocktake differences as shrinkage, the surplus reducing it', () => {
    const result = summarizeProfit([order('A', 100000, { totalCost: 30000, costRecorded: true })], [
      voucher(InventoryTransactionType.ADJUSTMENT, { totalAmount: 5000, note: 'Hư hỏng' }),
      voucher(InventoryTransactionType.STOCKTAKE, { items: [
        { productId: 'milk', batchCode: 'L1', quantity: -2, price: 30000 },
        { productId: 'tea', batchCode: 'L2', quantity: 1, price: 4000 },
      ] }),
      voucher(InventoryTransactionType.EXPORT, { totalAmount: 99999, note: 'Bán hàng' }),
      voucher(InventoryTransactionType.IMPORT, { totalAmount: 88888 }),
    ]);
    expect(result.shrinkage).toEqual({ adjustments: 5000, stocktakeShort: 60000, stocktakeSurplus: 4000, total: 61000 });
    expect(result.grossProfit).toBe(70000);
    expect(result.netProfit).toBe(9000);
  });

  it('does not treat stock put back after a cancelled order or dish as a loss', () => {
    const result = summarizeProfit([], [
      voucher(InventoryTransactionType.ADJUSTMENT, { totalAmount: 7000, note: 'Hoàn kho do hủy HD00001' }),
      voucher(InventoryTransactionType.ADJUSTMENT, { totalAmount: 3000, note: 'Hoàn kho do hủy món Bàn 2' }),
    ]);
    expect(result.shrinkage.total).toBe(0);
  });

  it('is all zero without orders and vouchers', () => {
    expect(summarizeProfit([], [])).toEqual({
      revenueExTax: 0, cost: 0, grossProfit: 0, commission: 0, ordersWithCost: 0, ordersWithoutCost: 0,
      shrinkage: { adjustments: 0, stocktakeShort: 0, stocktakeSurplus: 0, total: 0 }, netProfit: 0,
    });
  });

  it('keeps the commission of delivery apps as its own cost, apart from the cost of the dishes', () => {
    const result = summarizeProfit([
      order('G', 100000, { totalCost: 30000, costRecorded: true, channelName: 'GrabFood', commissionPercent: 25, commissionAmount: 25000 }),
      order('D', 50000, { totalCost: 10000, costRecorded: true }),
      order('OLD', 80000, { commissionAmount: 20000 }),
    ], []);
    expect(result).toMatchObject({ cost: 40000, grossProfit: 110000, commission: 25000, netProfit: 85000 });
  });
});

