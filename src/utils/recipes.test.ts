import { describe, it, expect } from 'vitest';
import { isDrinkProduct, planRecipeDeduction, recipeBaseQty, recipeCost } from './recipes';
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
