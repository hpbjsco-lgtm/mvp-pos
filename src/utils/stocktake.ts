/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryBatch, InventoryTransaction, InventoryTransactionItem, InventoryTransactionType, Product, StocktakeKind } from '../types';
import { NEGATIVE_BATCH_CODE } from './kitchenStock';
import { stockOf } from './inventoryItems';

/** What was counted for one item. */
export interface StocktakeCount {
  productId: string;
  /** Quantity found when counting, in the base unit; never negative. */
  counted: number;
}

/** The difference between the system and the count for one item. */
export interface StocktakeDifference {
  productId: string;
  /** Stock the system had. */
  system: number;
  counted: number;
  /** counted - system: positive when there is more than the system said. */
  delta: number;
}

/** What a stocktake does to stock. */
export interface StocktakePlan {
  /** Batches after the stocktake (new batches included). */
  batches: InventoryBatch[];
  /**
   * Lines of the stocktake voucher, one per item that differs: the signed difference (+ more than the system said,
   * - less), the stock before and the quantity counted, the batches that changed, and the average price of those
   * batches so that price x quantity is the value of the difference.
   */
  items: InventoryTransactionItem[];
  /** Items whose count differs from the system. */
  differences: StocktakeDifference[];
}

const round6 = (value: number) => +value.toFixed(6);

/** Date as yyyymmdd for the code of a batch made by a stocktake. */
const compactDate = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

/**
 * Plans the change to stock that brings the system in line with a count. For an item that has less than counted, batches
 * below zero are filled up to zero first and the rest goes to the batch with the latest expiry, or to a new batch
 * `KK-yyyymmdd` when the item has none. For an item that has more than counted, the difference is taken out of the
 * batches with stock in FEFO order. Items whose count equals the system change nothing.
 *
 * @param counts What was counted.
 * @param products Items that can be counted (their cost is kept on a new batch).
 * @param batches Batches before.
 * @param now Time of the stocktake.
 * @returns The batches after, the signed voucher lines and the differences.
 * @throws {Error} When a count is not a number of 0 or more.
 */
export function planStocktake(counts: StocktakeCount[], products: Product[], batches: InventoryBatch[], now: Date = new Date()): StocktakePlan {
  let current = batches;
  const differences: StocktakeDifference[] = [];
  /** Value (signed) and codes of the batches that changed, per item. */
  const touched = new Map<string, { value: number; codes: string[] }>();

  /** Adds a signed quantity to a batch of the current list and remembers its value for the voucher line. */
  const change = (batchId: string, quantity: number) => {
    current = current.map(batch => (batch.id === batchId ? { ...batch, quantity: round6(batch.quantity + quantity) } : batch));
    const batch = current.find(candidate => candidate.id === batchId)!;
    const known = touched.get(batch.productId) ?? { value: 0, codes: [] };
    touched.set(batch.productId, {
      value: known.value + (batch.importPrice || 0) * quantity,
      codes: known.codes.includes(batch.batchCode) ? known.codes : [...known.codes, batch.batchCode],
    });
  };

  for (const { productId, counted } of counts) {
    if (!Number.isFinite(counted) || counted < 0) throw new Error(`Số đếm của hàng "${productId}" phải là số từ 0 trở lên.`);
    const system = round6(stockOf(productId, current));
    const delta = round6(counted - system);
    if (Math.abs(delta) < 1e-9) continue;
    differences.push({ productId, system, counted, delta });

    const own = current.filter(batch => batch.productId === productId);
    const byExpiry = (a: InventoryBatch, b: InventoryBatch) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    if (delta < 0) {
      let left = -delta;
      for (const lot of own.filter(batch => batch.quantity > 0).sort(byExpiry)) {
        if (left <= 1e-9) break;
        const take = Math.min(lot.quantity, left);
        change(lot.id, -take);
        left = round6(left - take);
      }
      continue;
    }
    let left = delta;
    const negatives = own.filter(batch => batch.quantity < 0).sort((a, b) => Number(b.batchCode === NEGATIVE_BATCH_CODE) - Number(a.batchCode === NEGATIVE_BATCH_CODE) || byExpiry(a, b));
    for (const lot of negatives) {
      if (left <= 1e-9) break;
      const fill = Math.min(-lot.quantity, left);
      change(lot.id, fill);
      left = round6(left - fill);
    }
    if (left > 1e-9) {
      const target = [...own].sort((a, b) => byExpiry(b, a))[0];
      if (target) {
        change(target.id, left);
      } else {
        const product = products.find(item => item.id === productId);
        const created: InventoryBatch = {
          id: `KK-${productId}-${now.getTime()}`, productId, batchCode: `KK-${compactDate(now)}`, expiryDate: '2099-12-31', importPrice: product?.cost,
          quantity: 0, originalQuantity: left, createdAt: now.toISOString(),
        };
        current = [created, ...current];
        change(created.id, left);
      }
    }
  }
  const items: InventoryTransactionItem[] = differences.map(difference => {
    const changed = touched.get(difference.productId) ?? { value: 0, codes: [] };
    return {
      productId: difference.productId,
      batchCode: changed.codes.join(', '),
      quantity: difference.delta,
      price: round6(changed.value / difference.delta),
      systemQuantity: difference.system,
      countedQuantity: difference.counted,
    };
  });
  return { batches: current, items, differences };
}

/**
 * Builds the stocktake voucher.
 *
 * @param base Fields every voucher needs, plus who counted (`staffName`), the shift and when in the shift.
 * @param items Lines from `planStocktake`.
 * @returns The voucher; its total is the signed value of the change.
 */
export function buildStocktakeVoucher(
  base: Pick<InventoryTransaction, 'id' | 'transactionNumber' | 'tempCode' | 'staffId' | 'staffName' | 'note' | 'createdAt' | 'shiftId' | 'stocktakeKind'>,
  items: InventoryTransactionItem[],
): InventoryTransaction {
  return { ...base, type: InventoryTransactionType.STOCKTAKE, items, totalAmount: items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0) };
}

/** Words for each kind of stocktake. */
export const STOCKTAKE_KIND_LABELS: Record<StocktakeKind, string> = { open: 'Đầu ca', close: 'Cuối ca', periodic: 'Định kỳ' };
