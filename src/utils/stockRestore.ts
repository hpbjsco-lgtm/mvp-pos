/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryBatch, InventoryTransaction, InventoryTransactionItem, InventoryTransactionType } from '../types';

/** Start of the note of the adjustment that puts stock back after an order was cancelled. */
export const STOCK_RESTORE_NOTE_PREFIX = 'Hoàn kho do hủy ';

/** A line of a stock voucher that could not be put back. */
export interface UnrestorableLine {
  productId: string;
  batchCode: string;
  quantity: number;
}

/** What cancelling an order puts back into stock. */
export interface StockRestorePlan {
  /** Export vouchers that were written when the order was paid. */
  sourceTransactions: InventoryTransaction[];
  /** True when the stock of this order was already put back (a restore adjustment exists). */
  alreadyRestored: boolean;
  /** Quantity to add to each batch, by batch id. */
  batchQuantities: Map<string, number>;
  /** Lines of the adjustment voucher to write: one per batch that gets stock back. */
  adjustmentItems: InventoryTransactionItem[];
  /** Lines whose batch no longer exists, left for the manager to correct by hand. */
  skipped: UnrestorableLine[];
}

/**
 * Works out which stock to put back when an order is cancelled: what the export vouchers of the order took from each
 * batch, minus what was already put back for the order (restore vouchers: the kitchen puts stock back when it cancels
 * a dish, and cancelling the order must not return it twice). A line is matched to its batch by batch id, or by
 * batch code and product for vouchers written before batch ids were stored. Quantities are added, never replaced.
 *
 * @param orderId Id of the cancelled order.
 * @param transactions Stock vouchers of one kind (ingredients or products).
 * @param batches Batches of the same kind.
 * @returns The plan; `sourceTransactions` is empty when no voucher is linked to the order.
 */
export function planStockRestore(orderId: string, transactions: InventoryTransaction[], batches: InventoryBatch[]): StockRestorePlan {
  const sourceTransactions = transactions.filter(t => t.orderId === orderId && t.type === InventoryTransactionType.EXPORT);
  const restoreVouchers = transactions.filter(t => t.orderId === orderId && t.type === InventoryTransactionType.ADJUSTMENT && (t.note || '').startsWith(STOCK_RESTORE_NOTE_PREFIX));
  const findBatch = (item: InventoryTransactionItem) => batches.find(b => (item.batchId ? b.id === item.batchId : b.productId === item.productId && b.batchCode === item.batchCode));

  const took = new Map<string, InventoryTransactionItem>();
  const skipped: UnrestorableLine[] = [];
  for (const transaction of sourceTransactions) {
    for (const item of transaction.items) {
      const batch = findBatch(item);
      if (!batch) {
        skipped.push({ productId: item.productId, batchCode: item.batchCode, quantity: item.quantity });
        continue;
      }
      const line = took.get(batch.id);
      took.set(batch.id, { productId: batch.productId, batchCode: batch.batchCode, batchId: batch.id, quantity: +((line?.quantity || 0) + item.quantity).toFixed(6), price: item.price });
    }
  }
  const putBack = new Map<string, number>();
  for (const voucher of restoreVouchers) {
    for (const item of voucher.items) {
      const batch = findBatch(item);
      if (batch) putBack.set(batch.id, +((putBack.get(batch.id) || 0) + item.quantity).toFixed(6));
    }
  }

  const batchQuantities = new Map<string, number>();
  const adjustmentItems: InventoryTransactionItem[] = [];
  for (const [batchId, line] of took) {
    const remaining = +(line.quantity - (putBack.get(batchId) || 0)).toFixed(6);
    if (remaining > 1e-9) {
      batchQuantities.set(batchId, remaining);
      adjustmentItems.push({ ...line, quantity: remaining });
    }
  }
  const alreadyRestored = took.size > 0 && adjustmentItems.length === 0 && restoreVouchers.length > 0;
  return { sourceTransactions, alreadyRestored, batchQuantities, adjustmentItems, skipped };
}
