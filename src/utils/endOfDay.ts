/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BankAccount, CashVoucher, DiningTable, Order, Product, Zone } from '../types';
import { buildLedger, SALES_CATEGORY } from './cashbook';
import { getOrderPayments } from './payments';
import { lineUnitPrice } from './toppings';
import { resolvePrimaryId, getTableStats, isVirtualCartId, DELIVERY_ID, TAKEAWAY_ID } from './tableOps';
import type { CartLine } from '../components/POSScreen';

export interface EodInput {
  orders: Order[];
  vouchers: CashVoucher[];
  accounts: BankAccount[];
  carts: Record<string, CartLine[]>;
  products: Product[];
  tables: DiningTable[];
  zones: Zone[];
  from: number;
  to: number;
}

export interface ItemTotal { name: string; value: number; quantity: number }

export interface EodReport {
  // Tổng hợp
  orderCount: number;
  grossRevenue: number; // Doanh thu tổng (trước giảm giá)
  invoiceDiscount: number;
  revenue: number; // Sau giảm giá, gồm thuế
  tax: number;
  otherIncome: number; // Thu khác (phiếu thu lập tay)
  voidCount: number;
  voidValue: number;
  netExcludingOther: number; // Doanh thu thuần (không gồm thu khác) = doanh thu - thuế
  netIncludingOther: number;
  // Thu chi
  salesByMethod: { total: number; cash: number; transfer: number; card: number; wallet: number };
  pointsEarned: number;
  receipts: { total: number; cash: number; bank: number; wallet: number };
  payments: { total: number; cash: number; bank: number; wallet: number };
  // Hàng hóa
  serving: { value: number; quantity: number; items: ItemTotal[] };
  sold: { value: number; quantity: number; items: ItemTotal[] };
  // Phòng bàn
  byType: { dineIn: { value: number; count: number }; takeaway: { value: number; count: number }; delivery: { value: number; count: number } };
  byTable: { name: string; zone?: string; value: number; count: number }[];
  // Đang phục vụ (thời điểm hiện tại)
  openOrders: number;
  openValue: number;
  tablesInUse: number;
  tablesTotal: number;
  guestsInService: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function addItem(map: Map<string, ItemTotal>, name: string, value: number, quantity: number) {
  const cur = map.get(name) || { name, value: 0, quantity: 0 };
  cur.value += value;
  cur.quantity += quantity;
  map.set(name, cur);
}
const sortedItems = (m: Map<string, ItemTotal>) => [...m.values()].sort((a, b) => b.value - a.value);

/** Báo cáo cuối ngày / theo kỳ: tổng hợp bán hàng, thu chi, hàng hóa, phòng bàn + trạng thái đang phục vụ. */
export function computeEndOfDay(input: EodInput): EodReport {
  const { orders, vouchers, accounts, carts, products, tables, zones, from, to } = input;
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= from && t <= to; };

  const periodOrders = orders.filter(o => inRange(o.createdAt));
  const done = periodOrders.filter(o => (o.status || 'completed') !== 'void');
  const voided = periodOrders.filter(o => (o.status || 'completed') === 'void');

  const revenue = sum(done.map(o => o.totalAmount));
  const tax = sum(done.map(o => o.taxAmount || 0));
  const periodVouchers = vouchers.filter(v => v.status === 'paid' && inRange(v.createdAt));
  const otherIncome = sum(periodVouchers.filter(v => v.type === 'receipt').map(v => v.amount));
  const netExcludingOther = revenue - tax;

  // Thu bán hàng theo phương thức
  const parts = done.flatMap(o => getOrderPayments(o));
  const methodSum = (m: 'cash' | 'qr' | 'card') => sum(parts.filter(p => p.method === m).map(p => p.amount));
  const salesByMethod = { total: sum(parts.map(p => p.amount)), cash: methodSum('cash'), transfer: methodSum('qr'), card: methodSum('card'), wallet: 0 };

  // Phiếu thu / chi lập tay theo quỹ
  const ledger = buildLedger([], periodVouchers, accounts).filter(e => e.status === 'paid');
  const byFund = (kind: 'receipt' | 'payment') => {
    const xs = ledger.filter(e => e.kind === kind);
    const f = (fund: string) => sum(xs.filter(e => e.fund === fund).map(e => e.amount));
    return { total: sum(xs.map(e => e.amount)), cash: f('cash'), bank: f('bank'), wallet: f('wallet') };
  };

  // Hàng hóa đã bán
  const soldMap = new Map<string, ItemTotal>();
  done.forEach(o => o.items.forEach(i => addItem(soldMap, i.name, i.price * i.quantity, i.quantity)));
  const soldItems = sortedItems(soldMap);

  // Đang phục vụ: giỏ đang mở
  const servingMap = new Map<string, ItemTotal>();
  let openOrders = 0;
  Object.entries(carts).forEach(([key, lines]) => {
    if (!lines || lines.length === 0) return;
    // giỏ của bàn phụ không tồn tại (đã gộp vào bàn chính) nên chỉ cần đếm giỏ có món
    openOrders += 1;
    lines.forEach(l => {
      const p = products.find(x => x.id === l.productId);
      addItem(servingMap, p?.name || 'Món', lineUnitPrice(l, products) * l.quantity, l.quantity);
    });
    void key;
  });
  const servingItems = sortedItems(servingMap);

  const primaryIds = new Set(tables.map(t => resolvePrimaryId(tables, t.id)));
  const busyPrimaries = [...primaryIds].map(id => tables.find(t => t.id === id)!).filter(Boolean)
    .filter(t => getTableStats(t, tables, carts, products).isOccupied);
  const tablesInUse = tables.filter(t => getTableStats(t, tables, carts, products).isOccupied).length;
  const guestsInService = sum(busyPrimaries.map(t => t.guestCount || 0));

  // Loại đơn + theo bàn
  const typeOf = (o: Order): 'dineIn' | 'takeaway' | 'delivery' =>
    o.tableId && !isVirtualCartId(o.tableId) ? 'dineIn' : o.tableNumber === 'Giao đi' || o.tableId === DELIVERY_ID ? 'delivery' : 'takeaway';
  void TAKEAWAY_ID;
  const byType = { dineIn: { value: 0, count: 0 }, takeaway: { value: 0, count: 0 }, delivery: { value: 0, count: 0 } };
  done.forEach(o => { const t = typeOf(o); byType[t].value += o.totalAmount; byType[t].count += 1; });

  const tableMap = new Map<string, { name: string; zone?: string; value: number; count: number }>();
  done.filter(o => typeOf(o) === 'dineIn').forEach(o => {
    const key = o.tableId || o.tableNumber || '?';
    const table = tables.find(t => t.id === o.tableId);
    const cur = tableMap.get(key) || { name: o.tableNumber || table?.name || key, zone: zones.find(z => z.id === table?.zoneId)?.name, value: 0, count: 0 };
    cur.value += o.totalAmount;
    cur.count += 1;
    tableMap.set(key, cur);
  });

  return {
    orderCount: done.length,
    grossRevenue: sum(done.map(o => o.subtotal ?? o.totalAmount)),
    invoiceDiscount: sum(done.map(o => o.discountAmount || 0)),
    revenue,
    tax,
    otherIncome,
    voidCount: voided.length,
    voidValue: sum(voided.map(o => o.totalAmount)),
    netExcludingOther,
    netIncludingOther: netExcludingOther + otherIncome,
    salesByMethod,
    pointsEarned: sum(done.map(o => o.customerPointsEarned || 0)),
    receipts: byFund('receipt'),
    payments: byFund('payment'),
    serving: { value: sum(servingItems.map(i => i.value)), quantity: sum(servingItems.map(i => i.quantity)), items: servingItems },
    sold: { value: sum(soldItems.map(i => i.value)), quantity: sum(soldItems.map(i => i.quantity)), items: soldItems },
    byType,
    byTable: [...tableMap.values()].sort((a, b) => b.value - a.value),
    openOrders,
    openValue: servingMap.size ? sum(servingItems.map(i => i.value)) : 0,
    tablesInUse,
    tablesTotal: tables.length,
    guestsInService,
  };
}

export type EodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export function eodRange(preset: Exclude<EodPreset, 'custom'>, now = new Date()): { from: number; to: number } {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
  if (preset === 'week') { const d = start.getDay(); start.setDate(start.getDate() - (d === 0 ? 6 : d - 1)); }
  if (preset === 'month') start.setDate(1);
  return { from: start.getTime(), to: end.getTime() };
}

export { SALES_CATEGORY };
