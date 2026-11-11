/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryTransaction, InventoryTransactionType, Order } from '../types';

/** Loss of stock that is not a sale: spoilage and expiry written off, and what stocktakes found missing, less what they found extra. */
export interface ShrinkageSummary {
  /** Value of adjustment vouchers (damaged, expired, other losses), counted as a loss. */
  adjustments: number;
  /** Value of stock found missing by stocktakes (positive number). */
  stocktakeShort: number;
  /** Value of stock found extra by stocktakes (positive number); it reduces the shrinkage. */
  stocktakeSurplus: number;
  /** adjustments + stocktakeShort - stocktakeSurplus; negative when stocktakes found more than was lost. */
  total: number;
}

/** Profit of a period. Only orders that recorded their cost are counted in the cost and the profit. */
export interface ProfitSummary {
  /** Revenue of the orders that recorded cost, without VAT. */
  revenueExTax: number;
  /** Cost of the dishes sold, as set up when each order was paid. */
  cost: number;
  /** revenueExTax - cost. */
  grossProfit: number;
  /** Commission kept by sales channels (delivery apps...) on those orders. It is a selling cost, so it is not part of the cost of the dishes. */
  commission: number;
  /** Orders counted above. */
  ordersWithCost: number;
  /** Orders left out because they were paid before cost was recorded. */
  ordersWithoutCost: number;
  shrinkage: ShrinkageSummary;
  /** grossProfit - commission - shrinkage.total: what is left of the sales after the cost of the dishes, the commission and the losses. */
  netProfit: number;
}

/** Start of the note of a voucher that puts stock back because an order or dish was cancelled; it reverses a sale, so it is not a loss. */
const RESTORE_NOTE_PREFIX = 'Hoàn kho do hủy ';

/**
 * Works out gross profit and shrinkage.
 *
 * @param orders Orders of the period that were not cancelled.
 * @param transactions Stock vouchers of the period, of every kind (ingredients and goods).
 * @returns The profit summary.
 */
export function summarizeProfit(orders: Order[], transactions: InventoryTransaction[]): ProfitSummary {
  const withCost = orders.filter(order => order.costRecorded);
  const revenueExTax = withCost.reduce((sum, order) => sum + order.totalAmount - (order.taxAmount || 0), 0);
  const cost = withCost.reduce((sum, order) => sum + (order.totalCost || 0), 0);
  const grossProfit = revenueExTax - cost;
  const commission = withCost.reduce((sum, order) => sum + (order.commissionAmount || 0), 0);

  let adjustments = 0;
  let stocktakeShort = 0;
  let stocktakeSurplus = 0;
  for (const voucher of transactions) {
    if (voucher.type === InventoryTransactionType.ADJUSTMENT && !(voucher.note || '').startsWith(RESTORE_NOTE_PREFIX)) {
      adjustments += voucher.totalAmount || 0;
    } else if (voucher.type === InventoryTransactionType.STOCKTAKE) {
      for (const item of voucher.items) {
        const value = (item.price || 0) * item.quantity;
        if (value < 0) stocktakeShort += -value;
        else stocktakeSurplus += value;
      }
    }
  }
  const total = adjustments + stocktakeShort - stocktakeSurplus;
  return {
    revenueExTax, cost, grossProfit, commission,
    ordersWithCost: withCost.length,
    ordersWithoutCost: orders.length - withCost.length,
    shrinkage: { adjustments, stocktakeShort, stocktakeSurplus, total },
    netProfit: grossProfit - commission - total,
  };
}
