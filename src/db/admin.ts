/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QUẢN TRỊ HỆ THỐNG (dành cho tài khoản sysadmin cứng)
 * ----------------------------------------------------
 * Thao tác trực tiếp trên SQLite cho toàn bộ cửa hàng / tài khoản có trên thiết bị,
 * không đi qua lớp dữ liệu theo từng cửa hàng (collections) vì sysadmin không thuộc cửa hàng nào.
 */

import {
  batch, buildHardDelete, flush, nowIso, query, queryOne, run, setMeta, upsert, type SqlStatement,
} from './index';
import { SYNCED_TABLES } from './schema';
import {
  changePassword, createEmployee, getStore, getUserByLogin, mapStore, mapUser, normalizeUsername,
  type AuthStore, type AuthUser, type StoreRole,
} from './auth';
import { seedStore } from './seed';

export interface AdminStore extends AuthStore {
  userCount: number;
}

export interface AdminUser extends AuthUser {
  storeName: string;
  isActive: boolean;
}

/* ------------------------------ Cửa hàng ------------------------------ */

export async function adminListStores(): Promise<AdminStore[]> {
  const rows = await query(
    `SELECT s.*, (SELECT COUNT(*) FROM users u WHERE u.store_id = s.id AND u.deleted_at IS NULL) AS user_count
     FROM stores s WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC`,
  );
  return rows.map(r => ({ ...mapStore(r), userCount: Number(r.user_count ?? 0) }));
}

export interface StoreInput {
  name: string;
  storeType: 'fnb' | 'retail';
  phone: string;
  address: string;
  status: 'active' | 'rejected'; // active = hoạt động, rejected = tạm khóa
}

export async function adminCreateStore(input: StoreInput & { withSampleData: boolean }): Promise<AuthStore> {
  if (!input.name.trim()) throw new Error('Vui lòng nhập tên cửa hàng.');
  const id = `store-${Date.now()}`;
  const ts = nowIso();
  await upsert('stores', {
    id,
    name: input.name.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    store_type: input.storeType,
    status: input.status,
    created_at: ts,
    updated_at: ts,
  });
  if (input.withSampleData) await seedStore(id, input.storeType);
  return (await getStore(id))!;
}

export async function adminUpdateStore(id: string, patch: StoreInput): Promise<void> {
  if (!patch.name.trim()) throw new Error('Vui lòng nhập tên cửa hàng.');
  await run(
    'UPDATE stores SET name = ?, address = ?, phone = ?, store_type = ?, status = ?, updated_at = ?, rev = rev + 1 WHERE id = ?',
    [patch.name.trim(), patch.address.trim(), patch.phone.trim(), patch.storeType, patch.status, nowIso(), id],
  );
}

/** Xóa mềm cửa hàng và toàn bộ tài khoản của cửa hàng đó (dữ liệu nghiệp vụ còn nằm trong DB nhưng không còn truy cập được). */
export async function adminDeleteStore(id: string): Promise<void> {
  const ts = nowIso();
  const users = await query('SELECT uid, username, email FROM users WHERE store_id = ? AND deleted_at IS NULL', [id]);
  const statements: SqlStatement[] = [
    { sql: 'UPDATE stores SET deleted_at = ?, updated_at = ?, rev = rev + 1 WHERE id = ?', params: [ts, ts, id] },
    ...users.map(u => softDeleteUserStatement(String(u.uid), String(u.username), String(u.email), ts)),
  ];
  await batch(statements);
}

/* ------------------------------ Tài khoản ----------------------------- */

export async function adminListUsers(): Promise<AdminUser[]> {
  const rows = await query(
    `SELECT u.*, s.name AS store_name FROM users u
     LEFT JOIN stores s ON s.id = u.store_id
     WHERE u.deleted_at IS NULL AND u.role <> 'sysadmin' ORDER BY s.name ASC, u.created_at ASC`,
  );
  return rows.map(r => ({ ...mapUser(r), storeName: String(r.store_name ?? '(không có cửa hàng)'), isActive: !!r.is_active }));
}

export interface AdminUserInput {
  storeId: string;
  username: string;
  email: string;
  name: string;
  role: StoreRole;
  hourlyRate: number;
}

export async function adminCreateUser(input: AdminUserInput & { password: string }): Promise<void> {
  if (!(await getStore(input.storeId))) throw new Error('Cửa hàng không tồn tại.');
  if (input.password.length < 6) throw new Error('Mật khẩu cần tối thiểu 6 ký tự.');
  await createEmployee(input);
}

export async function adminUpdateUser(uid: string, patch: AdminUserInput & { isActive: boolean }): Promise<void> {
  const username = normalizeUsername(patch.username);
  const email = patch.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email không hợp lệ.');
  if (!patch.name.trim()) throw new Error('Vui lòng nhập họ tên.');
  if (!(await getStore(patch.storeId))) throw new Error('Cửa hàng không tồn tại.');

  const byUsername = await getUserByLogin(username);
  if (byUsername && byUsername.uid !== uid) throw new Error('Tên tài khoản này đã tồn tại.');
  const byEmail = await getUserByLogin(email);
  if (byEmail && byEmail.uid !== uid) throw new Error('Email này đã được dùng cho một tài khoản khác.');

  await run(
    `UPDATE users SET username = ?, email = ?, name = ?, role = ?, store_id = ?, hourly_rate = ?, is_active = ?,
       updated_at = ?, rev = rev + 1 WHERE uid = ?`,
    [username, email, patch.name.trim(), patch.role, patch.storeId, patch.hourlyRate, patch.isActive ? 1 : 0, nowIso(), uid],
  );
}

export async function adminSetPassword(uid: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('Mật khẩu cần tối thiểu 6 ký tự.');
  await changePassword(uid, newPassword);
}

/** Xóa mềm tài khoản. Đổi tên đăng nhập / email để có thể tái sử dụng (các cột này có chỉ mục duy nhất). */
function softDeleteUserStatement(uid: string, username: string, email: string, ts: string): SqlStatement {
  const tag = `~del~${Date.now()}~${uid}`;
  return {
    sql: 'UPDATE users SET deleted_at = ?, username = ?, email = ?, updated_at = ?, rev = rev + 1 WHERE uid = ?',
    params: [ts, `${username}${tag}`, `${email}${tag}`, ts, uid],
  };
}

export async function adminDeleteUser(uid: string): Promise<void> {
  const row = await queryOne('SELECT uid, username, email FROM users WHERE uid = ? AND deleted_at IS NULL', [uid]);
  if (!row) return;
  await batch([softDeleteUserStatement(String(row.uid), String(row.username), String(row.email), nowIso())]);
}

/* ------------------------------ Xóa dữ liệu --------------------------- */

/**
 * XÓA TOÀN BỘ dữ liệu nghiệp vụ trên thiết bị (cửa hàng, tài khoản, đơn hàng, kho...). Không thể hoàn tác.
 * Giữ nguyên cấu trúc bảng và lịch sử migration; xóa luôn phiên đăng nhập.
 */
export async function wipeAllData(): Promise<void> {
  // Bảng con trước, bảng cha sau (các bảng có khóa ngoại ON DELETE CASCADE)
  const children = ['order_items', 'inventory_transaction_items', 'cart_items'];
  const tables = [...children, ...SYNCED_TABLES.filter(t => !children.includes(t)), 'sync_outbox', 'sync_state'];
  await batch(tables.map(t => buildHardDelete(t, '1 = 1', [])));
  await setMeta('session_uid', '');
  await setMeta('active_store_id', '');
  await flush();
}

