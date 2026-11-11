import { describe, it, expect } from 'vitest';
import { computeEndOfDay, eodRange } from './endOfDay';
import { DiningTable, InventoryTransactionType, Order, PaymentMethod, Product, TableStatus, CashVoucher } from '../types';

const T0 = new Date('2026-10-10T10:00:00').getTime();
const range = { from: new Date('2026-10-10T00:00:00').getTime(), to: new Date('2026-10-10T23:59:59').getTime() };
const prod = (id: string, name: string, price: number) => ({ id, name, price, sku: id, cost: 0, category: 'x', isAvailable: true, createdAt: '' } as Product);
const order = (id: string, extra: Partial<Order>): Order => ({
  id, orderNumber: id, items: [{ productId: 'p1', name: 'Cà phê', quantity: 1, price: 30000 }], subtotal: 30000, totalAmount: 30000,
  paymentMethod: PaymentMethod.CASH, payments: [{ method: 'cash', amount: 30000 }], paidAmount: 30000, changeAmount: 0, staffId: 's',
  createdAt: new Date(T0).toISOString(), tableId: 'T1', tableNumber: 'Bàn 01', orderType: 'dine-in', ...extra,
});
const table = (id: string, name: string, extra: Partial<DiningTable> = {}): DiningTable => ({ id, name, status: TableStatus.EMPTY, capacity: 4, createdAt: '', ...extra });

describe('computeEndOfDay', () => {
  const orders = [
    order('A', {}),
    order('B', { subtotal: 100000, discountAmount: 10000, taxAmount: 4000, totalAmount: 94000, payments: [{ method: 'cash', amount: 50000 }, { method: 'qr', amount: 44000 }], paymentMethod: PaymentMethod.MIXED, tableId: 'T2', tableNumber: 'Bàn 02', customerPointsEarned: 9 }),
    order('C', { tableId: undefined, tableNumber: 'Mang về', orderType: 'takeaway', totalAmount: 20000, subtotal: 20000, payments: [{ method: 'card', amount: 20000 }] }),
    order('D', { status: 'void', totalAmount: 77777 }),
    order('E', { createdAt: new Date('2026-10-09T10:00:00').toISOString() }),
  ];
  const vouchers: CashVoucher[] = [
    { id: 'v1', code: 'PT0001', type: 'receipt', fund: 'cash', amount: 5000, category: 'Thu khác', status: 'paid', createdAt: new Date(T0).toISOString() },
    { id: 'v2', code: 'PC0001', type: 'payment', fund: 'bank', amount: 7000, category: 'Chi khác', status: 'paid', createdAt: new Date(T0).toISOString() },
  ];
  const tables = [table('T1', 'Bàn 01', { status: TableStatus.SERVING, guestCount: 3 }), table('T2', 'Bàn 02')];
  const r = computeEndOfDay({
    orders, vouchers, accounts: [], carts: { T1: [{ productId: 'p1', quantity: 2, note: '' }] }, products: [prod('p1', 'Cà phê', 30000)],
    tables, zones: [], ...range,
  });

  it('summarises sales for the period only and ignores void orders', () => {
    expect(r.orderCount).toBe(3);
    expect(r.grossRevenue).toBe(30000 + 100000 + 20000);
    expect(r.invoiceDiscount).toBe(10000);
    expect(r.revenue).toBe(30000 + 94000 + 20000);
    expect(r.tax).toBe(4000);
    expect(r.voidCount).toBe(1);
    expect(r.voidValue).toBe(77777);
  });
  it('net revenue and other income', () => {
    expect(r.otherIncome).toBe(5000);
    expect(r.netExcludingOther).toBe(144000 - 4000);
    expect(r.netIncludingOther).toBe(144000 - 4000 + 5000);
  });
  it('splits sales per payment method and vouchers per fund', () => {
    expect(r.salesByMethod).toMatchObject({ cash: 80000, transfer: 44000, card: 20000, total: 144000 });
    expect(r.receipts.cash).toBe(5000);
    expect(r.payments.bank).toBe(7000);
    expect(r.pointsEarned).toBe(9);
  });
  it('groups sold items and order types', () => {
    expect(r.sold.items[0]).toMatchObject({ name: 'Cà phê', quantity: 3 });
    expect(r.byType.dineIn.count).toBe(2);
    expect(r.byType.takeaway.count).toBe(1);
    expect(r.byTable.map(t => t.name)).toEqual(['Bàn 02', 'Bàn 01']);
  });
  it('reports what is being served right now', () => {
    expect(r.openOrders).toBe(1);
    expect(r.serving.value).toBe(60000);
    expect(r.serving.quantity).toBe(2);
    expect(r.tablesInUse).toBe(1);
    expect(r.tablesTotal).toBe(2);
    expect(r.guestsInService).toBe(3);
  });
  it('does not count carts that no table, takeaway or retail screen shows (left over from deleted tables)', () => {
    const withStale = computeEndOfDay({
      orders, vouchers, accounts: [], products: [prod('p1', 'Cà phê', 30000)], tables, zones: [], ...range,
      carts: {
        T1: [{ productId: 'p1', quantity: 2, note: '' }],
        'T-deleted': [{ productId: 'p1', quantity: 5, note: '' }],
        takeaway: [{ productId: 'p1', quantity: 1, note: '' }],
      },
    });
    expect(withStale.openOrders).toBe(2);
    expect(withStale.serving.quantity).toBe(3);
  });
  it('counts the cart of a retail store', () => {
    const retail = computeEndOfDay({
      orders: [], vouchers: [], accounts: [], products: [prod('p1', 'Cà phê', 30000)], tables: [], zones: [], ...range,
      carts: { retail: [{ productId: 'p1', quantity: 1, note: '' }] },
    });
    expect(retail.openOrders).toBe(1);
  });
  it('yesterday range ends before today starts', () => {
    expect(eodRange('yesterday').to).toBeLessThan(eodRange('today').from);
  });
});

describe('wallet in the end-of-day report', () => {
  it('shows sales paid by wallet, also inside a mixed payment', () => {
    const report = computeEndOfDay({
      orders: [
        order('W1', { totalAmount: 30000, payments: [{ method: 'wallet', amount: 30000 }], paymentMethod: PaymentMethod.WALLET }),
        order('W2', { totalAmount: 50000, payments: [{ method: 'cash', amount: 20000 }, { method: 'wallet', amount: 30000 }], paymentMethod: PaymentMethod.MIXED }),
      ],
      vouchers: [], accounts: [], carts: {}, products: [], tables: [], zones: [], ...range,
    } as Parameters<typeof computeEndOfDay>[0]);
    expect(report.salesByMethod).toMatchObject({ wallet: 60000, cash: 20000, total: 80000 });
  });
});

describe('profit in the end-of-day report', () => {
  it('uses the cost recorded on the orders of the period and the shrinkage of the same period', () => {
    const inside = new Date(T0).toISOString();
    const outside = new Date('2026-10-09T10:00:00').toISOString();
    const report = computeEndOfDay({
      orders: [
        order('P1', { totalAmount: 110000, taxAmount: 10000, totalCost: 40000, costRecorded: true }),
        order('P2', { totalAmount: 20000 }),
        order('P3', { totalAmount: 99000, totalCost: 1000, costRecorded: true, createdAt: outside }),
      ],
      vouchers: [], accounts: [], carts: {}, products: [], tables: [], zones: [],
      transactions: [
        { id: 'k1', transactionNumber: 'KK0001', type: InventoryTransactionType.STOCKTAKE, staffId: 's', createdAt: inside, items: [{ productId: 'm', batchCode: 'L', quantity: -1, price: 5000 }] },
        { id: 'k2', transactionNumber: 'KK0002', type: InventoryTransactionType.STOCKTAKE, staffId: 's', createdAt: outside, items: [{ productId: 'm', batchCode: 'L', quantity: -9, price: 5000 }] },
      ],
      ...range,
    } as Parameters<typeof computeEndOfDay>[0]);
    expect(report.profit).toMatchObject({ revenueExTax: 100000, cost: 40000, grossProfit: 60000, ordersWithoutCost: 1 });
    expect(report.profit.shrinkage.total).toBe(5000);
    expect(report.profit.netProfit).toBe(55000);
  });
});

describe('discounts, channels and debt in the end-of-day report', () => {
  const line = (name: string, price: number, quantity: number, discount?: number) => ({ productId: name, name, price, quantity, discount });
  const data = () => computeEndOfDay({
    orders: [
      order('D1', { subtotal: 100000, lineDiscountAmount: 10000, discountAmount: 9000, totalAmount: 81000, items: [line('Latte', 40000, 2, 10000), line('Cake', 20000, 1)] }),
      order('G1', { totalAmount: 100000, subtotal: 100000, channelName: 'GrabFood', commissionPercent: 25, commissionAmount: 25000, items: [line('Tea', 50000, 2)] }),
      order('V1', { status: 'void', lineDiscountAmount: 99999, items: [line('Latte', 40000, 1, 99999)] }),
    ],
    vouchers: [], accounts: [], carts: {}, products: [], tables: [], zones: [], ...range,
    customers: [{ id: 'a', name: 'An', debt: 200000 }, { id: 'b', name: 'Bình', debt: 0 }, { id: 'c', name: 'Chi', debt: 50000 }],
  } as Parameters<typeof computeEndOfDay>[0]);

  it('adds up the discounts given on lines, not counting cancelled orders', () => {
    expect(data().lineDiscount).toBe(10000);
  });

  it('lists the dishes that got a discount, with the share of the invoice discount in proportion to what is left of each line', () => {
    const entries = data().discountByItem;
    // The invoice discount of 9,000 is split over 70,000 (Latte after its line discount) and 20,000 (Cake)
    expect(entries.map(entry => entry.name)).toEqual(['Latte', 'Cake']);
    expect(entries[0]).toMatchObject({ name: 'Latte', quantity: 2, gross: 80000, lineDiscount: 10000, invoiceShare: 7000, net: 63000 });
    expect(entries[1]).toMatchObject({ name: 'Cake', quantity: 1, gross: 20000, lineDiscount: 0, invoiceShare: 2000, net: 18000 });
  });

  it('shows sales per channel with the commission and what the shop receives, only when a channel was used', () => {
    expect(data().byChannel).toEqual([
      { name: 'Trực tiếp', orders: 1, revenue: 81000, commission: 0, received: 81000 },
      { name: 'GrabFood', orders: 1, revenue: 100000, commission: 25000, received: 75000 },
    ].sort((a, b) => b.revenue - a.revenue));
    const none = computeEndOfDay({ orders: [order('A', {})], vouchers: [], accounts: [], carts: {}, products: [], tables: [], zones: [], ...range } as Parameters<typeof computeEndOfDay>[0]);
    expect(none.byChannel).toEqual([]);
  });

  it('shows what customers owe, largest first, and nothing for customers without debt', () => {
    expect(data().debts).toEqual({ total: 250000, customers: 2, top: [{ name: 'An', debt: 200000 }, { name: 'Chi', debt: 50000 }] });
  });

  it('takes the commission out of the profit as its own cost', () => {
    const report = computeEndOfDay({
      orders: [order('G2', { totalAmount: 100000, totalCost: 30000, costRecorded: true, commissionAmount: 25000 })],
      vouchers: [], accounts: [], carts: {}, products: [], tables: [], zones: [], ...range,
    } as Parameters<typeof computeEndOfDay>[0]);
    expect(report.profit).toMatchObject({ grossProfit: 70000, commission: 25000, netProfit: 45000 });
  });
});

