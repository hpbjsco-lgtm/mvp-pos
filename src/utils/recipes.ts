/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryBatch, Product, RecipeItem } from '../types';
import { toBaseQuantity } from './inventoryItems';

/** Món đồ uống? (ưu tiên loại thực đơn; món cũ chưa khai báo thì dựa vào nhóm "Đồ uống"). */
export function isDrinkProduct(p: Pick<Product, 'menuType' | 'category'> | undefined): boolean {
  if (!p) return false;
  return p.menuType ? p.menuType === 'drink' : p.category === 'Đồ uống';
}

/** Số lượng nguyên liệu (theo đơn vị cơ bản) cho 1 phần món của một thành phần công thức. */
export function recipeBaseQty(item: RecipeItem, ingredient: Pick<Product, 'unit' | 'unitConversions'> | undefined): number {
  if (!ingredient) return item.quantity;
  return toBaseQuantity(ingredient, item.unit || ingredient.unit || '', item.quantity);
}

/** Giá vốn 1 phần món = tổng (giá vốn / đơn vị cơ bản của nguyên liệu × số lượng cơ bản). */
export function recipeCost(recipe: RecipeItem[] | undefined, ingredients: Product[]): number {
  return Math.round((recipe || []).reduce((sum, r) => {
    const ing = ingredients.find(i => i.id === r.ingredientId);
    return sum + (ing?.cost || 0) * recipeBaseQty(r, ing);
  }, 0));
}

export interface RecipeDeduction {
  /** Phần trừ trên từng lô (FEFO). */
  picks: { batch: InventoryBatch; take: number }[];
  /** Nguyên liệu không đủ tồn để trừ hết. */
  shortages: { ingredientId: string; missing: number }[];
}

export interface SoldLine { productId: string; quantity: number }

/**
 * Tính phần nguyên liệu cần trừ khi bán các dòng món chế biến: gộp theo nguyên liệu, trừ theo FEFO
 * (lô hết hạn sớm nhất trước). Không bao giờ trừ âm; thiếu bao nhiêu được báo trong `shortages`.
 */
export function planRecipeDeduction(lines: SoldLine[], products: Product[], ingredients: Product[], batches: InventoryBatch[]): RecipeDeduction {
  const need = new Map<string, number>();
  for (const line of lines) {
    const dish = products.find(p => p.id === line.productId);
    if (!dish || dish.dishKind !== 'prepared') continue;
    for (const r of dish.recipe || []) {
      const ing = ingredients.find(i => i.id === r.ingredientId);
      need.set(r.ingredientId, (need.get(r.ingredientId) || 0) + recipeBaseQty(r, ing) * line.quantity);
    }
  }

  const picks: RecipeDeduction['picks'] = [];
  const shortages: RecipeDeduction['shortages'] = [];
  for (const [ingredientId, qty] of need) {
    const lots = batches
      .filter(b => b.productId === ingredientId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    let remaining = qty;
    for (const lot of lots) {
      if (remaining <= 1e-9) break;
      const take = Math.min(lot.quantity, remaining);
      picks.push({ batch: lot, take });
      remaining -= take;
    }
    if (remaining > 1e-9) shortages.push({ ingredientId, missing: remaining });
  }
  return { picks, shortages };
}

/** Món thường có quản lý lô riêng: trừ trực tiếp tồn của chính món theo FEFO (không có lô thì bỏ qua). */
export function planDirectDeduction(lines: SoldLine[], products: Product[], batches: InventoryBatch[]): RecipeDeduction {
  const picks: RecipeDeduction['picks'] = [];
  const shortages: RecipeDeduction['shortages'] = [];
  const perDish = new Map<string, number>();
  for (const line of lines) {
    const dish = products.find(p => p.id === line.productId);
    if (dish && dish.dishKind === 'regular') perDish.set(dish.id, (perDish.get(dish.id) || 0) + line.quantity);
  }
  for (const [productId, qty] of perDish) {
    const lots = batches.filter(b => b.productId === productId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    if (lots.length === 0) continue;
    let remaining = qty;
    for (const lot of lots) {
      if (remaining <= 1e-9) break;
      const take = Math.min(lot.quantity, remaining);
      picks.push({ batch: lot, take });
      remaining -= take;
    }
    if (remaining > 1e-9) shortages.push({ ingredientId: productId, missing: remaining });
  }
  return { picks, shortages };
}
