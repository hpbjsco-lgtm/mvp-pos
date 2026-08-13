/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API TRUY CẬP DỮ LIỆU CẤP THẤP
 * -----------------------------
 * Khởi tạo DB, chạy migration, và cung cấp các hàm tiện ích upsert / xoá mềm
 * có kèm ghi nhật ký thay đổi vào `sync_outbox` để phục vụ đồng bộ Cloud.
 */

import { getDriver, type SqlDriver, type SqlStatement } from './driver';
import { MIGRATIONS, SCHEMA_VERSION, TABLE_PRIMARY_KEY, TABLES_WITH_REV } from './schema';

let ready: Promise<SqlDriver> | null = null;

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayKey(): string {
  // 'sv-SE' cho định dạng YYYY-MM-DD theo giờ địa phương.
  return new Date().toLocaleDateString('sv-SE');
}

let idCounter = 0;
export function newId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/* ---------------------------------------------------------------------- */
/* Khởi tạo                                                               */
/* ---------------------------------------------------------------------- */

async function migrate(driver: SqlDriver): Promise<void> {
  await driver.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);

  const applied = await driver.all<{ version: number }>('SELECT version FROM schema_migrations');
  const done = new Set(applied.map((r) => Number(r.version)));

  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    for (const stmt of migration.statements) {
      await driver.exec(stmt);
    }
    await driver.run('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
      migration.version,
      nowIso(),
    ]);
    console.log(`[SQLITE] Đã áp dụng migration v${migration.version}`);
  }

  await driver.run(
    `INSERT INTO meta (key, value, updated_at) VALUES ('schema_version', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [String(SCHEMA_VERSION), nowIso()],
  );
}

/** Mở DB + chạy migration. Gọi bao nhiêu lần cũng chỉ thực thi một lần. */
export function initDatabase(): Promise<SqlDriver> {
  if (!ready) {
    ready = (async () => {
      const driver = await getDriver();
      await migrate(driver);
      console.log(`[SQLITE] Sẵn sàng (nền tảng: ${driver.platform}, schema v${SCHEMA_VERSION})`);
      return driver;
    })();
  }
  return ready;
}

async function drv(): Promise<SqlDriver> {
  return ready ? ready : initDatabase();
}

/* ---------------------------------------------------------------------- */
/* Truy vấn                                                               */
/* ---------------------------------------------------------------------- */

export async function query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await drv();
  return d.all<T>(sql, params);
}

export async function queryOne<T = Record<string, any>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  const d = await drv();
  await d.run(sql, params);
}

export async function exec(sql: string): Promise<void> {
  const d = await drv();
  await d.exec(sql);
}

export async function batch(statements: SqlStatement[]): Promise<void> {
  if (!statements.length) return;
  const d = await drv();
  await d.batch(statements);
}

export async function flush(): Promise<void> {
  const d = await drv();
  await d.flush();
}

/* ---------------------------------------------------------------------- */
/* meta (key/value)                                                       */
/* ---------------------------------------------------------------------- */

export async function getMeta(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await run(
    `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}

/* ---------------------------------------------------------------------- */
/* Upsert / xoá mềm dùng chung + ghi outbox đồng bộ                        */
/* ---------------------------------------------------------------------- */

export type Row = Record<string, any>;

function pkOf(table: string): string {
  return TABLE_PRIMARY_KEY[table] ?? 'id';
}

/** Chuẩn hoá giá trị trước khi bind vào SQLite (boolean -> 0/1, object -> JSON). */
function normalize(value: any): any {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Tạo câu lệnh UPSERT cho 1 dòng (không thực thi ngay - dùng được trong batch). */
export function buildUpsert(table: string, row: Row): SqlStatement[] {
  const pk = pkOf(table);
  const data: Row = { ...row };
  if (TABLES_WITH_REV[table]) {
    data.updated_at = data.updated_at ?? nowIso();
  }
  const cols = Object.keys(data).filter((c) => data[c] !== undefined);
  const params = cols.map((c) => normalize(data[c]));
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((c) => c !== pk && c !== 'created_at')
    .map((c) => `${c} = excluded.${c}`);
  if (TABLES_WITH_REV[table]) updates.push(`rev = ${table}.rev + 1`);

  const sql =
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ` +
    (updates.length
      ? `ON CONFLICT(${pk}) DO UPDATE SET ${updates.join(', ')}`
      : `ON CONFLICT(${pk}) DO NOTHING`);

  const statements: SqlStatement[] = [{ sql, params }];
  if (TABLE_PRIMARY_KEY[table]) {
    statements.push(outboxStatement(table, String(data[pk]), 'upsert', data));
  }
  return statements;
}

/** Ghi 1 dòng (thực thi ngay). */
export async function upsert(table: string, row: Row): Promise<void> {
  await batch(buildUpsert(table, row));
}

export function buildSoftDelete(table: string, id: string, storeId = ''): SqlStatement[] {
  const pk = pkOf(table);
  const ts = nowIso();
  const hasRev = TABLES_WITH_REV[table];
  return [
    {
      sql: hasRev
        ? `UPDATE ${table} SET deleted_at = ?, updated_at = ?, rev = rev + 1 WHERE ${pk} = ?`
        : `UPDATE ${table} SET deleted_at = ? WHERE ${pk} = ?`,
      params: hasRev ? [ts, ts, id] : [ts, id],
    },
    outboxStatement(table, id, 'delete', { [pk]: id, store_id: storeId, deleted_at: ts }),
  ];
}

/** Xoá mềm 1 dòng (dữ liệu vẫn còn trong DB để đồng bộ Cloud, nhưng app coi như đã xoá). */
export async function softDelete(table: string, id: string, storeId = ''): Promise<void> {
  await batch(buildSoftDelete(table, id, storeId));
}

/** Xoá cứng (dùng cho các bảng con: order_items, cart_items...). */
export function buildHardDelete(table: string, whereSql: string, params: unknown[]): SqlStatement {
  return { sql: `DELETE FROM ${table} WHERE ${whereSql}`, params };
}

export function outboxStatement(table: string, rowId: string, op: 'upsert' | 'delete', payload: Row): SqlStatement {
  return {
    sql: `INSERT INTO sync_outbox (store_id, table_name, row_id, op, payload, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    params: [String(payload.store_id ?? ''), table, rowId, op, JSON.stringify(payload), nowIso()],
  };
}

/* ---------------------------------------------------------------------- */
/* Bộ đếm số phiếu (hoá đơn / phiếu kho) - đảm bảo không trùng số           */
/* ---------------------------------------------------------------------- */

export async function nextSequence(
  storeId: string,
  column: 'order_seq' | 'import_seq' | 'export_seq',
): Promise<number> {
  await run(`UPDATE stores SET ${column} = ${column} + 1, updated_at = ? WHERE id = ?`, [nowIso(), storeId]);
  const row = await queryOne<Record<string, number>>(`SELECT ${column} AS v FROM stores WHERE id = ?`, [
    storeId,
  ]);
  if (row && row.v) return Number(row.v);

  // Cửa hàng chưa tồn tại trong DB (ví dụ phiên Sandbox): đếm theo số bản ghi hiện có.
  const table = column === 'order_seq' ? 'orders' : 'inventory_transactions';
  const cnt = await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE store_id = ?`, [
    storeId,
  ]);
  return Number(cnt?.c ?? 0) + 1;
}

export { type SqlDriver, type SqlStatement };
