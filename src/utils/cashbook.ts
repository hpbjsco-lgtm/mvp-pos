/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BankAccount, CashVoucher, FundType, Order } from '../types';
import { getOrderPayments } from './payments';

export const FUND_LABELS: Record<FundType, string> = { cash: 'Tiền mặt', bank: 'Ngân hàng', wallet: 'Ví điện tử' };

/** Loại thu / chi gợi ý khi lập phiếu (nhập tự do được). */
export const RECEIPT_CATEGORIES = ['Thu khác', 'Vốn góp / Số dư đầu kỳ', 'Hoàn tiền từ nhà cung cấp'];
export const PAYMENT_CATEGORIES = ['Chi nhập hàng / nguyên liệu', 'Chi lương nhân viên', 'Chi mặt bằng, điện nước', 'Chi marketing', 'Chi sửa chữa, vật tư', 'Chi khác'];
export const SALES_CATEGORY = 'Thu tiền bán hàng';

export interface LedgerEntry {
  id: string;
  code: string;
  time: string;
  kind: 'receipt' | 'payment';
  fund: FundType;
  bankAccountId?: string;
  category: string;
  counterparty: string;
  amount: number;
  source: 'sale' | 'voucher';
  status: 'paid' | 'cancelled';
  note?: string;
}

/**
 * Sổ quỹ = các khoản thu từ hóa đơn bán hàng (tự động, theo từng phương thức thanh toán)
 * + phiếu thu / chi lập tay. Không nhân đôi dữ liệu: huỷ hóa đơn thì khoản thu tự mất khỏi sổ.
 */
export function buildLedger(orders: Order[], vouchers: CashVoucher[], accounts: BankAccount[]): LedgerEntry[] {
  const defaultBankId = accounts.find(a => a.isDefault)?.id || accounts[0]?.id;
  const entries: LedgerEntry[] = [];

  for (const o of orders) {
    const voided = (o.status || 'completed') === 'void';
    getOrderPayments(o).forEach((p, i) => {
      const fund: FundType = p.method === 'cash' ? 'cash' : 'bank';
      entries.push({
        id: `sale-${o.id}-${i}`,
        code: o.orderNumber,
        time: o.createdAt,
        kind: 'receipt',
        fund,
        bankAccountId: fund === 'bank' ? (p.bankAccountId || defaultBankId) : undefined,
        category: SALES_CATEGORY,
        counterparty: o.customerName || 'Khách lẻ',
        amount: p.amount,
        source: 'sale',
        status: voided ? 'cancelled' : 'paid',
        note: o.tableNumber ? `Đơn ${o.tableNumber}` : undefined,
      });
    });
  }

  for (const v of vouchers) {
    entries.push({
      id: `voucher-${v.id}`,
      code: v.code,
      time: v.createdAt,
      kind: v.type,
      fund: v.fund,
      bankAccountId: v.fund === 'bank' ? (v.bankAccountId || defaultBankId) : undefined,
      category: v.category,
      counterparty: v.counterparty || '',
      amount: v.amount,
      source: 'voucher',
      status: v.status,
      note: v.note,
    });
  }

  return entries.sort((a, b) => b.time.localeCompare(a.time));
}

export interface LedgerFilter {
  fund: FundType | 'all';
  bankAccountId?: string; // chỉ áp dụng khi fund = bank
  from?: number; // epoch ms
  to?: number;
}

const matchFund = (e: LedgerEntry, f: LedgerFilter) =>
  (f.fund === 'all' || e.fund === f.fund) && (!f.bankAccountId || e.bankAccountId === f.bankAccountId);

export interface LedgerSummary { opening: number; totalIn: number; totalOut: number; closing: number }

export function summarize(entries: LedgerEntry[], filter: LedgerFilter): LedgerSummary {
  let opening = 0, totalIn = 0, totalOut = 0;
  for (const e of entries) {
    if (e.status !== 'paid' || !matchFund(e, filter)) continue;
    const t = new Date(e.time).getTime();
    const signed = e.kind === 'receipt' ? e.amount : -e.amount;
    if (filter.from !== undefined && t < filter.from) opening += signed;
    else if (filter.to === undefined || t <= filter.to) {
      if (e.kind === 'receipt') totalIn += e.amount; else totalOut += e.amount;
    }
  }
  return { opening, totalIn, totalOut, closing: opening + totalIn - totalOut };
}

/** Các khoản trong kỳ (đã lọc quỹ / tài khoản / thời gian), mới nhất trước. */
export function entriesInRange(entries: LedgerEntry[], filter: LedgerFilter): LedgerEntry[] {
  return entries.filter(e => {
    if (!matchFund(e, filter)) return false;
    const t = new Date(e.time).getTime();
    return (filter.from === undefined || t >= filter.from) && (filter.to === undefined || t <= filter.to);
  });
}

export interface CategoryTotal { category: string; kind: 'receipt' | 'payment'; total: number; count: number }

/** Dòng tiền theo từng loại thu / chi (chỉ tính khoản đã thanh toán). */
export function breakdownByCategory(entries: LedgerEntry[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const e of entries) {
    if (e.status !== 'paid') continue;
    const key = `${e.kind}|${e.category}`;
    const cur = map.get(key) || { category: e.category, kind: e.kind, total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.kind === b.kind ? b.total - a.total : a.kind === 'receipt' ? -1 : 1));
}

export type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export function presetRange(preset: RangePreset, now = new Date()): { from: number; to: number } {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (preset === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  } else if (preset === 'month') {
    start.setDate(1);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  }
  return { from: start.getTime(), to: end.getTime() };
}

/** Mã phiếu kế tiếp: PT0001 (thu) / PC0001 (chi). */
export function nextVoucherCode(vouchers: CashVoucher[], type: 'receipt' | 'payment'): string {
  const prefix = type === 'receipt' ? 'PT' : 'PC';
  const max = vouchers
    .filter(v => v.code.startsWith(prefix))
    .reduce((m, v) => Math.max(m, parseInt(v.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
