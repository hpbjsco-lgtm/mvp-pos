/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { lineUnitCost, orderCost } from './costing';

const products = [
  { id: 'latte', cost: 12000 },
  { id: 'cake', cost: 8000 },
  { id: 'pearl', cost: 1500 },
  { id: 'free', cost: 0 },
];

describe('lineUnitCost', () => {
  it('is the cost of the dish plus the cost of every topping portion on it', () => {
    expect(lineUnitCost({ productId: 'latte', toppings: [{ productId: 'pearl', quantity: 2 }] }, products)).toBe(15000);
    expect(lineUnitCost({ productId: 'latte' }, products)).toBe(12000);
  });

  it('counts an unknown item or an item without cost as 0', () => {
    expect(lineUnitCost({ productId: 'ghost', toppings: [{ productId: 'pearl', quantity: 1 }] }, products)).toBe(1500);
    expect(lineUnitCost({ productId: 'free' }, products)).toBe(0);
  });
});

describe('orderCost', () => {
  it('adds portion cost x portions over all lines', () => {
    const lines = [
      { productId: 'latte', quantity: 2, toppings: [{ productId: 'pearl', quantity: 1 }] },
      { productId: 'cake', quantity: 3 },
    ];
    expect(orderCost(lines, products)).toBe(2 * 13500 + 3 * 8000);
    expect(orderCost([], products)).toBe(0);
  });
});
