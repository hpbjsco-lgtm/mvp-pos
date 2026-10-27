import { describe, it, expect } from 'vitest';
import { applyMixedPayment, getOrderPayments } from './payments';
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
