/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';
import { priceForSize } from './sizes';

export interface LineTopping { productId: string; quantity: number }

interface PricedLine { productId: string; size?: string; toppings?: LineTopping[] }

/** Các topping đang bán được gắn cho một món. */
export function toppingsFor(product: Pick<Product, 'id'> | undefined, products: Product[]): Product[] {
  if (!product) return [];
  return products.filter(p => p.isTopping && p.isAvailable && (p.toppingFor || []).includes(product.id));
}

/** Tiền topping của 1 phần món (đã nhân số lượng từng topping). */
export function toppingsTotal(line: PricedLine, products: Product[]): number {
  return (line.toppings || []).reduce((sum, t) => sum + (products.find(p => p.id === t.productId)?.price || 0) * t.quantity, 0);
}

/** Đơn giá của 1 phần món = giá theo size đã chọn + tiền topping. */
export function lineUnitPrice(line: PricedLine, products: Product[]): number {
  return priceForSize(products.find(p => p.id === line.productId), line.size) + toppingsTotal(line, products);
}

/** Chữ mô tả topping, vd "Trân châu đen x1, Thạch dừa x2" (rỗng nếu không có). */
export function toppingsText(line: PricedLine, products: Product[]): string {
  return (line.toppings || [])
    .map(t => `${products.find(p => p.id === t.productId)?.name || 'Topping'} x${t.quantity}`)
    .join(', ');
}

/** Chuỗi định danh tập topping (không phụ thuộc thứ tự) - dùng để phân biệt các dòng cùng món khác topping. */
export function toppingSignature(toppings?: LineTopping[]): string {
  return (toppings || [])
    .filter(t => t.quantity > 0)
    .map(t => `${t.productId}x${t.quantity}`)
    .sort()
    .join(',');
}

/** Tăng / giảm số lượng một topping trong danh sách (xóa khi về 0). */
export function changeTopping(toppings: LineTopping[] | undefined, productId: string, delta: number): LineTopping[] | undefined {
  const list = (toppings || []).map(t => ({ ...t }));
  const idx = list.findIndex(t => t.productId === productId);
  if (idx === -1) {
    if (delta > 0) list.push({ productId, quantity: delta });
  } else {
    list[idx].quantity += delta;
  }
  const next = list.filter(t => t.quantity > 0);
  return next.length > 0 ? next : undefined;
}
