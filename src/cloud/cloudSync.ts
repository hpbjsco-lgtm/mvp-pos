/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ĐỒNG BỘ SQLITE LÊN CLOUD
 * ------------------------
 * Mô hình: "local-first, cloud-backup".
 *   - App luôn đọc/ghi vào SQLite trên máy -> bán hàng không phụ thuộc mạng.
 *   - Khi có mạng: TẢI LÊN (push) toàn bộ hoặc phần thay đổi, và TẢI XUỐNG (pull)
 *     dữ liệu từ Cloud để hợp nhất (bản mới thắng theo `rev` + `updated_at`).
 *
 * Giao thức HTTP (xem server mẫu tại server/cloud-sync-server.mjs):
 *   GET    {endpoint}/health
 *   PUT    {endpoint}/stores/{storeId}/snapshot     body = Snapshot        -> {version}
 *   GET    {endpoint}/stores/{storeId}/snapshot                            -> Snapshot | 404
 *   POST   {endpoint}/stores/{storeId}/changes      body = {changes:[...]} -> {accepted}
 * Xác thực: header `Authorization: Bearer <token>`.
 */

import { Capacitor } from '@capacitor/core';
import { batch, getMeta, nowIso, query, queryOne, run, setMeta } from '../db';
import { applySnapshot, createSnapshot, getDeviceId, isSnapshot, type Snapshot } from './snapshot';

export interface SyncConfig {
  endpoint: string;
  token: string;
  autoSync: boolean;
  deviceId: string;
  lastPushAt: string | null;
  lastPullAt: string | null;
  remoteVersion: number;
  lastError: string;
}

const DEFAULT_ENDPOINT_KEY = 'default_sync_endpoint';

export async function getSyncConfig(storeId: string): Promise<SyncConfig> {
  const row = await queryOne<Record<string, any>>('SELECT * FROM sync_state WHERE store_id = ?', [storeId]);
  const deviceId = await getDeviceId();
  return {
    endpoint: String(row?.endpoint ?? (await getMeta(DEFAULT_ENDPOINT_KEY)) ?? ''),
    token: String(row?.token ?? ''),
    autoSync: !!Number(row?.auto_sync ?? 0),
    deviceId,
    lastPushAt: row?.last_push_at ?? null,
    lastPullAt: row?.last_pull_at ?? null,
    remoteVersion: Number(row?.remote_version ?? 0),
    lastError: String(row?.last_error ?? ''),
  };
}

export async function saveSyncConfig(
  storeId: string,
  config: { endpoint: string; token: string; autoSync: boolean },
): Promise<void> {
  const ts = nowIso();
  await run(
    `INSERT INTO sync_state (store_id, endpoint, token, auto_sync, device_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id) DO UPDATE SET
       endpoint = excluded.endpoint,
       token = excluded.token,
       auto_sync = excluded.auto_sync,
       updated_at = excluded.updated_at`,
    [storeId, config.endpoint.trim(), config.token.trim(), config.autoSync ? 1 : 0, await getDeviceId(), ts],
  );
  await setMeta(DEFAULT_ENDPOINT_KEY, config.endpoint.trim());
}

async function setSyncError(storeId: string, message: string): Promise<void> {
  await run(
    `INSERT INTO sync_state (store_id, last_error, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(store_id) DO UPDATE SET last_error = excluded.last_error, updated_at = excluded.updated_at`,
    [storeId, message, nowIso()],
  );
}

function joinUrl(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, '')}${path}`;
}

async function request(
  config: SyncConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!config.endpoint) throw new Error('Chưa cấu hình địa chỉ máy chủ Cloud.');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': config.deviceId,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    return await fetch(joinUrl(config.endpoint, path), { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export interface SyncOutcome {
  ok: boolean;
  message: string;
  detail?: Record<string, any>;
}

/** Kiểm tra kết nối tới máy chủ Cloud. */
export async function testConnection(storeId: string): Promise<SyncOutcome> {
  try {
    const config = await getSyncConfig(storeId);
    const res = await request(config, '/health');
    if (!res.ok) throw new Error(`Máy chủ trả về mã ${res.status}`);
    const body = await res.json().catch(() => ({}));
    return { ok: true, message: 'Kết nối máy chủ Cloud thành công.', detail: body };
  } catch (err: any) {
    const message = err?.message ?? 'Không kết nối được máy chủ.';
    await setSyncError(storeId, message);
    return { ok: false, message: `Kết nối thất bại: ${message}` };
  }
}

/** TẢI LÊN: đẩy toàn bộ dữ liệu cửa hàng lên Cloud. */
export async function pushSnapshot(storeId: string): Promise<SyncOutcome> {
  try {
    const config = await getSyncConfig(storeId);
    const snapshot = await createSnapshot(storeId);
    const res = await request(config, `/stores/${encodeURIComponent(storeId)}/snapshot`, {
      method: 'PUT',
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`Máy chủ trả về mã ${res.status} ${await res.text().catch(() => '')}`);
    const body = await res.json().catch(() => ({}));

    const ts = nowIso();
    await run(
      `INSERT INTO sync_state (store_id, last_push_at, remote_version, last_error, updated_at)
       VALUES (?, ?, ?, '', ?)
       ON CONFLICT(store_id) DO UPDATE SET
         last_push_at = excluded.last_push_at,
         remote_version = excluded.remote_version,
         last_error = '',
         updated_at = excluded.updated_at`,
      [storeId, ts, Number(body.version ?? 0), ts],
    );
    /* Đã đẩy full snapshot -> đánh dấu mọi thay đổi đang chờ là đã gửi. */
    await run('UPDATE sync_outbox SET pushed_at = ? WHERE store_id = ? AND pushed_at IS NULL', [ts, storeId]);

    const total = Object.values(snapshot.counts).reduce((a, b) => a + b, 0);
    return {
      ok: true,
      message: `Đã tải lên Cloud ${total.toLocaleString('vi-VN')} dòng dữ liệu.`,
      detail: snapshot.counts,
    };
  } catch (err: any) {
    const message = err?.message ?? 'Lỗi không xác định';
    await setSyncError(storeId, message);
    return { ok: false, message: `Tải lên thất bại: ${message}` };
  }
}

/** TẢI XUỐNG: lấy dữ liệu từ Cloud và hợp nhất vào SQLite trên máy. */
export async function pullSnapshot(
  storeId: string,
  mode: 'merge' | 'replace' = 'merge',
): Promise<SyncOutcome> {
  try {
    const config = await getSyncConfig(storeId);
    const res = await request(config, `/stores/${encodeURIComponent(storeId)}/snapshot`);
    if (res.status === 404) {
      return { ok: false, message: 'Cloud chưa có dữ liệu của cửa hàng này. Hãy tải lên trước.' };
    }
    if (!res.ok) throw new Error(`Máy chủ trả về mã ${res.status}`);

    const remote = (await res.json()) as Snapshot;
    if (!isSnapshot(remote)) throw new Error('Dữ liệu tải về không đúng định dạng.');

    const result = await applySnapshot({ ...remote, storeId }, mode);
    return {
      ok: true,
      message: `Đã tải xuống và hợp nhất: thêm mới ${result.inserted}, cập nhật ${result.updated}, giữ bản local ${result.skipped}.`,
      detail: result as any,
    };
  } catch (err: any) {
    const message = err?.message ?? 'Lỗi không xác định';
    await setSyncError(storeId, message);
    return { ok: false, message: `Tải xuống thất bại: ${message}` };
  }
}

/** Đẩy phần thay đổi (nhẹ hơn snapshot) - dùng cho auto-sync định kỳ. */
export async function pushPendingChanges(storeId: string): Promise<SyncOutcome> {
  try {
    const pending = await query<Record<string, any>>(
      `SELECT seq, table_name, row_id, op, payload, created_at FROM sync_outbox
       WHERE store_id = ? AND pushed_at IS NULL ORDER BY seq ASC LIMIT 500`,
      [storeId],
    );
    if (pending.length === 0) return { ok: true, message: 'Không có thay đổi nào cần đồng bộ.' };

    const config = await getSyncConfig(storeId);
    const res = await request(config, `/stores/${encodeURIComponent(storeId)}/changes`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: config.deviceId,
        changes: pending.map((p) => ({
          seq: Number(p.seq),
          table: p.table_name,
          rowId: p.row_id,
          op: p.op,
          row: safeParse(p.payload),
          at: p.created_at,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Máy chủ trả về mã ${res.status}`);

    const ts = nowIso();
    await batch(
      pending.map((p) => ({
        sql: 'UPDATE sync_outbox SET pushed_at = ? WHERE seq = ?',
        params: [ts, Number(p.seq)],
      })),
    );
    await run(
      `INSERT INTO sync_state (store_id, last_push_at, last_error, updated_at) VALUES (?, ?, '', ?)
       ON CONFLICT(store_id) DO UPDATE SET last_push_at = excluded.last_push_at, last_error = '', updated_at = excluded.updated_at`,
      [storeId, ts, ts],
    );
    return { ok: true, message: `Đã đồng bộ ${pending.length} thay đổi lên Cloud.` };
  } catch (err: any) {
    const message = err?.message ?? 'Lỗi không xác định';
    await setSyncError(storeId, message);
    return { ok: false, message: `Đồng bộ thay đổi thất bại: ${message}` };
  }
}

/**
 * Nhịp tự động đồng bộ: chỉ chạy khi người dùng đã bật auto-sync, có cấu hình
 * máy chủ và thiết bị đang có mạng. Gọi định kỳ từ App.
 */
export async function autoSyncTick(storeId: string): Promise<SyncOutcome | null> {
  if (!storeId) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const config = await getSyncConfig(storeId);
  if (!config.autoSync || !config.endpoint) return null;
  if ((await countPendingChanges(storeId)) === 0) return null;
  const result = await pushPendingChanges(storeId);
  if (result.ok) await pruneOutbox();
  return result;
}

function safeParse(value: any): any {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

/** Số thay đổi đang chờ đồng bộ. */
export async function countPendingChanges(storeId: string): Promise<number> {
  const row = await queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM sync_outbox WHERE store_id = ? AND pushed_at IS NULL',
    [storeId],
  );
  return Number(row?.c ?? 0);
}

/** Dọn nhật ký thay đổi đã gửi (giữ 7 ngày gần nhất). */
export async function pruneOutbox(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await run('DELETE FROM sync_outbox WHERE pushed_at IS NOT NULL AND pushed_at < ?', [cutoff]);
}

/* ---------------------------------------------------------------------- */
/* Sao lưu / phục hồi thủ công bằng file (không cần máy chủ)              */
/* ---------------------------------------------------------------------- */

export async function exportSnapshotToFile(storeId: string): Promise<SyncOutcome> {
  try {
    const snapshot = await createSnapshot(storeId);
    const json = JSON.stringify(snapshot, null, 2);
    const fileName = `smartpos-${storeId}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;

    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      await Filesystem.writeFile({
        path: fileName,
        data: json,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return { ok: true, message: `Đã lưu bản sao lưu vào thư mục Tài liệu: ${fileName}` };
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, message: `Đã tải xuống bản sao lưu: ${fileName}` };
  } catch (err: any) {
    return { ok: false, message: `Sao lưu thất bại: ${err?.message ?? err}` };
  }
}

export async function importSnapshotFromText(
  text: string,
  storeId: string,
  mode: 'merge' | 'replace' = 'merge',
): Promise<SyncOutcome> {
  try {
    const parsed = JSON.parse(text);
    if (!isSnapshot(parsed)) throw new Error('Tệp không phải bản sao lưu SmartPOS.');
    const result = await applySnapshot({ ...parsed, storeId: storeId || parsed.storeId }, mode);
    return {
      ok: true,
      message: `Phục hồi thành công: thêm mới ${result.inserted}, cập nhật ${result.updated}, bỏ qua ${result.skipped}.`,
      detail: result as any,
    };
  } catch (err: any) {
    return { ok: false, message: `Phục hồi thất bại: ${err?.message ?? err}` };
  }
}
