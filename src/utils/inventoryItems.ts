/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryBatch, Product, UnitConversion } from '../types';

/** Tổng tồn kho của một mặt hàng = tổng số lượng còn lại của các lô. */
export function stockOf(productId: string, batches: InventoryBatch[]): number {
  return batches.filter(b => b.productId === productId).reduce((s, b) => s + b.quantity, 0);
}

export type StockStatus = 'untracked' | 'out' | 'low' | 'high' | 'ok';

/** Trạng thái tồn so với định mức: hết hàng / dưới định mức thấp / vượt định mức cao / bình thường. */
export function stockStatus(p: Pick<Product, 'trackStock' | 'minStock' | 'maxStock'>, stock: number): StockStatus {
  if (p.trackStock === false) return 'untracked';
  if (stock <= 0) return 'out';
  if ((p.minStock || 0) > 0 && stock < (p.minStock || 0)) return 'low';
  if ((p.maxStock || 0) > 0 && stock > (p.maxStock || 0)) return 'high';
  return 'ok';
}

/** Đổi số lượng nhập theo một đơn vị quy đổi về đơn vị cơ bản (đơn vị cơ bản hoặc đơn vị lạ thì giữ nguyên). */
export function toBaseQuantity(p: Pick<Product, 'unit' | 'unitConversions'>, unitName: string, quantity: number): number {
  if (!unitName || unitName === p.unit) return quantity;
  const conv = (p.unitConversions || []).find(c => c.name === unitName);
  return conv ? quantity * conv.ratio : quantity;
}

/** Danh sách đơn vị chọn được của mặt hàng: đơn vị cơ bản rồi các đơn vị quy đổi. */
export function unitChoices(p: Pick<Product, 'unit' | 'unitConversions'>): { name: string; ratio: number }[] {
  const base = p.unit ? [{ name: p.unit, ratio: 1 }] : [];
  return [...base, ...(p.unitConversions || []).map((c: UnitConversion) => ({ name: c.name, ratio: c.ratio }))];
}

/** Mã hàng kế tiếp theo tiền tố: NL0001 (nguyên vật liệu), CC0001 (công cụ dụng cụ). */
export function nextItemCode(products: Pick<Product, 'sku'>[], prefix: string): string {
  const max = products
    .filter(p => p.sku.startsWith(prefix))
    .reduce((m, p) => Math.max(m, parseInt(p.sku.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export interface UnitPreset { group: string; units: { name: string; short?: string }[] }

/** Đơn vị tính gợi ý theo loại hàng (như hộp thoại "Chọn đơn vị tính" của KiotViet). */
export const UNIT_PRESETS: UnitPreset[] = [
  { group: 'Đồ ăn', units: [
    { name: 'Miligram', short: 'mg' }, { name: 'Gram', short: 'g' }, { name: 'Kilogram', short: 'kg' }, { name: 'Phần' }, { name: 'Suất' },
    { name: 'Viên' }, { name: 'Miếng' }, { name: 'Cái' }, { name: 'Đĩa' }, { name: 'Chén' }, { name: 'Bát' }, { name: 'Tô' },
    { name: 'Hộp' }, { name: 'Khay' }, { name: 'Bao' }, { name: 'Tá' },
  ] },
  { group: 'Đồ uống', units: [
    { name: 'Mililít', short: 'ml' }, { name: 'Lít', short: 'l' }, { name: 'Ly' }, { name: 'Chai' }, { name: 'Lon' }, { name: 'Hộp' },
    { name: 'Gói' }, { name: 'Thùng' }, { name: 'Két' }, { name: 'Bình' }, { name: 'Can' },
  ] },
  { group: 'Dịch vụ & Khác', units: [
    { name: 'Cái' }, { name: 'Bộ' }, { name: 'Chiếc' }, { name: 'Cuộn' }, { name: 'Túi' }, { name: 'Lần' }, { name: 'Giờ' }, { name: 'Gói' }, { name: 'Hộp' }, { name: 'Thùng' },
  ] },
];

/** Tên hiển thị của đơn vị: "Gram (g)" nếu có ký hiệu. */
export const unitLabel = (u: { name: string; short?: string }) => (u.short ? `${u.name} (${u.short})` : u.name);
