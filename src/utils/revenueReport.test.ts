import { describe, it, expect } from 'vitest';
import { buildRevenueSeries, filterOrdersInPeriod } from './revenueReport';
import { Order, PaymentMethod } from '../types';

/** Builds an order created at a local date-time; `month` is 1-based. */
const order = (id: string, total: number, year: number, month: number, day: number, hour = 12, minute = 0): Order => ({
  id, orderNumber: `HD-${id}`, items: [], totalAmount: total, paymentMethod: PaymentMethod.CASH,
  paidAmount: total, changeAmount: 0, staffId: 's', createdAt: new Date(year, month - 1, day, hour, minute).toISOString(),
});

// Saturday 31 Oct 2026, 10:00 local time.
const now = new Date(2026, 9, 31, 10, 0);

describe('filterOrdersInPeriod', () => {
  const orders = [
    order('a', 100, 2026, 10, 31, 0, 5),
    order('b', 200, 2026, 10, 30, 23, 55),
    order('c', 300, 2026, 10, 1),
    order('d', 400, 2026, 9, 30),
    order('e', 500, 2025, 12, 31),
  ];

  it('keeps only today, using local midnight as the boundary', () => {
    expect(filterOrdersInPeriod(orders, 'daily', now).map(o => o.id)).toEqual(['a']);
  });
  it('keeps the current month', () => {
    expect(filterOrdersInPeriod(orders, 'monthly', now).map(o => o.id)).toEqual(['a', 'b', 'c']);
  });
  it('keeps the current year', () => {
    expect(filterOrdersInPeriod(orders, 'yearly', now).map(o => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('throws on an invalid createdAt instead of ignoring the order', () => {
    const broken = { ...order('x', 1, 2026, 10, 31), createdAt: 'not-a-date' };
    expect(() => filterOrdersInPeriod([broken], 'daily', now)).toThrow('HD-x');
  });
});

describe('buildRevenueSeries', () => {
  it('returns 7 zero bars for the last 7 days when there are no orders', () => {
    const series = buildRevenueSeries([], 'daily', now);
    expect(series.map(p => p.label)).toEqual(['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(series).toHaveLength(7);
    expect(series.every(p => p.value === 0)).toBe(true);
  });
  it('labels the last day as today and adds totals per day', () => {
    const series = buildRevenueSeries([
      order('a', 100, 2026, 10, 31), order('b', 50, 2026, 10, 31, 8), order('c', 70, 2026, 10, 29), order('d', 999, 2026, 10, 24),
    ], 'daily', now);
    expect(series.map(p => p.label)).toEqual(['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(series[6]).toEqual({ label: 'T7', value: 150 });
    expect(series[4]).toEqual({ label: 'T5', value: 70 });
    expect(series.reduce((s, p) => s + p.value, 0)).toBe(220);
  });
  it('groups the last 6 months and crosses the year boundary', () => {
    const series = buildRevenueSeries([order('a', 10, 2026, 1, 15), order('b', 20, 2025, 12, 20), order('c', 5, 2025, 5, 1)], 'monthly', new Date(2026, 1, 10));
    expect(series.map(p => p.label)).toEqual(['Th9', 'Th10', 'Th11', 'Th12', 'Th1', 'Th2']);
    expect(series.map(p => p.value)).toEqual([0, 0, 0, 20, 10, 0]);
  });
  it('groups the last 4 years', () => {
    const series = buildRevenueSeries([order('a', 10, 2026, 3, 1), order('b', 20, 2024, 3, 1), order('c', 5, 2022, 3, 1)], 'yearly', now);
    expect(series).toEqual([
      { label: '2023', value: 0 }, { label: '2024', value: 20 }, { label: '2025', value: 0 }, { label: '2026', value: 10 },
    ]);
  });
  it('does not skip a month when today is the 31st and a previous month is shorter', () => {
    const series = buildRevenueSeries([order('a', 10, 2026, 3, 31)], 'monthly', new Date(2026, 2, 31));
    expect(series.map(p => p.label)).toEqual(['Th10', 'Th11', 'Th12', 'Th1', 'Th2', 'Th3']);
    expect(series[5].value).toBe(10);
  });
});
