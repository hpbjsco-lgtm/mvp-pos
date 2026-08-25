/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Bảng màu badge/placeholder gán ổn định theo tên danh mục (không phụ thuộc thứ tự),
// dùng chung cho Quản lý sản phẩm/Menu và lưới sản phẩm màn hình bán hàng (POS).
const CATEGORY_COLORS = [
  { badge: 'bg-sky-50 text-sky-600', placeholder: 'bg-sky-100 text-sky-600' },
  { badge: 'bg-tertiary-container text-tertiary', placeholder: 'bg-tertiary-container text-tertiary' },
  { badge: 'bg-purple-50 text-purple-600', placeholder: 'bg-purple-100 text-purple-600' },
  { badge: 'bg-emerald-50 text-emerald-600', placeholder: 'bg-emerald-100 text-emerald-600' },
  { badge: 'bg-amber-50 text-amber-600', placeholder: 'bg-amber-100 text-amber-600' }
];

function hashCategory(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return hash % CATEGORY_COLORS.length;
}

export function categoryBadgeColor(category: string): string {
  return CATEGORY_COLORS[hashCategory(category)].badge;
}

export function categoryPlaceholderColor(category: string): string {
  return CATEGORY_COLORS[hashCategory(category)].placeholder;
}
