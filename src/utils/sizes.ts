/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, ProductSize } from '../types';

/** Món có từ 1 size / biến thể giá tùy chỉnh trở lên. */
export const hasSizes = (p: Pick<Product, 'sizes'> | undefined): p is Pick<Product, 'sizes'> & { sizes: ProductSize[] } =>
  !!p && Array.isArray(p.sizes) && p.sizes.length > 0;

/** Size mặc định khi thêm món vào đơn (size đầu tiên). */
export const defaultSize = (p: Pick<Product, 'sizes'> | undefined): string | undefined =>
  hasSizes(p) ? p.sizes[0].name : undefined;

/** Giá của món theo size đã chọn; không có size / size không còn tồn tại thì dùng giá gốc của món. */
export function priceForSize(p: Pick<Product, 'price' | 'sizes'> | undefined, size?: string): number {
  if (!p) return 0;
  if (hasSizes(p) && size) {
    const found = p.sizes.find(s => s.name === size);
    if (found) return found.price;
  }
  return p.price;
}

/** Chuẩn hóa danh sách size nhập tay: bỏ dòng trống, gộp trùng tên, giá không âm. */
export function cleanSizes(sizes: ProductSize[]): ProductSize[] {
  const seen = new Set<string>();
  const out: ProductSize[] = [];
  for (const s of sizes) {
    const name = s.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, price: Math.max(0, Math.round(s.price) || 0) });
  }
  return out;
}

/** Chữ hiển thị giá trên lưới món: "từ 29.000" nếu các size có giá khác nhau. */
export function priceLabel(p: Pick<Product, 'price' | 'sizes'>): string {
  if (hasSizes(p)) {
    const prices = p.sizes.map(s => s.price);
    const min = Math.min(...prices);
    return prices.some(x => x !== min) ? `từ ${min.toLocaleString('vi-VN')}` : min.toLocaleString('vi-VN');
  }
  return p.price.toLocaleString('vi-VN');
}
