/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from './collections';

/** A topping keeps its recipe in the same column as a dish, so it survives saving and loading. */
describe('recipe of a topping in the products collection', () => {
  it('is written as JSON and read back with the topping kind', () => {
    const spec = COLLECTIONS.products;
    const row = spec.toRow({ id: 'tp1', name: 'Pearl', sku: 'TP1', price: 5000, cost: 3000, category: 'Topping', isTopping: true, toppingKind: 'prepared', recipe: [{ ingredientId: 'tapioca', quantity: 30, unit: 'Gram' }] }, 'S1');
    expect(JSON.parse(String(row.recipe))).toEqual([{ ingredientId: 'tapioca', quantity: 30, unit: 'Gram' }]);
    expect(row.topping_kind).toBe('prepared');
    const back = spec.fromRow({ ...row, id: 'tp1' });
    expect(back).toMatchObject({ isTopping: true, toppingKind: 'prepared', recipe: [{ ingredientId: 'tapioca', quantity: 30, unit: 'Gram' }] });
  });

  it('is empty for a topping without a recipe', () => {
    const row = COLLECTIONS.products.toRow({ id: 'tp2', name: 'Can', sku: 'TP2', price: 1, cost: 0, category: 'Topping', isTopping: true, toppingKind: 'regular' }, 'S1');
    expect(row.recipe).toBe('');
  });
});
