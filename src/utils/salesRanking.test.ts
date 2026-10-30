import { describe, it, expect } from 'vitest';
import { Order } from '../types';
import { countUnitsSold, sortByBestSeller } from './salesRanking';

const NOW = new Date('2026-10-30T12:00:00Z').getTime();

const order = (createdAt: string, items: [string, number][], status?: 'completed' | 'void') =>
  ({ id: createdAt, createdAt, status, items: items.map(([productId, quantity]) => ({ productId, quantity })) }) as unknown as Order;

describe('countUnitsSold', () => {
  it('sums quantities inside the window and skips voided orders', () => {
    const orders = [
      order('2026-10-29T10:00:00Z', [['a', 2], ['b', 1]]),
      order('2026-10-20T10:00:00Z', [['a', 3]]),
      order('2026-10-28T10:00:00Z', [['b', 9]], 'void'),
    ];
    const sold = countUnitsSold(orders, NOW);
    expect(sold.get('a')).toBe(5);
    expect(sold.get('b')).toBe(1);
  });

  it('ignores orders older than the window', () => {
    const sold = countUnitsSold([order('2026-08-01T10:00:00Z', [['a', 10]])], NOW);
    expect(sold.get('a')).toBeUndefined();
  });
});

describe('sortByBestSeller', () => {
  const products = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('puts best sellers first and keeps original order for ties', () => {
    const orders = [order('2026-10-29T10:00:00Z', [['c', 5], ['b', 5], ['d', 1]])];
    expect(sortByBestSeller(products, orders, NOW).map(p => p.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('returns the original order when there are no orders and does not mutate the input', () => {
    const copy = [...products];
    expect(sortByBestSeller(products, [], NOW)).toEqual(copy);
    expect(products).toEqual(copy);
  });
});
