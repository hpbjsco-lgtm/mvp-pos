/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createDocumentNumber } from '../sync/documentNumbers';
import { InventoryBatch, InventoryTransaction, InventoryTransactionType } from '../types';
import { applyRestore, buildStockVoucher, KITCHEN_RESTORE_NOTE_PREFIX, type KitchenRestore } from './kitchenStock';

/** Where the stock of dishes is kept, and who is putting it back. */
export interface RestoreTargets {
  storeId: string;
  /** Id of the person who cancelled, for the voucher. */
  staffId: string;
  setIngredientBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  setBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  setIngredientTransactions: React.Dispatch<React.SetStateAction<InventoryTransaction[]>>;
  setTransactions: React.Dispatch<React.SetStateAction<InventoryTransaction[]>>;
}

/**
 * Puts stock back for dishes whose kitchen tickets were cancelled or reduced: the quantities return to the batches they
 * were taken from, and an adjustment voucher records it for each send-to-kitchen action. Used by the sales screen and by
 * the kitchen screen, so both give the stock back the same way.
 *
 * @param restores Stock to put back, per send action (see `settleKitchenStock`).
 * @param targets Where the stock is kept.
 * @throws Error when a voucher number cannot be issued.
 */
export async function applyKitchenRestores(restores: KitchenRestore[], targets: RestoreTargets): Promise<void> {
  for (const restore of restores) {
    for (const kind of ['ingredient', 'product'] as const) {
      const picks = restore.picks.filter(pick => pick.kind === kind);
      if (picks.length === 0) continue;
      (kind === 'ingredient' ? targets.setIngredientBatches : targets.setBatches)(prev => applyRestore(prev, picks));
      const stamp = Date.now();
      const number = await createDocumentNumber('export', targets.storeId, () => `PXK-${stamp.toString().slice(-5)}`);
      (kind === 'ingredient' ? targets.setIngredientTransactions : targets.setTransactions)(prev => [buildStockVoucher({
        id: `TX-${stamp}-${kind === 'ingredient' ? 'RI' : 'RP'}-${restore.sendId}`,
        transactionNumber: number.number,
        tempCode: number.tempNumber || undefined,
        staffId: targets.staffId,
        note: `${KITCHEN_RESTORE_NOTE_PREFIX}${restore.tableNumber}`.trim(),
        createdAt: new Date().toISOString(),
        kitchenBatchId: restore.sendId,
      }, InventoryTransactionType.ADJUSTMENT, picks), ...prev]);
    }
  }
}
