/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { InventoryBatch, InventoryTransaction, InventoryTransactionType } from '../types';
import { planStockRestore, STOCK_RESTORE_NOTE_PREFIX } from './stockRestore';

const batch = (id: string, productId: string, batchCode: string, quantity = 0): InventoryBatch => ({
  id, productId, batchCode, expiryDate: '2027-01-01', importPrice: 10, quantity, originalQuantity: 100, createdAt: 'x',
} as InventoryBatch);

const exportVoucher = (id: string, orderId: string | undefined, items: InventoryTransaction['items']): InventoryTransaction => ({
  id, transactionNumber: 'PXK0001', type: InventoryTransactionType.EXPORT, orderId, items, staffId: 's', createdAt: '2026-11-01T10:00:00Z',
});

describe('planStockRestore', () => {
  it('puts every exported quantity back into its batch and builds one adjustment line per batch', () => {
    const vouchers = [
      exportVoucher('t1', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 2, price: 10 }]),
      exportVoucher('t2', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 0.5, price: 10 }, { productId: 'tea', batchId: 'b2', batchCode: 'T1', quantity: 1, price: 4 }]),
    ];
    const plan = planStockRestore('o1', vouchers, [batch('b1', 'milk', 'L1', 3), batch('b2', 'tea', 'T1', 0)]);
    expect(plan.batchQuantities.get('b1')).toBe(2.5);
    expect(plan.batchQuantities.get('b2')).toBe(1);
    expect(plan.adjustmentItems).toEqual([
      { productId: 'milk', batchCode: 'L1', batchId: 'b1', quantity: 2.5, price: 10 },
      { productId: 'tea', batchCode: 'T1', batchId: 'b2', quantity: 1, price: 4 },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.alreadyRestored).toBe(false);
  });

  it('finds the batch by product and batch code for vouchers written without a batch id', () => {
    const plan = planStockRestore('o1', [exportVoucher('t1', 'o1', [{ productId: 'milk', batchCode: 'L1', quantity: 1 }])], [batch('b1', 'milk', 'L1'), batch('b9', 'other', 'L1')]);
    expect([...plan.batchQuantities]).toEqual([['b1', 1]]);
  });

  it('lists lines whose batch is gone instead of inventing one', () => {
    const plan = planStockRestore('o1', [exportVoucher('t1', 'o1', [{ productId: 'milk', batchId: 'gone', batchCode: 'L1', quantity: 2 }])], [batch('b1', 'milk', 'L1')]);
    expect(plan.batchQuantities.size).toBe(0);
    expect(plan.adjustmentItems).toEqual([]);
    expect(plan.skipped).toEqual([{ productId: 'milk', batchCode: 'L1', quantity: 2 }]);
  });

  it('ignores vouchers of other orders, unlinked vouchers and vouchers that are not exports', () => {
    const vouchers = [
      exportVoucher('t1', 'other', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 5 }]),
      exportVoucher('t2', undefined, [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 5 }]),
      { ...exportVoucher('t3', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 5 }]), type: InventoryTransactionType.IMPORT },
    ];
    const plan = planStockRestore('o1', vouchers, [batch('b1', 'milk', 'L1')]);
    expect(plan.sourceTransactions).toEqual([]);
    expect(plan.batchQuantities.size).toBe(0);
  });

  it('knows when the stock of the order was already put back, and returns only what is still out', () => {
    const exported = exportVoucher('t1', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 3 }]);
    const restoreOf = (quantity: number): InventoryTransaction => ({
      ...exportVoucher('r1', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity }]), type: InventoryTransactionType.ADJUSTMENT, note: `${STOCK_RESTORE_NOTE_PREFIX}HD00001`,
    });
    const all = planStockRestore('o1', [exported, restoreOf(3)], [batch('b1', 'milk', 'L1')]);
    expect(all.alreadyRestored).toBe(true);
    expect(all.batchQuantities.size).toBe(0);
    const part = planStockRestore('o1', [exported, restoreOf(1)], [batch('b1', 'milk', 'L1')]);
    expect(part.alreadyRestored).toBe(false);
    expect(part.batchQuantities.get('b1')).toBe(2);
    expect(part.adjustmentItems[0].quantity).toBe(2);
  });

  it('counts what the kitchen put back when it cancelled a dish, so cancelling the order does not return it twice', () => {
    const exported = exportVoucher('t1', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 3 }]);
    const kitchenRestore: InventoryTransaction = {
      ...exportVoucher('r1', 'o1', [{ productId: 'milk', batchId: 'b1', batchCode: 'L1', quantity: 1 }]), type: InventoryTransactionType.ADJUSTMENT, note: 'Hoàn kho do hủy món Bàn 1',
    };
    expect(planStockRestore('o1', [exported, kitchenRestore], [batch('b1', 'milk', 'L1')]).batchQuantities.get('b1')).toBe(2);
  });

  it('does not treat an ordinary stock adjustment of the same order as a restore', () => {
    const adjustment: InventoryTransaction = { ...exportVoucher('a1', 'o1', []), type: InventoryTransactionType.ADJUSTMENT, note: 'Hư hỏng' };
    expect(planStockRestore('o1', [adjustment], []).alreadyRestored).toBe(false);
  });
});
