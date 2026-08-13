/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SNAPSHOT DỮ LIỆU CỬA HÀNG
 * -------------------------
 * Định dạng trung gian (JSON) dùng cho:
 *   - Sao lưu / phục hồi thủ công ra file.
 *   - Tải lên (push) và tải xuống (pull) Cloud.
 *
 * Dùng JSON thay vì copy nguyên file .db để một bản sao lưu tạo trên iOS có thể
 * nạp được vào Android / web, và để phía server có thể đọc, gộp dữ liệu.
 */

import { query, run, batch, nowIso, getMeta, setMeta, newId } from '../db';
import { SCHEMA_VERSION, SYNCED_TABLES, TABLE_PRIMARY_KEY, TABLES_WITH_REV } from '../db/schema';
import type { SqlStatement } from '../db/driver';

export const SNAPSHOT_FORMAT = 'smartpos-snapshot';
export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: number;
  schemaVersion: number;
  storeId: string;
  deviceId: string;
  exportedAt: string;
  tables: Record<string, Record<string, any>[]>;
  counts: Record<string, number>;
}

/** Mã thiết bị (ổn định theo máy) - giúp server phân biệt nguồn dữ liệu. */
export async function getDeviceId(): Promise<string> {
  let id = await getMeta('device_id');
  if (!id) {
    id = newId('device');
    await setMeta('device_id', id);
  }
  return id;
}

const columnCache = new Map<string, string[]>();

async function tableColumns(table: string): Promise<string[]> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = await query<{ name: string }>(`PRAGMA table_info(${table})`);
  const cols = rows.map((r) => String(r.name));
  columnCache.set(table, cols);
  return cols;
}

/** Câu WHERE lọc dữ liệu theo cửa hàng cho từng bảng. */
function scopeFor(table: string, storeId: string): { sql: string; params: unknown[] } {
  if (table === 'stores') return { sql: 'id = ?', params: [storeId] };
  return { sql: 'store_id = ?', params: [storeId] };
}

/** Tạo snapshot toàn bộ dữ liệu của một cửa hàng (bao gồm cả dòng đã xoá mềm). */
export async function createSnapshot(storeId: string): Promise<Snapshot> {
  const tables: Record<string, Record<string, any>[]> = {};
  const counts: Record<string, number> = {};

  for (const table of SYNCED_TABLES) {
    const scope = scopeFor(table, storeId);
    const rows = await query(`SELECT * FROM ${table} WHERE ${scope.sql}`, scope.params);
    tables[table] = rows;
    counts[table] = rows.length;
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    storeId,
    deviceId: await getDeviceId(),
    exportedAt: nowIso(),
    tables,
    counts,
  };
}

export function isSnapshot(value: any): value is Snapshot {
  return !!value && value.format === SNAPSHOT_FORMAT && typeof value.tables === 'object';
}

export interface ApplyResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Nạp snapshot vào SQLite.
 *
 *  - mode 'merge'   : gộp theo nguyên tắc bản mới thắng (so sánh `rev` rồi `updated_at`).
 *                     Dữ liệu local mới hơn sẽ được giữ lại -> an toàn khi 2 máy cùng bán.
 *  - mode 'replace' : xoá sạch dữ liệu local của cửa hàng rồi ghi lại theo snapshot.
 */
export async function applySnapshot(
  snapshot: Snapshot,
  mode: 'merge' | 'replace' = 'merge',
): Promise<ApplyResult> {
  if (!isSnapshot(snapshot)) throw new Error('Tệp dữ liệu không đúng định dạng snapshot SmartPOS.');
  if (snapshot.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Bản sao lưu thuộc phiên bản cấu trúc v${snapshot.schemaVersion}, mới hơn app (v${SCHEMA_VERSION}). Vui lòng cập nhật app.`,
    );
  }

  const storeId = snapshot.storeId;
  const result: ApplyResult = { inserted: 0, updated: 0, skipped: 0 };
  const statements: SqlStatement[] = [];

  if (mode === 'replace') {
    for (const table of [...SYNCED_TABLES].reverse()) {
      const scope = scopeFor(table, storeId);
      statements.push({ sql: `DELETE FROM ${table} WHERE ${scope.sql}`, params: scope.params });
    }
  }

  for (const table of SYNCED_TABLES) {
    const incoming = snapshot.tables[table];
    if (!Array.isArray(incoming) || incoming.length === 0) continue;

    const pk = TABLE_PRIMARY_KEY[table] ?? 'id';
    const cols = await tableColumns(table);
    const hasRev = !!TABLES_WITH_REV[table];

    let localMap = new Map<string, Record<string, any>>();
    if (mode === 'merge') {
      const scope = scopeFor(table, storeId);
      const localRows = await query(`SELECT * FROM ${table} WHERE ${scope.sql}`, scope.params);
      localMap = new Map(localRows.map((r) => [String(r[pk]), r]));
    }

    for (const raw of incoming) {
      const row: Record<string, any> = {};
      for (const c of cols) if (raw[c] !== undefined) row[c] = raw[c];
      if (row[pk] === undefined || row[pk] === null) continue;

      const local = localMap.get(String(row[pk]));
      if (local) {
        const remoteRev = Number(row.rev ?? 0);
        const localRev = Number(local.rev ?? 0);
        const remoteTs = String(row.updated_at ?? row.created_at ?? '');
        const localTs = String(local.updated_at ?? local.created_at ?? '');
        const remoteWins = hasRev
          ? remoteRev > localRev || (remoteRev === localRev && remoteTs > localTs)
          : remoteTs >= localTs;
        if (!remoteWins) {
          result.skipped++;
          continue;
        }
        result.updated++;
      } else {
        result.inserted++;
      }

      const names = Object.keys(row);
      statements.push({
        sql: `INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${names
          .map(() => '?')
          .join(', ')})`,
        params: names.map((n) => (typeof row[n] === 'object' && row[n] !== null ? JSON.stringify(row[n]) : row[n])),
      });
    }
  }

  await batch(statements);
  await run(
    `INSERT INTO sync_state (store_id, last_pull_at, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(store_id) DO UPDATE SET last_pull_at = excluded.last_pull_at, updated_at = excluded.updated_at`,
    [storeId, nowIso(), nowIso()],
  );

  console.log('[SYNC] Đã nạp snapshot:', result);
  return result;
}
