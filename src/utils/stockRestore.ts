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
 * Works out which stock to put back when an order is cancelled: every line of the export vouchers written for the
 * order goes back into the batch it was taken from. A line is matched to its batch by batch id, or by hand-written
 * batch code and product for vouchers written before batch ids were stored. Quantities are added, never replaced.
 *
 * @param orderId Id of the cancelled order.
 * @param transactions Stock vouchers of one kind (ingredients or products).
 * @param batches Batches of the same kind.
 * @returns The plan; `sourceTransactions` is empty when no voucher is linked to the order.
 */
export function planStockRestore(orderId: string, transactions: InventoryTransaction[], batches: InventoryBatch[]): StockRestorePlan {
  const sourceTransactions = transactions.filter(t => t.orderId === orderId && t.type === InventoryTransactionType.EXPORT);
  const alreadyRestored = transactions.some(t => t.orderId === orderId && t.type === InventoryTransactionType.ADJUSTMENT && (t.note || '').startsWith(STOCK_RESTORE_NOTE_PREFIX));

  const batchQuantities = new Map<string, number>();
  const adjustmentByBatch = new Map<string, InventoryTransactionItem>();
  const skipped: UnrestorableLine[] = [];
  for (const transaction of sourceTransactions) {
    for (const item of transaction.items) {
      const batch = batches.find(b => (item.batchId ? b.id === item.batchId : b.productId === item.productId && b.batchCode === item.batchCode));
      if (!batch) {
        skipped.push({ productId: item.productId, batchCode: item.batchCode, quantity: item.quantity });
        continue;
      }
      batchQuantities.set(batch.id, +((batchQuantities.get(batch.id) || 0) + item.quantity).toFixed(6));
      const line = adjustmentByBatch.get(batch.id);
      adjustmentByBatch.set(batch.id, {
        productId: batch.productId,
        batchCode: batch.batchCode,
        batchId: batch.id,
        quantity: +((line?.quantity || 0) + item.quantity).toFixed(6),
        price: item.price,
      });
    }
  }
  return { sourceTransactions, alreadyRestored, batchQuantities, adjustmentItems: [...adjustmentByBatch.values()], skipped };
}
