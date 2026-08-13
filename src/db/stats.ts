/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Thống kê nhanh số dòng dữ liệu đang có trong SQLite (dùng ở màn hình Cloud).
 */

import { getDriver } from './driver';
import { queryOne } from './index';
import { SCHEMA_VERSION } from './schema';

const TABLE_LABELS: { table: string; label: string; scoped: boolean }[] = [
  { table: 'products', label: 'Hàng hoá / Thực đơn', scoped: true },
  { table: 'inventory_batches', label: 'Lô tồn kho', scoped: true },
  { table: 'inventory_transactions', label: 'Phiếu nhập xuất', scoped: true },
  { table: 'orders', label: 'Hoá đơn', scoped: true },
  { table: 'order_items', label: 'Dòng hoá đơn', scoped: true },
  { table: 'customers', label: 'Khách hàng', scoped: true },
  { table: 'suppliers', label: 'Nhà cung cấp', scoped: true },
  { table: 'dining_tables', label: 'Bàn ăn', scoped: true },
  { table: 'kitchen_items', label: 'Món chờ bếp', scoped: true },
  { table: 'cart_items', label: 'Món đang gọi', scoped: true },
  { table: 'attendance', label: 'Ca chấm công', scoped: true },
  { table: 'activity_logs', label: 'Nhật ký thao tác', scoped: true },
  { table: 'users', label: 'Người dùng', scoped: false },
  { table: 'stores', label: 'Cửa hàng', scoped: false },
];

export interface DatabaseStats {
  platform: string;
  schemaVersion: number;
  tables: { table: string; label: string; count: number }[];
}

export async function getDatabaseStats(storeId: string): Promise<DatabaseStats> {
  const driver = await getDriver();
  const tables: DatabaseStats['tables'] = [];

  for (const entry of TABLE_LABELS) {
    const sql = entry.scoped
      ? `SELECT COUNT(*) AS c FROM ${entry.table} WHERE store_id = ?`
      : `SELECT COUNT(*) AS c FROM ${entry.table}`;
    const row = await queryOne<{ c: number }>(sql, entry.scoped ? [storeId] : []);
    tables.push({ table: entry.table, label: entry.label, count: Number(row?.c ?? 0) });
  }

  return {
    platform: driver.platform === 'native' ? 'SQLite native (iOS/Android)' : 'SQLite WebAssembly (trình duyệt)',
    schemaVersion: SCHEMA_VERSION,
    tables,
  };
}
