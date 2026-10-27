import { describe, it, expect } from 'vitest';
import { computeEndOfDay, eodRange } from './endOfDay';
import { DiningTable, Order, PaymentMethod, Product, TableStatus, CashVoucher } from '../types';

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
  it('yesterday range ends before today starts', () => {
    expect(eodRange('yesterday').to).toBeLessThan(eodRange('today').from);
  });
});
