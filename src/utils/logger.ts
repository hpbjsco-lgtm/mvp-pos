/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NHẬT KÝ THAO TÁC -> BẢNG activity_logs TRONG SQLITE
 * Ghi lại ai làm gì, ở màn hình nào, với dữ liệu gì. Nhật ký được đồng bộ lên
 * Cloud cùng dữ liệu nghiệp vụ nên vẫn tra cứu được từ máy khác.
 */

import { newId, nowIso, run } from '../db';

interface LogContext {
  userId: string;
  userName: string;
  storeId: string;
}

let currentContext: LogContext = {
  userId: 'unknown_user',
  userName: 'Khách vãng lai / Hệ thống',
  storeId: '',
};

export function setLogContext(context: Partial<LogContext>) {
  currentContext = { ...currentContext, ...context };
}

export async function logOperation(screenName: string, action: string, data: any): Promise<void> {
  try {
    const { userId, userName, storeId } = currentContext;
    const payload = data && typeof data === 'object' ? data : { rawData: data };

    await run(
      `INSERT INTO activity_logs (id, store_id, user_id, user_name, screen_name, action, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('log'),
        storeId || '',
        userId,
        userName,
        screenName,
        action,
        JSON.stringify(payload, jsonSafe),
        nowIso(),
      ],
    );
  } catch (error) {
    // Nhật ký không được phép làm gián đoạn nghiệp vụ bán hàng.
    console.error('[LOG] Không ghi được nhật ký thao tác:', error);
  }
}

/** Bỏ các giá trị không thể tuần tự hoá (hàm, phần tử DOM...). */
function jsonSafe(_key: string, value: any) {
  if (typeof value === 'function' || value instanceof Element) return undefined;
  return value;
}

/** Đọc nhật ký thao tác gần nhất (dùng cho màn hình quản trị). */
export async function readRecentLogs(storeId: string, limit = 100) {
  const { query } = await import('../db');
  const rows = await query(
    `SELECT * FROM activity_logs WHERE store_id = ? ORDER BY created_at DESC LIMIT ?`,
    [storeId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    storeId: String(r.store_id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    screenName: String(r.screen_name),
    action: String(r.action),
    data: safeParse(String(r.data ?? '{}')),
    createdAt: String(r.created_at),
  }));
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
