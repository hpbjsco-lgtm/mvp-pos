import { describe, it, expect } from 'vitest';
import { buildLedger, summarize, entriesInRange, breakdownByCategory, nextVoucherCode, presetRange } from './cashbook';
import { crc16, buildVietQRPayload, sanitizeMemo } from './vietqr';
import { BankAccount, CashVoucher, Order, PaymentMethod } from '../types';

const acc = (id: string, isDefault = false): BankAccount => ({ id, accountName: id, accountNumber: '1', bankCode: 'VCB', bankName: 'VCB', holder: 'X', isDefault, createdAt: '' });
const order = (id: string, total: number, payments: Order['payments'], extra: Partial<Order> = {}): Order => ({
  id, orderNumber: `HD-${id}`, items: [], totalAmount: total, paymentMethod: PaymentMethod.CASH, payments,
  paidAmount: total, changeAmount: 0, staffId: 's', createdAt: '2026-10-10T10:00:00.000Z', ...extra,
});
const voucher = (id: string, type: 'receipt' | 'payment', fund: 'cash' | 'bank' | 'wallet', amount: number, createdAt: string, extra: Partial<CashVoucher> = {}): CashVoucher => ({
  id, code: `${type === 'receipt' ? 'PT' : 'PC'}000${id}`, type, fund, amount, category: 'Khác', status: 'paid', createdAt, ...extra,
});

describe('vietqr', () => {
  it('crc16 matches the CCITT-FALSE check value', () => expect(crc16('123456789')).toBe('29B1'));
  it('payload has NAPAS AID, BIN, account, amount and a valid CRC', () => {
    const p = buildVietQRPayload({ bin: '970436', accountNumber: '000111222333', amount: 250000, memo: 'Bàn 10 HD-001' });
    expect(p).toContain('A000000727');
    expect(p).toContain('0006970436');
    expect(p).toContain('0112000111222333');
    expect(p).toContain('5406250000');
    expect(p).toContain('0813Ban 10 HD-001');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    expect(p.startsWith('000201010212')).toBe(true);
  });
  it('static code when no amount', () => {
    expect(buildVietQRPayload({ bin: '970436', accountNumber: '1' }).startsWith('000201010211')).toBe(true);
  });
  it('memo is stripped of accents and limited to 25 chars', () => {
    expect(sanitizeMemo('Thanh toán đơn hàng số 12345 rất dài')).toBe('Thanh toan don hang so 12');
  });
});

describe('cashbook ledger', () => {
  const accounts = [acc('b1', true), acc('b2')];
  const orders = [
    order('1', 100000, [{ method: 'cash', amount: 100000 }]),
    order('2', 200000, [{ method: 'cash', amount: 120000 }, { method: 'qr', amount: 80000, bankAccountId: 'b2' }]),
    order('3', 50000, [{ method: 'card', amount: 50000 }]),
    order('4', 999999, [{ method: 'cash', amount: 999999 }], { status: 'void' }),
  ];
  const vouchers = [
    voucher('1', 'payment', 'cash', 30000, '2026-10-10T12:00:00.000Z', { category: 'Chi nhập hàng / nguyên liệu' }),
    voucher('2', 'receipt', 'cash', 500000, '2026-10-01T08:00:00.000Z', { category: 'Vốn góp / Số dư đầu kỳ' }),
  ];
  const ledger = buildLedger(orders, vouchers, accounts);

  it('splits sales per payment part, mapping card/qr to the bank fund', () => {
    expect(ledger.filter(e => e.source === 'sale' && e.fund === 'bank').map(e => e.bankAccountId).sort()).toEqual(['b1', 'b2']);
  });
  it('totals per fund ignore voided orders', () => {
    const cash = summarize(ledger, { fund: 'cash' });
    expect(cash.totalIn).toBe(100000 + 120000 + 500000);
    expect(cash.totalOut).toBe(30000);
    const bank = summarize(ledger, { fund: 'bank' });
    expect(bank.totalIn).toBe(130000);
  });
  it('opening balance carries everything before the range', () => {
    const from = new Date('2026-10-05T00:00:00.000Z').getTime();
    const s = summarize(ledger, { fund: 'cash', from });
    expect(s.opening).toBe(500000);
    expect(s.totalIn).toBe(220000);
    expect(s.closing).toBe(500000 + 220000 - 30000);
  });
  it('filters by bank account and range', () => {
    const only = entriesInRange(ledger, { fund: 'bank', bankAccountId: 'b2' });
    expect(only).toHaveLength(1);
    expect(only[0].amount).toBe(80000);
  });
  it('breaks the cash flow down by category', () => {
    const b = breakdownByCategory(ledger);
    expect(b.find(x => x.category === 'Thu tiền bán hàng')?.total).toBe(350000);
    expect(b.find(x => x.category === 'Chi nhập hàng / nguyên liệu')?.kind).toBe('payment');
  });
  it('voucher codes increment per type', () => {
    expect(nextVoucherCode([], 'receipt')).toBe('PT0001');
    expect(nextVoucherCode([voucher('7', 'payment', 'cash', 1, 'x', { code: 'PC0007' })], 'payment')).toBe('PC0008');
  });
  it('month preset starts on the 1st', () => {
    const r = presetRange('month', new Date('2026-10-17T15:00:00'));
    expect(new Date(r.from).getDate()).toBe(1);
  });
});
