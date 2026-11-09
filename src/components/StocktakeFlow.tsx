/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { InventoryBatch, InventoryTransaction, Product, Shift, StocktakeKind } from '../types';
import { createDocumentNumber } from '../sync/documentNumbers';
import { logOperation } from '../utils/logger';
import { buildStocktakeVoucher, planStocktake, type StocktakeCount } from '../utils/stocktake';
import StocktakeDialog from './StocktakeDialog';

/** Everything a stocktake needs from the app. */
export interface StockCheckDeps {
  /** Items that can be counted. */
  products: Product[];
  /** Batches of those items. */
  batches: InventoryBatch[];
  setBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  /** Stock vouchers of the same kind of stock. */
  transactions: InventoryTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<InventoryTransaction[]>>;
  shifts: Shift[];
  storeId: string;
  /** The person counting. */
  user: { uid: string; name: string };
  triggerBeep: (success: boolean) => void;
}

interface StocktakeFlowProps {
  stock: StockCheckDeps;
  /** When in the shift the count starts out as. */
  kind: StocktakeKind;
  /** True to start with the items marked "Kiểm mỗi ca". */
  shiftItemsFirst: boolean;
  onClose: () => void;
}

/**
 * Counting stock end to end: the dialog where the person types the counts, and the recording of the result: stock is
 * set to the counted quantities and one stocktake voucher keeps the differences, the person, the shift of that person
 * (when they have one open) and when in the shift it was made. Used from the stock screen, the shift screen and the
 * shift stock check of staff, so all three record the same way.
 */
export default function StocktakeFlow({ stock, kind, shiftItemsFirst, onClose }: StocktakeFlowProps) {
  /**
   * Records a stocktake.
   *
   * @param counts What was counted.
   * @param note Note typed by the person.
   * @param chosenKind When in the shift the count was made.
   * @throws Error when a count is not valid, nothing differs or the voucher number cannot be issued.
   */
  const record = async (counts: StocktakeCount[], note: string, chosenKind: StocktakeKind) => {
    const plan = planStocktake(counts, stock.products, stock.batches);
    if (plan.items.length === 0) throw new Error('Không có chênh lệch nào để ghi.');
    const myShift = stock.shifts.find(shift => shift.staffId === stock.user.uid && shift.status === 'open');
    const stamp = Date.now();
    const number = await createDocumentNumber('stocktake', stock.storeId, () => `KK-${stamp.toString().slice(-5)}`);
    logOperation('Quản lý kho', 'Kiểm kho', { count: counts.length, different: plan.differences.length, kind: chosenKind });
    stock.setBatches(() => plan.batches);
    stock.setTransactions(prev => [buildStocktakeVoucher({
      id: `TX-${stamp}-KK`,
      transactionNumber: number.number,
      tempCode: number.tempNumber || undefined,
      staffId: stock.user.uid,
      staffName: stock.user.name,
      shiftId: myShift?.id,
      stocktakeKind: chosenKind,
      note: note ? `Kiểm kho - ${note}` : 'Kiểm kho',
      createdAt: new Date().toISOString(),
    }, plan.items), ...prev]);
    stock.triggerBeep(true);
  };

  return <StocktakeDialog products={stock.products} batches={stock.batches} initialKind={kind} shiftItemsFirst={shiftItemsFirst} onConfirm={record} onClose={onClose} />;
}
