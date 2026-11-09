import { describe, it, expect } from 'vitest';
import { applyMixedPayment, getOrderPayments, PAYMENT_LABELS, PAYMENT_METHOD_OF } from './payments';
import { PaymentMethod } from '../types';

describe('applyMixedPayment', () => {
  it('cash + transfer that equals the total', () => {
    const r = applyMixedPayment(250000, { cash: 200000, qr: 50000, card: 0 });
    expect(r.valid).toBe(true);
    expect(r.change).toBe(0);
    expect(r.parts).toEqual([{ method: 'cash', amount: 200000 }, { method: 'qr', amount: 50000 }]);
  });
  it('extra cash is returned as change and only the needed cash is recorded', () => {
    const r = applyMixedPayment(250000, { cash: 300000, qr: 50000, card: 0 });
    expect(r.valid).toBe(true);
    expect(r.change).toBe(100000);
    expect(r.parts.find(p => p.method === 'cash')?.amount).toBe(200000);
    expect(r.received).toBe(350000);
  });
  it('rejects shortfall and over-paid non-cash', () => {
    expect(applyMixedPayment(250000, { cash: 100000, qr: 50000, card: 0 }).valid).toBe(false);
    expect(applyMixedPayment(250000, { cash: 0, qr: 200000, card: 100000 }).valid).toBe(false);
  });
  it('three methods and zero-amount parts are skipped', () => {
    const r = applyMixedPayment(300000, { cash: 100000, qr: 100000, card: 100000 });
    expect(r.parts).toHaveLength(3);
    expect(applyMixedPayment(100000, { cash: 100000, qr: 0, card: 0 }).parts).toEqual([{ method: 'cash', amount: 100000 }]);
  });
});

describe('getOrderPayments', () => {
  it('falls back to the single payment method for old orders', () => {
    expect(getOrderPayments({ paymentMethod: PaymentMethod.QR, totalAmount: 90000 })).toEqual([{ method: 'qr', amount: 90000 }]);
  });
  it('uses the recorded breakdown when present', () => {
    const payments = [{ method: 'cash' as const, amount: 1 }, { method: 'card' as const, amount: 2 }];
    expect(getOrderPayments({ paymentMethod: PaymentMethod.MIXED, totalAmount: 3, payments })).toBe(payments);
  });
});

describe('wallet (ví điện tử)', () => {
  it('counts as non-cash in a mixed payment and is recorded as its own part', () => {
    const r = applyMixedPayment(100000, { cash: 40000, qr: 0, card: 0, wallet: 60000 });
    expect(r.valid).toBe(true);
    expect(r.parts).toEqual([{ method: 'cash', amount: 40000 }, { method: 'wallet', amount: 60000 }]);
    expect(r.change).toBe(0);
  });
  it('cannot exceed the total together with transfer and card, and cash must cover the rest', () => {
    expect(applyMixedPayment(100000, { cash: 0, qr: 50000, card: 30000, wallet: 30000 }).valid).toBe(false);
    expect(applyMixedPayment(100000, { cash: 10000, qr: 0, card: 0, wallet: 60000 }).error).toContain('Còn thiếu 30.000');
  });
  it('keeps working without the wallet field, as old callers do', () => {
    expect(applyMixedPayment(100000, { cash: 100000, qr: 0, card: 0 }).parts).toEqual([{ method: 'cash', amount: 100000 }]);
  });
  it('an order paid in full by wallet is one wallet payment, also for old-style orders without a list', () => {
    expect(getOrderPayments({ payments: undefined, paymentMethod: PaymentMethod.WALLET, totalAmount: 25000 })).toEqual([{ method: 'wallet', amount: 25000 }]);
    expect(PAYMENT_LABELS.wallet).toBe('Ví điện tử');
    expect(PAYMENT_METHOD_OF.wallet).toBe(PaymentMethod.WALLET);
  });
});

