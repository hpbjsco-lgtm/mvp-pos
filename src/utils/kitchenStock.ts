/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryBatch, InventoryTransaction, InventoryTransactionItem, InventoryTransactionType, KitchenItem, KitchenStatus, Product, StockKind, StockPick } from '../types';
import { planDirectDeduction, planRecipeDeduction, type SoldLine } from './recipes';

/** Batch code of the placeholder batch that holds stock below zero for an item that has no batch to take it from. */
export const NEGATIVE_BATCH_CODE = 'ÂM';

/** Start of the note of a voucher that puts stock back because a dish was cancelled. */
export const KITCHEN_RESTORE_NOTE_PREFIX = 'Hoàn kho do hủy món ';

/** Both sets of batches the kitchen takes stock from. */
export interface StockState {
  /** Ingredient batches (dishes made from a recipe). */
  ingredientBatches: InventoryBatch[];
  /** Batches of dishes and toppings that keep their own stock. */
  batches: InventoryBatch[];
}

/** An item that did not have enough stock. */
export interface StockShortage {
  kind: StockKind;
  productId: string;
  /** Quantity the sale needs, in the base unit. */
  needed: number;
  /** Quantity there was in stock before the sale. */
  available: number;
}

/** Result of taking stock for sold dishes. */
export interface DeductionResult {
  /** Batches after the stock was taken; a batch can be below zero when there was not enough. */
  state: StockState;
  /** What was taken from which batch. */
  picks: StockPick[];
  shortages: StockShortage[];
}

const round6 = (value: number) => +value.toFixed(6);

/**
 * Takes quantities out of batches. A batch may end below zero.
 *
 * @param batches Batches before.
 * @param picks What to take.
 * @returns New batch list.
 */
function applyTakes(batches: InventoryBatch[], picks: StockPick[]): InventoryBatch[] {
  const taken = new Map<string, number>();
  for (const pick of picks) taken.set(pick.batchId, (taken.get(pick.batchId) || 0) + pick.take);
  return batches.map(batch => (taken.has(batch.id) ? { ...batch, quantity: round6(batch.quantity - (taken.get(batch.id) || 0)) } : batch));
}

/**
 * Takes the missing quantity of an item from a batch that goes below zero: the placeholder batch when the item has
 * one, otherwise the batch with the latest expiry, otherwise a new placeholder batch.
 *
 * @param batches Batches before.
 * @param kind Which set the batches belong to.
 * @param productId Item that is short.
 * @param missing Quantity missing.
 * @param price Cost of one unit, kept on a new placeholder batch.
 * @returns The new batches and the pick that records the quantity.
 */
function overdraw(batches: InventoryBatch[], kind: StockKind, productId: string, missing: number, price: number | undefined): { batches: InventoryBatch[]; pick: StockPick } {
  const own = batches.filter(batch => batch.productId === productId);
  const target = own.find(batch => batch.batchCode === NEGATIVE_BATCH_CODE)
    ?? [...own].sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime())[0];
  if (target) {
    return {
      batches: batches.map(batch => (batch.id === target.id ? { ...batch, quantity: round6(batch.quantity - missing) } : batch)),
      pick: { kind, batchId: target.id, productId, batchCode: target.batchCode, take: round6(missing), price: target.importPrice },
    };
  }
  const placeholder: InventoryBatch = {
    id: `NEG-${productId}`, productId, batchCode: NEGATIVE_BATCH_CODE, expiryDate: '2099-12-31', importPrice: price,
    quantity: round6(-missing), originalQuantity: 0, createdAt: new Date().toISOString(),
  };
  return { batches: [placeholder, ...batches], pick: { kind, batchId: placeholder.id, productId, batchCode: placeholder.batchCode, take: round6(missing), price } };
}

/**
 * Takes the stock a sold line needs: ingredients of the recipe of the dish and of its toppings, and the own stock of
 * regular dishes and toppings, in FEFO order. What cannot be covered is taken as well and leaves a batch below zero,
 * and is reported in `shortages` so the caller can warn.
 *
 * @param line The dish, the number of portions and the toppings chosen with each portion.
 * @param products Dishes and toppings.
 * @param ingredients Ingredients.
 * @param state Batches before.
 * @returns The batches after, what was taken and what was short.
 */
export function deductForLine(line: SoldLine, products: Product[], ingredients: Product[], state: StockState): DeductionResult {
  const picks: StockPick[] = [];
  const shortages: StockShortage[] = [];
  let ingredientBatches = state.ingredientBatches;
  let batches = state.batches;

  const recipe = planRecipeDeduction([line], products, ingredients, ingredientBatches);
  const recipePicks: StockPick[] = recipe.picks.map(pick => ({ kind: 'ingredient', batchId: pick.batch.id, productId: pick.batch.productId, batchCode: pick.batch.batchCode, take: round6(pick.take), price: pick.batch.importPrice }));
  ingredientBatches = applyTakes(ingredientBatches, recipePicks);
  picks.push(...recipePicks);
  for (const missing of recipe.shortages) {
    const available = round6(recipePicks.filter(pick => pick.productId === missing.ingredientId).reduce((sum, pick) => sum + pick.take, 0));
    shortages.push({ kind: 'ingredient', productId: missing.ingredientId, needed: round6(available + missing.missing), available });
    const drawn = overdraw(ingredientBatches, 'ingredient', missing.ingredientId, missing.missing, ingredients.find(item => item.id === missing.ingredientId)?.cost);
    ingredientBatches = drawn.batches;
    picks.push(drawn.pick);
  }

  const direct = planDirectDeduction([line], products, batches);
  const directPicks: StockPick[] = direct.picks.map(pick => ({ kind: 'product', batchId: pick.batch.id, productId: pick.batch.productId, batchCode: pick.batch.batchCode, take: round6(pick.take), price: pick.batch.importPrice }));
  batches = applyTakes(batches, directPicks);
  picks.push(...directPicks);
  for (const missing of direct.shortages) {
    const available = round6(directPicks.filter(pick => pick.productId === missing.ingredientId).reduce((sum, pick) => sum + pick.take, 0));
    shortages.push({ kind: 'product', productId: missing.ingredientId, needed: round6(available + missing.missing), available });
    const drawn = overdraw(batches, 'product', missing.ingredientId, missing.missing, products.find(item => item.id === missing.ingredientId)?.cost);
    batches = drawn.batches;
    picks.push(drawn.pick);
  }
  return { state: { ingredientBatches, batches }, picks, shortages };
}

/** Result of taking stock for several lines, one after the other. */
export interface LinesDeduction {
  state: StockState;
  /** What each line took, in the order of the lines. */
  picksPerLine: StockPick[][];
  /** Items that were short, one entry per item. */
  shortages: StockShortage[];
}

/**
 * Takes the stock of several lines one after the other, so a later line sees what the earlier ones took.
 *
 * @param lines Sold lines.
 * @param products Dishes and toppings.
 * @param ingredients Ingredients.
 * @param state Batches before.
 * @returns The batches after, the picks of each line and the combined shortages.
 */
export function deductForLines(lines: SoldLine[], products: Product[], ingredients: Product[], state: StockState): LinesDeduction {
  let current = state;
  const picksPerLine: StockPick[][] = [];
  const shortageByItem = new Map<string, StockShortage>();
  for (const line of lines) {
    const result = deductForLine(line, products, ingredients, current);
    current = result.state;
    picksPerLine.push(result.picks);
    for (const shortage of result.shortages) {
      const key = `${shortage.kind}:${shortage.productId}`;
      const known = shortageByItem.get(key);
      shortageByItem.set(key, known ? { ...known, needed: round6(known.needed + shortage.needed), available: round6(known.available + shortage.available) } : shortage);
    }
  }
  return { state: current, picksPerLine, shortages: [...shortageByItem.values()] };
}

/**
 * Words for the warning shown before sending dishes that the stock cannot cover.
 *
 * @param shortages Items that were short.
 * @param nameOf Name and unit of an item.
 * @returns One line per item, for example "Sữa tươi: cần 0,4 Lít, còn 0,1 Lít".
 */
export function describeShortages(shortages: StockShortage[], nameOf: (kind: StockKind, productId: string) => { name: string; unit: string }): string[] {
  return shortages.map(shortage => {
    const { name, unit } = nameOf(shortage.kind, shortage.productId);
    const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    return `${name}: cần ${number(shortage.needed)}${unit ? ` ${unit}` : ''}, còn ${number(Math.max(0, shortage.available))}${unit ? ` ${unit}` : ''}`;
  });
}

/**
 * Adds quantities back into batches.
 *
 * @param batches Batches before.
 * @param picks What to put back.
 * @returns New batch list.
 */
export function applyRestore(batches: InventoryBatch[], picks: StockPick[]): InventoryBatch[] {
  const back = new Map<string, number>();
  for (const pick of picks) back.set(pick.batchId, (back.get(pick.batchId) || 0) + pick.take);
  return batches.map(batch => (back.has(batch.id) ? { ...batch, quantity: round6(batch.quantity + (back.get(batch.id) || 0)) } : batch));
}

/**
 * Multiplies the quantities of picks, for the share of a ticket that was cancelled or moved.
 *
 * @param picks Picks of a ticket.
 * @param factor Share between 0 and 1.
 * @returns New picks; quantities that round to nothing are dropped.
 */
export function scalePicks(picks: StockPick[], factor: number): StockPick[] {
  return picks.map(pick => ({ ...pick, take: round6(pick.take * factor) })).filter(pick => pick.take > 1e-9);
}

/**
 * Splits the stock fields of a ticket when some of its portions move to another ticket (split or join orders).
 *
 * @param ticket The ticket that gives portions away.
 * @param portions Portions that move.
 * @returns The stock fields of the part that stays and of the part that moves.
 */
export function splitTicketStock(ticket: Pick<KitchenItem, 'stockPortions' | 'stockPicks'>, portions: number): { kept: Pick<KitchenItem, 'stockPortions' | 'stockPicks'>; moved: Pick<KitchenItem, 'stockPortions' | 'stockPicks'> } {
  const stock = ticket.stockPortions || 0;
  if (stock <= 0) return { kept: { stockPortions: undefined, stockPicks: undefined }, moved: { stockPortions: undefined, stockPicks: undefined } };
  const movedPortions = Math.min(stock, portions);
  const share = movedPortions / stock;
  const picks = ticket.stockPicks || [];
  return {
    kept: { stockPortions: round6(stock - movedPortions) || undefined, stockPicks: scalePicks(picks, 1 - share) },
    moved: { stockPortions: movedPortions, stockPicks: scalePicks(picks, share) },
  };
}

/** Stock that returns because of cancelled portions of the tickets of one send-to-kitchen action. */
export interface KitchenRestore {
  /** The send action (`KitchenItem.orderId`). */
  sendId: string;
  /** Table the cancelled dishes were for. */
  tableNumber: string;
  picks: StockPick[];
}

/**
 * Brings the stock fields of kitchen tickets in line with what is left of them: a cancelled ticket, or one with fewer
 * portions than it took stock for, gives the difference back. Running it again changes nothing.
 * Served tickets keep their stock (the dish was made).
 *
 * @param items All kitchen tickets after a change.
 * @returns The tickets with their stock fields settled, and the stock to put back per send action.
 */
export function settleKitchenStock(items: KitchenItem[]): { items: KitchenItem[]; restores: KitchenRestore[] } {
  const restores = new Map<string, KitchenRestore>();
  const settled = items.map(item => {
    const stock = item.stockPortions || 0;
    if (stock <= 0 || item.status === KitchenStatus.SERVED) return item;
    const wanted = item.status === KitchenStatus.CANCELLED ? 0 : Math.min(stock, item.quantity);
    if (wanted >= stock) return item;
    const give = (item.stockPicks || []).length > 0 ? scalePicks(item.stockPicks || [], (stock - wanted) / stock) : [];
    if (give.length > 0) {
      const known = restores.get(item.orderId);
      restores.set(item.orderId, { sendId: item.orderId, tableNumber: item.tableNumber || '', picks: [...(known?.picks || []), ...give] });
    }
    return { ...item, stockPortions: wanted > 0 ? wanted : undefined, stockPicks: wanted > 0 ? scalePicks(item.stockPicks || [], wanted / stock) : undefined };
  });
  return { items: settled, restores: [...restores.values()] };
}

/**
 * Totals picks per batch as the lines of a stock voucher.
 *
 * @param picks What was taken or put back.
 * @returns One line per batch.
 */
export function picksToVoucherItems(picks: StockPick[]): InventoryTransactionItem[] {
  const byBatch = new Map<string, InventoryTransactionItem>();
  for (const pick of picks) {
    const line = byBatch.get(pick.batchId);
    byBatch.set(pick.batchId, { productId: pick.productId, batchId: pick.batchId, batchCode: pick.batchCode, quantity: round6((line?.quantity || 0) + pick.take), price: pick.price });
  }
  return [...byBatch.values()];
}

/**
 * Builds a stock voucher from picks.
 *
 * @param base Fields every voucher needs (id, number, who, when, note) plus the links to the sale.
 * @param type Export for stock taken, adjustment for stock put back.
 * @param picks What was taken or put back.
 * @returns The voucher.
 */
export function buildStockVoucher(
  base: Pick<InventoryTransaction, 'id' | 'transactionNumber' | 'tempCode' | 'staffId' | 'note' | 'createdAt' | 'orderId' | 'kitchenBatchId'>,
  type: InventoryTransactionType.EXPORT | InventoryTransactionType.ADJUSTMENT,
  picks: StockPick[],
): InventoryTransaction {
  const items = picksToVoucherItems(picks);
  return { ...base, type, items, totalAmount: items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0) };
}

/**
 * Works out what is still to be taken from stock when an order is paid: for each line, the portions that no kitchen
 * ticket took stock for. Lines that are fully covered are left out.
 *
 * @param lines Lines of the order.
 * @param tickets Kitchen tickets of the order that are not cancelled.
 * @param ticketBelongsToLine True when a ticket was sent for exactly that line.
 * @returns The lines to take stock for, with the portions still missing.
 */
export function unstockedLines<L extends { productId: string; quantity: number; toppings?: { productId: string; quantity: number }[] }>(
  lines: L[],
  tickets: KitchenItem[],
  ticketBelongsToLine: (ticket: KitchenItem, line: L) => boolean,
): SoldLine[] {
  return lines
    .map(line => ({
      productId: line.productId,
      quantity: Math.max(0, line.quantity - tickets.filter(ticket => ticketBelongsToLine(ticket, line)).reduce((sum, ticket) => sum + (ticket.stockPortions || 0), 0)),
      toppings: line.toppings,
    }))
    .filter(line => line.quantity > 0);
}
