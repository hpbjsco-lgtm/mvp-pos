import { describe, it, expect } from 'vitest';
import { changeTopping, lineUnitPrice, toppingSignature, toppingsFor, toppingsText, toppingsTotal } from './toppings';
import { lineKey, getTableStats } from './tableOps';
import { DiningTable, Product, TableStatus } from '../types';

const prod = (id: string, name: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, name, price, sku: id, cost: 0, category: 'x', isAvailable: true, createdAt: '', ...extra });

const products = [
  prod('tea', 'Trà sữa', 40000),
  prod('pearl', 'Trân châu đen', 5000, { isTopping: true, toppingFor: ['tea'] }),
  prod('jelly', 'Thạch dừa', 6000, { isTopping: true, toppingFor: ['tea', 'coffee'] }),
  prod('off', 'Kem cheese', 10000, { isTopping: true, toppingFor: ['tea'], isAvailable: false }),
];

describe('toppings', () => {
  it('lists only available toppings attached to the dish', () => {
    expect(toppingsFor(products[0], products).map(t => t.id)).toEqual(['pearl', 'jelly']);
    expect(toppingsFor(prod('coffee', 'c', 1), products).map(t => t.id)).toEqual(['jelly']);
  });
  it('unit price = dish price + toppings (with quantities)', () => {
    const line = { productId: 'tea', toppings: [{ productId: 'pearl', quantity: 2 }, { productId: 'jelly', quantity: 1 }] };
    expect(toppingsTotal(line, products)).toBe(16000);
    expect(lineUnitPrice(line, products)).toBe(56000);
    expect(toppingsText(line, products)).toBe('Trân châu đen x2, Thạch dừa x1');
    expect(lineUnitPrice({ productId: 'tea' }, products)).toBe(40000);
  });
  it('changeTopping adds, increments and removes at zero', () => {
    let t = changeTopping(undefined, 'pearl', 1);
    expect(t).toEqual([{ productId: 'pearl', quantity: 1 }]);
    t = changeTopping(t, 'pearl', 1);
    expect(t).toEqual([{ productId: 'pearl', quantity: 2 }]);
    t = changeTopping(t, 'pearl', -2);
    expect(t).toBeUndefined();
    expect(changeTopping(undefined, 'pearl', -1)).toBeUndefined();
  });
  it('signature ignores order, so line keys differ only by topping set', () => {
    expect(toppingSignature([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }])).toBe(toppingSignature([{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }]));
    const base = { productId: 'tea', note: '' };
    expect(lineKey(base)).not.toBe(lineKey({ ...base, toppings: [{ productId: 'pearl', quantity: 1 }] }));
  });
  it('table totals include topping prices', () => {
    const tables: DiningTable[] = [{ id: 'T1', name: 'Bàn 1', status: TableStatus.SERVING, capacity: 4, createdAt: '' }];
    const carts = { T1: [{ productId: 'tea', quantity: 2, note: '', toppings: [{ productId: 'pearl', quantity: 1 }] }] };
    expect(getTableStats(tables[0], tables, carts, products).total).toBe((40000 + 5000) * 2);
  });
});

import { cleanSizes, defaultSize, hasSizes, priceForSize, priceLabel } from './sizes';

describe('sizes (giá theo size tùy chỉnh)', () => {
  const coffee = prod('cf', 'Cà phê', 29000, { sizes: [{ name: 'Nhỏ', price: 29000 }, { name: 'Lớn', price: 39000 }] });
  it('default size is the first; price follows the selected size', () => {
    expect(defaultSize(coffee)).toBe('Nhỏ');
    expect(priceForSize(coffee, 'Lớn')).toBe(39000);
    expect(priceForSize(coffee, 'Không tồn tại')).toBe(29000);
    expect(priceForSize(prod('x', 'x', 5000), 'M')).toBe(5000);
    expect(hasSizes(prod('x', 'x', 1))).toBe(false);
  });
  it('line price uses the size price plus toppings', () => {
    const all = [coffee, ...products];
    const line = { productId: 'cf', size: 'Lớn', toppings: [{ productId: 'pearl', quantity: 1 }] };
    expect(lineUnitPrice(line, all)).toBe(39000 + 5000);
  });
  it('cleanSizes drops blanks and duplicates', () => {
    expect(cleanSizes([{ name: ' Nhỏ ', price: 1000 }, { name: 'nhỏ', price: 2000 }, { name: '', price: 5 }, { name: 'Lớn', price: -5 }]))
      .toEqual([{ name: 'Nhỏ', price: 1000 }, { name: 'Lớn', price: 0 }]);
  });
  it('price label shows "từ" only when prices differ', () => {
    expect(priceLabel(coffee)).toBe('từ 29.000');
    expect(priceLabel(prod('y', 'y', 5000, { sizes: [{ name: 'A', price: 5000 }] }))).toBe('5.000');
  });
});
