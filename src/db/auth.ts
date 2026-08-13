/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * XÁC THỰC NGƯỜI DÙNG HOÀN TOÀN OFFLINE (LƯU TRONG SQLITE)
 * -------------------------------------------------------
 * Không còn phụ thuộc Firebase Auth: app đăng nhập được kể cả khi mất mạng,
 * đúng bản chất của một máy bán hàng tại quầy.
 *
 * Mật khẩu được băm bằng PBKDF2-SHA256 (100.000 vòng) + salt ngẫu nhiên,
 * không bao giờ lưu mật khẩu thô.
 */

import { AUTH_CONFIG } from '../authConfig';
import { getMeta, newId, nowIso, query, queryOne, run, setMeta, upsert } from './index';
import { seedStore } from './seed';
import { hashPassword, randomSalt, verifyPassword } from './password';

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  role: 'sysadmin' | 'owner' | 'manager' | 'staff';
  storeId: string | null;
  hourlyRate: number;
  createdAt: string;
}

export interface AuthStore {
  id: string;
  name: string;
  address: string;
  phone: string;
  storeType: 'fnb' | 'retail';
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
}

const SESSION_KEY = 'session_uid';

/* ---------------------------------------------------------------------- */
/* Đọc dữ liệu người dùng / cửa hàng                                       */
/* ---------------------------------------------------------------------- */

function mapUser(r: Record<string, any>): AuthUser {
  return {
    uid: String(r.uid),
    email: String(r.email ?? ''),
    name: String(r.name ?? ''),
    role: (r.role ?? 'staff') as AuthUser['role'],
    storeId: r.store_id ? String(r.store_id) : null,
    hourlyRate: Number(r.hourly_rate ?? 25000),
    createdAt: String(r.created_at ?? ''),
  };
}

function mapStore(r: Record<string, any>): AuthStore {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    address: String(r.address ?? ''),
    phone: String(r.phone ?? ''),
    storeType: (r.store_type ?? 'fnb') as 'fnb' | 'retail',
    status: (r.status ?? 'active') as AuthStore['status'],
    createdAt: String(r.created_at ?? ''),
  };
}

export async function getUserByEmail(email: string): Promise<Record<string, any> | null> {
  return queryOne('SELECT * FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL', [email]);
}

export async function getStore(storeId: string): Promise<AuthStore | null> {
  const row = await queryOne('SELECT * FROM stores WHERE id = ? AND deleted_at IS NULL', [storeId]);
  return row ? mapStore(row) : null;
}

export async function listStores(): Promise<AuthStore[]> {
  const rows = await query('SELECT * FROM stores WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return rows.map(mapStore);
}

export async function listAllUsers(): Promise<AuthUser[]> {
  const rows = await query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC');
  return rows.map(mapUser);
}

/* ---------------------------------------------------------------------- */
/* Khởi tạo tài khoản quản trị hệ thống                                    */
/* ---------------------------------------------------------------------- */

/** Tạo tài khoản sysadmin mặc định trong lần chạy đầu tiên. */
export async function ensureSysAdmin(): Promise<void> {
  const existing = await getUserByEmail(AUTH_CONFIG.EMAIL);
  if (existing) {
    if (existing.role !== 'sysadmin') {
      await run('UPDATE users SET role = ?, updated_at = ? WHERE uid = ?', [
        'sysadmin',
        nowIso(),
        existing.uid,
      ]);
    }
    return;
  }
  const salt = randomSalt();
  await upsert('users', {
    uid: 'sysadmin',
    email: AUTH_CONFIG.EMAIL,
    password_hash: await hashPassword(AUTH_CONFIG.PASS, salt),
    password_salt: salt,
    store_id: null,
    role: 'sysadmin',
    name: 'Quản Trị Hệ Thống',
    hourly_rate: 0,
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  console.log('[AUTH] Đã khởi tạo tài khoản quản trị hệ thống:', AUTH_CONFIG.EMAIL);
}

/* ---------------------------------------------------------------------- */
/* Đăng nhập / Đăng ký / Đăng xuất                                        */
/* ---------------------------------------------------------------------- */

export interface SignInResult {
  user: AuthUser;
  store: AuthStore | null;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const row = await getUserByEmail(email.trim());
  if (!row) throw new Error('Tài khoản không tồn tại trên thiết bị này.');
  if (!row.is_active) throw new Error('Tài khoản đã bị vô hiệu hoá.');

  const ok = await verifyPassword(password, String(row.password_salt ?? ''), String(row.password_hash ?? ''));
  if (!ok) throw new Error('Mật khẩu không đúng.');

  const user = mapUser(row);
  await run('UPDATE users SET last_login_at = ? WHERE uid = ?', [nowIso(), user.uid]);
  await setMeta(SESSION_KEY, user.uid);
  if (user.storeId) await setMeta('active_store_id', user.storeId);

  const store = user.storeId ? await getStore(user.storeId) : null;
  return { user, store };
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  storeName: string;
  storeType: 'fnb' | 'retail';
  phone: string;
  address: string;
}

export async function registerOwner(input: RegisterInput): Promise<SignInResult> {
  const email = input.email.trim().toLowerCase();
  if (await getUserByEmail(email)) throw new Error('Email này đã được đăng ký trên thiết bị.');

  const storeId = `store-${Date.now()}`;
  const ts = nowIso();

  await upsert('stores', {
    id: storeId,
    name: input.storeName.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    store_type: input.storeType,
    /* Bản local-first: cửa hàng dùng được ngay, quản trị viên có thể khoá sau. */
    status: 'active',
    created_at: ts,
    updated_at: ts,
  });

  const uid = newId('user');
  const salt = randomSalt();
  await upsert('users', {
    uid,
    email,
    password_hash: await hashPassword(input.password, salt),
    password_salt: salt,
    store_id: storeId,
    role: 'owner',
    name: input.name.trim(),
    phone: input.phone.trim(),
    hourly_rate: 0,
    is_active: 1,
    created_at: ts,
    updated_at: ts,
  });

  await seedStore(storeId, input.storeType);
  await setMeta(SESSION_KEY, uid);
  await setMeta('active_store_id', storeId);

  const user = await getUserByEmail(email);
  return { user: mapUser(user!), store: await getStore(storeId) };
}

/** Tạo nhân viên mới trong cửa hàng (dùng ở màn hình Quản lý nhân viên). */
export async function createEmployee(params: {
  storeId: string;
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'manager' | 'staff';
  hourlyRate: number;
}): Promise<AuthUser> {
  const email = params.email.trim().toLowerCase();
  if (await getUserByEmail(email)) throw new Error('Email nhân viên này đã tồn tại.');
  const uid = newId('user');
  const salt = randomSalt();
  const ts = nowIso();
  await upsert('users', {
    uid,
    email,
    password_hash: await hashPassword(params.password || '123456', salt),
    password_salt: salt,
    store_id: params.storeId,
    role: params.role,
    name: params.name.trim(),
    hourly_rate: params.hourlyRate,
    is_active: 1,
    created_at: ts,
    updated_at: ts,
  });
  const row = await getUserByEmail(email);
  return mapUser(row!);
}

export async function changePassword(uid: string, newPassword: string): Promise<void> {
  const salt = randomSalt();
  await run('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE uid = ?', [
    await hashPassword(newPassword, salt),
    salt,
    nowIso(),
    uid,
  ]);
}

export async function signOut(): Promise<void> {
  await setMeta(SESSION_KEY, '');
}

/** Lấy lại phiên đăng nhập đã lưu (app mở lại không phải đăng nhập lại). */
export async function restoreSession(): Promise<SignInResult | null> {
  const uid = await getMeta(SESSION_KEY);
  if (!uid) return null;
  const row = await queryOne('SELECT * FROM users WHERE uid = ? AND deleted_at IS NULL', [uid]);
  if (!row) return null;
  const user = mapUser(row);
  const store = user.storeId ? await getStore(user.storeId) : null;
  return { user, store };
}

/**
 * Phiên "dùng thử / cửa hàng demo": tạo luôn một cửa hàng thật trong SQLite
 * kèm dữ liệu mẫu, nhờ vậy dữ liệu nhập trong chế độ demo cũng không bị mất.
 */
export async function ensureDemoStore(
  storeId: string,
  storeName: string,
  storeType: 'fnb' | 'retail',
  userName: string,
): Promise<{ store: AuthStore; user: AuthUser }> {
  const ts = nowIso();
  const existing = await getStore(storeId);
  if (!existing) {
    await upsert('stores', {
      id: storeId,
      name: storeName,
      address: 'Cửa hàng dùng thử trên thiết bị',
      phone: '0900000000',
      store_type: storeType,
      status: 'active',
      created_at: ts,
      updated_at: ts,
    });
    await seedStore(storeId, storeType);
  } else if (existing.storeType !== storeType || existing.name !== storeName) {
    await run('UPDATE stores SET name = ?, store_type = ?, updated_at = ? WHERE id = ?', [
      storeName,
      storeType,
      ts,
      storeId,
    ]);
  }

  const uid = `demo-${storeId}`;
  await upsert('users', {
    uid,
    email: `demo@${storeId.toLowerCase()}.local`,
    password_hash: '',
    password_salt: '',
    store_id: storeId,
    role: 'owner',
    name: userName || 'Nhân viên Demo',
    hourly_rate: 25000,
    is_active: 1,
    created_at: ts,
    updated_at: ts,
  });

  await setMeta(SESSION_KEY, uid);
  await setMeta('active_store_id', storeId);

  const row = await queryOne('SELECT * FROM users WHERE uid = ?', [uid]);
  return { store: (await getStore(storeId))!, user: mapUser(row!) };
}

export { mapUser, mapStore };
