import { describe, it, expect } from 'vitest';
import { isDrinkProduct, planDirectDeduction, planRecipeDeduction, recipeBaseQty, recipeCost } from './recipes';
import { InventoryBatch, Product } from '../types';

const prod = (id: string, extra: Partial<Product>): Product => ({ id, name: id, sku: id, price: 0, cost: 0, category: 'x', isAvailable: true, createdAt: '', ...extra });
const batch = (id: string, productId: string, quantity: number, expiryDate: string): InventoryBatch =>
  ({ id, productId, batchCode: id, expiryDate, quantity, originalQuantity: quantity, createdAt: '' });

const milk = prod('milk', { unit: 'Lít', cost: 30000 });
const coffee = prod('coffee', { unit: 'Gram', cost: 200, unitConversions: [{ name: 'Kilogram', ratio: 1000 }] });
const latte = prod('latte', { dishKind: 'prepared', price: 45000, recipe: [{ ingredientId: 'milk', quantity: 0.2 }, { ingredientId: 'coffee', quantity: 18, unit: 'Gram' }] });

describe('recipes', () => {
  it('base quantity honours unit conversion', () => {
    expect(recipeBaseQty({ ingredientId: 'coffee', quantity: 0.5, unit: 'Kilogram' }, coffee)).toBe(500);
    expect(recipeBaseQty({ ingredientId: 'milk', quantity: 0.2 }, milk)).toBe(0.2);
  });
  it('cost of a dish is the sum of ingredient costs', () => {
    expect(recipeCost(latte.recipe, [milk, coffee])).toBe(0.2 * 30000 + 18 * 200);
    expect(recipeCost(undefined, [milk])).toBe(0);
  });
  it('deducts FEFO across batches and aggregates identical dishes', () => {
    const batches = [batch('m2', 'milk', 1, '2026-12-31'), batch('m1', 'milk', 0.3, '2026-11-01'), batch('c1', 'coffee', 1000, '2027-01-01')];
    const plan = planRecipeDeduction([{ productId: 'latte', quantity: 2 }], [latte], [milk, coffee], batches);
    expect(plan.shortages).toEqual([]);
    const milkPicks = plan.picks.filter(p => p.batch.productId === 'milk');
    expect(milkPicks.map(p => p.batch.id)).toEqual(['m1', 'm2']);
    expect(milkPicks[0].take).toBeCloseTo(0.3);
    expect(milkPicks[1].take).toBeCloseTo(0.1);
    expect(plan.picks.find(p => p.batch.id === 'c1')!.take).toBe(36);
  });
  it('reports shortages instead of going negative; regular dishes are ignored', () => {
    const plan = planRecipeDeduction([{ productId: 'latte', quantity: 1 }, { productId: 'soda', quantity: 3 }], [latte, prod('soda', { dishKind: 'regular' })], [milk, coffee], [batch('m1', 'milk', 0.1, '2026-11-01')]);
    expect(plan.shortages.find(s => s.ingredientId === 'milk')!.missing).toBeCloseTo(0.1);
    expect(plan.shortages.find(s => s.ingredientId === 'coffee')!.missing).toBe(18);
    expect(plan.picks.reduce((s, p) => s + p.take, 0)).toBeCloseTo(0.1);
  });
  it('drink detection prefers menu type, falls back to category', () => {
    expect(isDrinkProduct({ menuType: 'food', category: 'Đồ uống' })).toBe(false);
    expect(isDrinkProduct({ menuType: 'drink', category: 'Cafe' })).toBe(true);
    expect(isDrinkProduct({ category: 'Đồ uống' })).toBe(true);
    expect(isDrinkProduct({ category: 'Món ăn' })).toBe(false);
  });
});

describe('toppings', () => {
  const pearl = prod('pearl', { isTopping: true, toppingKind: 'prepared', recipe: [{ ingredientId: 'tapioca', quantity: 30, unit: 'Gram' }] });
  const tapioca = prod('tapioca', { unit: 'Gram', cost: 100 });
  const can = prod('can', { isTopping: true, toppingKind: 'regular' });
  const stocked = prod('stocked', { isTopping: true, toppingKind: 'made' });

  it('a prepared topping takes its ingredients: topping quantity x portions of the dish', () => {
    const plan = planRecipeDeduction(
      [{ productId: 'latte', quantity: 2, toppings: [{ productId: 'pearl', quantity: 2 }] }],
      [latte, pearl], [milk, coffee, tapioca],
      [batch('t1', 'tapioca', 1000, '2027-01-01'), batch('m1', 'milk', 5, '2027-01-01'), batch('c1', 'coffee', 1000, '2027-01-01')],
    );
    expect(plan.picks.find(p => p.batch.id === 't1')!.take).toBe(30 * 2 * 2);
    // The dish itself still takes its own recipe
    expect(plan.picks.find(p => p.batch.id === 'm1')!.take).toBeCloseTo(0.4);
  });

  it('counts a topping even when the dish itself takes no ingredients', () => {
    const soda = prod('soda', { dishKind: 'regular' });
    const plan = planRecipeDeduction([{ productId: 'soda', quantity: 1, toppings: [{ productId: 'pearl', quantity: 1 }] }], [soda, pearl], [tapioca], [batch('t1', 'tapioca', 100, '2027-01-01')]);
    expect(plan.picks.map(p => [p.batch.id, p.take])).toEqual([['t1', 30]]);
  });

  it('reports a shortage of a topping ingredient instead of going negative', () => {
    const plan = planRecipeDeduction([{ productId: 'latte', quantity: 1, toppings: [{ productId: 'pearl', quantity: 1 }] }], [latte, pearl], [milk, coffee, tapioca], [batch('t1', 'tapioca', 10, '2027-01-01')]);
    expect(plan.shortages.find(s => s.ingredientId === 'tapioca')!.missing).toBe(20);
  });

  it('ignores toppings that are regular, unknown, or not toppings at all', () => {
    const notTopping = prod('notTopping', { toppingKind: 'prepared', recipe: [{ ingredientId: 'tapioca', quantity: 5 }] });
    const plan = planRecipeDeduction(
      [{ productId: 'latte', quantity: 1, toppings: [{ productId: 'can', quantity: 1 }, { productId: 'ghost', quantity: 1 }, { productId: 'notTopping', quantity: 1 }] }],
      [latte, can, notTopping], [milk, coffee, tapioca], [batch('t1', 'tapioca', 100, '2027-01-01'), batch('m1', 'milk', 5, '2027-01-01'), batch('c1', 'coffee', 100, '2027-01-01')],
    );
    expect(plan.picks.some(p => p.batch.id === 't1')).toBe(false);
  });

  it('takes regular and made toppings straight from their own batches, in FEFO order', () => {
    const lines = [{ productId: 'latte', quantity: 3, toppings: [{ productId: 'can', quantity: 1 }, { productId: 'stocked', quantity: 2 }] }];
    const plan = planDirectDeduction(lines, [latte, can, stocked], [batch('can2', 'can', 5, '2027-06-01'), batch('can1', 'can', 2, '2027-01-01'), batch('s1', 'stocked', 10, '2027-01-01')]);
    expect(plan.picks.map(p => [p.batch.id, p.take])).toEqual([['can1', 2], ['can2', 1], ['s1', 6]]);
    expect(plan.shortages).toEqual([]);
  });

  it('reports missing stock of a regular topping and skips toppings without batches', () => {
    const plan = planDirectDeduction([{ productId: 'latte', quantity: 2, toppings: [{ productId: 'can', quantity: 1 }, { productId: 'stocked', quantity: 1 }] }], [latte, can, stocked], [batch('can1', 'can', 1, '2027-01-01')]);
    expect(plan.shortages).toEqual([{ ingredientId: 'can', missing: 1 }]);
    expect(plan.picks.map(p => p.batch.id)).toEqual(['can1']);
  });
});

