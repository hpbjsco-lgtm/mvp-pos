/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Bảng màu badge/placeholder gán ổn định theo tên danh mục (không phụ thuộc thứ tự),
// dùng chung cho Quản lý sản phẩm/Menu và lưới sản phẩm màn hình bán hàng (POS).
// Giữ trong bảng màu chủ đạo (cam đất + trung tính ấm) để giao diện tối giản, đồng nhất.
const CATEGORY_COLORS = [
  { badge: 'bg-primary-container text-on-primary-container', placeholder: 'bg-primary-container text-on-primary-container' },
  { badge: 'bg-surface-container-high text-on-surface-variant', placeholder: 'bg-surface-container-high text-on-surface-variant' },
  { badge: 'bg-secondary-container text-on-secondary-container', placeholder: 'bg-secondary-container text-on-secondary-container' },
  { badge: 'bg-tertiary-container text-on-tertiary-container', placeholder: 'bg-tertiary-container text-on-tertiary-container' }
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
