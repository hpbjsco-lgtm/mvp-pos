/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryTransaction, InventoryTransactionItem, InventoryTransactionType, Product, Shift, StocktakeKind } from '../types';
import { toCsv } from './csv';
import { STOCKTAKE_KIND_LABELS } from './stocktake';

/** One stocktake as listed in the history. */
export interface StocktakeEntry {
  voucher: InventoryTransaction;
  /** Items that differ from the system (every line of a stocktake voucher is a difference). */
  differentItems: number;
  /** Value of what was found missing (positive number). */
  shortValue: number;
  /** Value of what was found extra (positive number). */
  surplusValue: number;
  /** surplusValue - shortValue: negative when more was missing than extra. */
  netValue: number;
  /** Name of the shift, or empty when the stocktake was not made in a shift. */
  shiftName: string;
}

/** What the history can be narrowed by. */
export interface StocktakeFilter {
  /** Start of the period (milliseconds), inclusive; omit for no start. */
  from?: number;
  /** End of the period (milliseconds), inclusive; omit for no end. */
  to?: number;
  /** Id of a shift; empty for all. */
  shiftId?: string;
  kind?: StocktakeKind | '';
  /** Staff name; empty for all. */
  staffName?: string;
  /** Text matched against the code and name of the items counted. */
  item?: string;
}

/**
 * Names the shift a stocktake belongs to: the day, who worked it and when it opened.
 *
 * @param shift The shift.
 * @returns For example "An, mở 09/11 08:00".
 */
export function describeShift(shift: Pick<Shift, 'staffName' | 'openedAt'>): string {
  const opened = new Date(shift.openedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shift.staffName}, mở ${pad(opened.getDate())}/${pad(opened.getMonth() + 1)} ${pad(opened.getHours())}:${pad(opened.getMinutes())}`;
}

/**
 * Lists the stocktakes, newest first, with their totals.
 *
 * @param transactions Stock vouchers of one kind (every voucher that is not a stocktake is ignored).
 * @param shifts Shifts, to name the shift of each stocktake.
 * @param filter What to narrow the list by.
 * @param products Items, to match the item text against names and codes.
 * @returns The matching stocktakes.
 */
export function listStocktakes(transactions: InventoryTransaction[], shifts: Shift[], filter: StocktakeFilter = {}, products: Product[] = []): StocktakeEntry[] {
  const shiftById = new Map(shifts.map(shift => [shift.id, shift]));
  const productById = new Map(products.map(product => [product.id, product]));
  const text = (filter.item ?? '').trim().toLowerCase();
  return transactions
    .filter(voucher => voucher.type === InventoryTransactionType.STOCKTAKE)
    .filter(voucher => {
      const time = new Date(voucher.createdAt).getTime();
      if (filter.from !== undefined && time < filter.from) return false;
      if (filter.to !== undefined && time > filter.to) return false;
      if (filter.shiftId && voucher.shiftId !== filter.shiftId) return false;
      if (filter.kind && voucher.stocktakeKind !== filter.kind) return false;
      if (filter.staffName && (voucher.staffName || '') !== filter.staffName) return false;
      if (text && !voucher.items.some(item => {
        const product = productById.get(item.productId);
        return (product?.name || '').toLowerCase().includes(text) || (product?.sku || '').toLowerCase().includes(text);
      })) return false;
      return true;
    })
    .map(voucher => {
      let shortValue = 0;
      let surplusValue = 0;
      for (const item of voucher.items) {
        const value = (item.price || 0) * item.quantity;
        if (value < 0) shortValue += -value; else surplusValue += value;
      }
      const shift = voucher.shiftId ? shiftById.get(voucher.shiftId) : undefined;
      return { voucher, differentItems: voucher.items.length, shortValue, surplusValue, netValue: surplusValue - shortValue, shiftName: shift ? describeShift(shift) : '' };
    })
    .sort((a, b) => b.voucher.createdAt.localeCompare(a.voucher.createdAt));
}

/**
 * Value of one line of a stocktake: the difference times the average price of the batches that changed.
 *
 * @param item A line of a stocktake voucher.
 * @returns Signed value (negative for missing stock).
 */
export const lineValue = (item: InventoryTransactionItem): number => (item.price || 0) * item.quantity;

/**
 * The stocktakes as a CSV file, one row per counted line.
 *
 * @param entries Stocktakes to write.
 * @param products Items, for their code, name and unit.
 * @returns CSV text.
 */
export function stocktakesToCsv(entries: StocktakeEntry[], products: Product[]): string {
  const productById = new Map(products.map(product => [product.id, product]));
  const when = (iso: string) => {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  return toCsv([
    ['Số phiếu', 'Thời gian', 'Loại kiểm', 'Ca', 'Người kiểm', 'Mã hàng', 'Tên hàng', 'Đơn vị', 'Tồn hệ thống', 'Đếm thực tế', 'Chênh lệch', 'Giá trị chênh lệch', 'Ghi chú'],
    ...entries.flatMap(entry => entry.voucher.items.map(item => {
      const product = productById.get(item.productId);
      return [
        entry.voucher.transactionNumber, when(entry.voucher.createdAt), entry.voucher.stocktakeKind ? STOCKTAKE_KIND_LABELS[entry.voucher.stocktakeKind] : '', entry.shiftName,
        entry.voucher.staffName ?? '', product?.sku ?? '', product?.name ?? '', product?.unit ?? '', item.systemQuantity ?? '', item.countedQuantity ?? '', item.quantity,
        Math.round(lineValue(item)), entry.voucher.note ?? '',
      ];
    })),
  ]);
}
