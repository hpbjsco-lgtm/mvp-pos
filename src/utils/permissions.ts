/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phân quyền theo vai trò tài khoản. Mỗi vai trò chỉ thấy / vào được các màn hình trong danh sách của mình.
 *
 * - owner   : Chủ cửa hàng - toàn quyền, xem báo cáo.
 * - manager : Quản lý cửa hàng - hiện tương đương chủ cửa hàng; sau này có thể giới hạn bớt (sửa tại ROLE_SCREENS).
 * - staff   : Nhân viên phục vụ / thu ngân - chỉ màn hình bán hàng.
 * - kitchen : Nhân viên bếp - chỉ màn hình bếp (KDS).
 * - sysadmin: Quản trị hệ thống (tài khoản cứng) - chỉ thấy Cửa hàng + Tài khoản để quản lý toàn bộ trên máy.
 */

export type AppRole = 'sysadmin' | 'owner' | 'manager' | 'staff' | 'kitchen';

export type ScreenId =
  | 'pos' | 'inventory' | 'reports' | 'account' | 'kitchen' | 'menu' | 'tables'
  | 'customers' | 'employees' | 'suppliers' | 'orders' | 'shifts'
  | 'stores' | 'accounts'; // chỉ dành cho sysadmin: quản lý cửa hàng / tài khoản trên máy

const ALL_SCREENS: ScreenId[] = [
  'reports', 'pos', 'kitchen', 'menu', 'tables', 'orders', 'shifts',
  'inventory', 'customers', 'employees', 'suppliers', 'account',
];

export const ROLE_SCREENS: Record<AppRole, ScreenId[]> = {
  sysadmin: ['stores', 'accounts'],
  owner: ALL_SCREENS,
  manager: ALL_SCREENS,
  staff: ['pos'],
  kitchen: ['kitchen'],
};

export const ROLE_LABELS: Record<AppRole, string> = {
  sysadmin: 'Quản trị hệ thống',
  owner: 'Chủ cửa hàng',
  manager: 'Quản lý cửa hàng',
  staff: 'Phục vụ / Thu ngân',
  kitchen: 'Nhân viên bếp',
};

/** Chuẩn hoá chuỗi vai trò đọc từ DB; giá trị lạ (kể cả 'sysadmin' cũ) bị coi là không hợp lệ. */
export function normalizeRole(role: string | undefined | null): AppRole | null {
  return role === 'sysadmin' || role === 'owner' || role === 'manager' || role === 'staff' || role === 'kitchen' ? role : null;
}

export function canAccess(role: string | undefined | null, screen: string): boolean {
  const r = normalizeRole(role);
  return !!r && (ROLE_SCREENS[r] as string[]).includes(screen);
}

/** Màn hình mở đầu tiên sau khi đăng nhập. */
export function defaultScreen(role: string | undefined | null): ScreenId {
  const r = normalizeRole(role);
  return r ? ROLE_SCREENS[r][0] : 'pos';
}

/** Quyền quản trị (dùng cho các tính năng chỉ chủ / quản lý: thiết kế sơ đồ bàn...). */
export const isAdminRole = (role: string | undefined | null) => role === 'owner' || role === 'manager';
