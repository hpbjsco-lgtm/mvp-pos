/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TABLE_PRIMARY_KEY } from '../db/schema';
import type { ConflictDetail, PushGroup, SyncRow } from './syncClient';

/** Name of a record type in words the shop's staff use. */
const TABLE_LABELS: Record<string, string> = {
  products: 'Món / hàng hóa', orders: 'Hóa đơn', customers: 'Khách hàng', users: 'Tài khoản', stores: 'Cửa hàng',
  suppliers: 'Nhà cung cấp', dining_tables: 'Bàn', zones: 'Khu vực', inventory_batches: 'Lô hàng',
  inventory_transactions: 'Phiếu kho', cash_vouchers: 'Phiếu thu / chi', bank_accounts: 'Tài khoản ngân hàng',
  shifts: 'Ca làm việc', attendance: 'Chấm công',
};

/** Name of a child record type. */
const CHILD_LABELS: Record<string, string> = {
  order_items: 'Dòng món', inventory_transaction_items: 'Dòng hàng', cart_items: 'Dòng món',
  product_option_groups: 'Nhóm tùy chọn', product_option_choices: 'Lựa chọn',
};

/**
 * Column names in words the shop's staff use. A column that is not listed for a table is hidden (see `HIDDEN_COLUMNS`)
 * or shown with its raw name; a test fails when a listed table has a column that is neither.
 */
const COLUMN_LABELS: Record<string, Record<string, string>> = {
  products: {
    name: 'Tên', sku: 'Mã', price: 'Giá bán', cost: 'Giá vốn', unit: 'Đơn vị', category: 'Nhóm', is_available: 'Cho phép bán',
    track_stock: 'Quản lý tồn kho', min_stock: 'Tồn tối thiểu', max_stock: 'Tồn tối đa', note: 'Ghi chú', is_topping: 'Là topping',
    topping_kind: 'Loại topping', sizes: 'Các size', item_group: 'Nhóm quản lý', brand: 'Thương hiệu', location: 'Vị trí',
    weight: 'Trọng lượng', unit_conversions: 'Quy đổi đơn vị', check_each_shift: 'Kiểm kho mỗi ca', is_active: 'Hiện trên màn thu ngân', menu_type: 'Loại thực đơn',
    dish_kind: 'Loại món', recipe: 'Công thức', deleted_at: 'Thời điểm xóa',
  },
  orders: {
    order_number: 'Số hóa đơn', temp_order_number: 'Mã tạm', store_type: 'Loại cửa hàng', order_type: 'Hình thức', status: 'Trạng thái',
    table_number: 'Bàn', customer_name: 'Khách hàng', staff_name: 'Nhân viên', subtotal: 'Tạm tính', discount_amount: 'Giảm giá',
    tax_amount: 'Thuế', total_amount: 'Tổng tiền', total_cost: 'Giá vốn', cost_recorded: 'Đã lưu giá vốn', line_discount_amount: 'Giảm giá theo món', channel_name: 'Kênh bán', commission_percent: 'Chiết khấu (%)', commission_amount: 'Tiền chiết khấu', payment_method: 'Thanh toán', payments: 'Chi tiết thanh toán',
    paid_amount: 'Khách đưa', change_amount: 'Tiền thừa', points_earned: 'Điểm cộng', points_used: 'Điểm dùng', note: 'Ghi chú',
    deleted_at: 'Thời điểm xóa',
  },
  customers: {
    name: 'Tên', phone: 'Điện thoại', email: 'Email', address: 'Địa chỉ', birthday: 'Ngày sinh', points: 'Điểm', total_spent: 'Tổng chi tiêu',
    visit_count: 'Số lần đến', debt: 'Công nợ', note: 'Ghi chú', deleted_at: 'Thời điểm xóa',
  },
  users: {
    email: 'Email', username: 'Tên đăng nhập', password_hash: 'Mật khẩu', password_salt: 'Mật khẩu (muối)', pin_code: 'Mã PIN', role: 'Vai trò',
    name: 'Tên', phone: 'Điện thoại', hourly_rate: 'Lương theo giờ', is_active: 'Đang hoạt động', last_login_at: 'Đăng nhập gần nhất',
    deleted_at: 'Thời điểm xóa',
  },
  stores: {
    name: 'Tên cửa hàng', address: 'Địa chỉ', phone: 'Điện thoại', store_type: 'Loại cửa hàng', status: 'Trạng thái', tax_code: 'Mã số thuế',
    currency: 'Tiền tệ', receipt_footer: 'Chân hóa đơn', logo_url: 'Logo', auto_stock_deduction: 'Tự động trừ kho khi bán', sales_channels: 'Kênh bán', deleted_at: 'Thời điểm xóa',
  },
  suppliers: {
    name: 'Tên', phone: 'Điện thoại', email: 'Email', address: 'Địa chỉ', tax_code: 'Mã số thuế', note: 'Ghi chú', deleted_at: 'Thời điểm xóa',
  },
  dining_tables: {
    name: 'Tên bàn', status: 'Trạng thái', capacity: 'Số chỗ', x: 'Vị trí ngang', y: 'Vị trí dọc', width: 'Rộng', height: 'Cao',
    reservation_name: 'Khách đặt', reservation_phone: 'Điện thoại khách đặt', reservation_time: 'Giờ đặt', reservation_note: 'Ghi chú đặt bàn',
    opened_at: 'Giờ mở bàn', guest_count: 'Số khách', deleted_at: 'Thời điểm xóa',
  },
  inventory_batches: {
    product_kind: 'Loại hàng', batch_code: 'Mã lô', expiry_date: 'Hạn dùng', manufacture_date: 'Ngày sản xuất', import_price: 'Giá nhập',
    quantity: 'Tồn hiện tại', original_quantity: 'Số lượng nhập', deleted_at: 'Thời điểm xóa',
  },
  inventory_transactions: {
    transaction_number: 'Số phiếu', temp_code: 'Mã tạm', type: 'Loại phiếu', kind: 'Loại hàng', stocktake_kind: 'Loại kiểm kho', supplier_name: 'Nhà cung cấp',
    total_amount: 'Tổng tiền', staff_name: 'Nhân viên', note: 'Ghi chú', deleted_at: 'Thời điểm xóa',
  },
  cash_vouchers: {
    code: 'Số phiếu', temp_code: 'Mã tạm', voucher_type: 'Loại phiếu', fund: 'Quỹ', amount: 'Số tiền', category: 'Loại thu chi',
    counterparty: 'Người nộp / nhận', phone: 'Điện thoại', note: 'Ghi chú', status: 'Trạng thái', created_by: 'Người lập', deleted_at: 'Thời điểm xóa',
  },
  bank_accounts: {
    account_name: 'Tên tài khoản', account_number: 'Số tài khoản', bank_code: 'Mã ngân hàng', bank_name: 'Ngân hàng', holder: 'Chủ tài khoản',
    note: 'Ghi chú', is_default: 'Tài khoản mặc định', deleted_at: 'Thời điểm xóa',
  },
  zones: { name: 'Tên khu vực', sort_order: 'Thứ tự', deleted_at: 'Thời điểm xóa' },
  shifts: {
    staff_name: 'Nhân viên', opening_cash: 'Tiền đầu ca', closing_cash_expected: 'Tiền cuối ca (dự kiến)', closing_cash_actual: 'Tiền cuối ca (thực tế)',
    status: 'Trạng thái', note: 'Ghi chú', opened_at: 'Giờ mở ca', closed_at: 'Giờ đóng ca', deleted_at: 'Thời điểm xóa',
  },
  attendance: {
    user_name: 'Nhân viên', date: 'Ngày', check_in: 'Giờ vào', check_out: 'Giờ ra', hours_worked: 'Số giờ', hourly_rate: 'Lương theo giờ',
    daily_wage: 'Lương ngày', status: 'Trạng thái', note: 'Ghi chú', deleted_at: 'Thời điểm xóa',
  },
  order_items: {
    product_name: 'Món', quantity: 'Số lượng', price: 'Đơn giá', cost: 'Giá vốn', discount: 'Giảm giá', batch_code: 'Mã lô', note: 'Ghi chú', size: 'Size',
    sugar_level: 'Mức đường', ice_level: 'Mức đá', options: 'Tùy chọn', toppings: 'Topping',
  },
  inventory_transaction_items: { product_name: 'Hàng', batch_code: 'Mã lô', quantity: 'Số lượng', price: 'Đơn giá', system_quantity: 'Tồn hệ thống', counted_quantity: 'Đếm thực tế' },
  cart_items: { quantity: 'Số lượng', note: 'Ghi chú', size: 'Size', sugar_level: 'Mức đường', ice_level: 'Mức đá', options: 'Tùy chọn', toppings: 'Topping' },
  product_option_groups: { name: 'Tên nhóm', allow_multiple: 'Cho chọn nhiều' },
  product_option_choices: { label: 'Lựa chọn', is_default: 'Mặc định' },
};

/**
 * Columns never shown: keys that point at other records (the names next to them are shown instead), row versions,
 * timestamps the system sets and line numbers. They differ between two versions without meaning anything to a person.
 */
const HIDDEN_COLUMNS = new Set([
  'id', 'uid', 'store_id', 'rev', 'created_at', 'updated_at', 'line_no', 'table_id', 'customer_id', 'staff_id', 'zone_id', 'supplier_id',
  'product_id', 'order_id', 'transaction_id', 'cart_id', 'batch_id', 'bank_account_id', 'user_id', 'merged_into_id', 'cart_key', 'kind',
  'image_url', 'topping_for', 'order_seq', 'import_seq', 'export_seq', 'sent_quantity', 'kitchen_batch_id', 'shift_id', 'group_id',
]);

/** Columns whose value must never appear on screen; a difference is shown without the values. */
const SENSITIVE_COLUMNS = new Set(['password_hash', 'password_salt', 'pin_code']);

/** Columns that hold an amount of money. */
const MONEY_COLUMNS = new Set([
  'price', 'cost', 'subtotal', 'discount_amount', 'tax_amount', 'total_amount', 'total_cost', 'paid_amount', 'change_amount', 'amount',
  'import_price', 'line_discount_amount', 'commission_amount', 'debt', 'discount', 'opening_cash', 'closing_cash_expected', 'closing_cash_actual', 'hourly_rate', 'daily_wage', 'total_spent',
]);

/** Columns that hold yes or no as 1 or 0. */
const YES_NO_COLUMNS = new Set(['is_available', 'track_stock', 'is_topping', 'is_active', 'is_default', 'auto_stock_deduction', 'cost_recorded', 'check_each_shift']);

/** Longest text shown for a value before it is cut. */
const MAX_VALUE_LENGTH = 80;

/** One field that differs between the two versions. */
export interface FieldDifference {
  column: string;
  /** Name of the field in words. */
  label: string;
  /** The server's value as text. */
  serverValue: string;
  /** The device's value as text. */
  deviceValue: string;
}

/** How the child rows (for example the lines of an order) differ. */
export interface ChildDifference {
  /** Name of the kind of line. */
  label: string;
  serverCount: number;
  deviceCount: number;
  /** Lines only the device has. */
  added: string[];
  /** Lines only the server has. */
  removed: string[];
  /** Lines both have with different values, described as "Cà phê: Số lượng 2 → 3". */
  changed: string[];
}

/** The two versions of a conflict, ready to show. */
export interface ConflictComparison {
  /** Kind of record, for example "Hóa đơn". */
  tableLabel: string;
  /** Which record, for example the invoice number. */
  rowLabel: string;
  /** True when the record was removed on the server. */
  serverRemoved: boolean;
  /** Fields that differ. */
  fields: FieldDifference[];
  /** Differences of the child rows; only kinds that differ are listed. */
  children: ChildDifference[];
}

/**
 * Turns a name like `store_type` into readable text for a column nobody labelled.
 *
 * @param column Column name.
 * @returns The name with spaces, first letter in capitals.
 */
function humanize(column: string): string {
  const text = column.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param table Table name.
 * @param column Column name.
 * @returns True when the column is shown on the comparison.
 */
function isVisibleColumn(table: string, column: string): boolean {
  return !HIDDEN_COLUMNS.has(column) && (COLUMN_LABELS[table] === undefined || column in COLUMN_LABELS[table]);
}

/**
 * @param table Table name.
 * @param column Column name.
 * @returns The label of the column.
 */
function labelOf(table: string, column: string): string {
  return COLUMN_LABELS[table]?.[column] ?? humanize(column);
}

/**
 * Formats one value for the screen.
 *
 * @param column Column the value belongs to.
 * @param value Raw value.
 * @returns Text; `(trống)` for an empty value, money with "đ", yes or no as "Có" and "Không", dates as dd/MM/yyyy, long text cut.
 */
export function formatValue(column: string, value: unknown): string {
  if (SENSITIVE_COLUMNS.has(column)) return value === null || value === undefined || value === '' ? '(trống)' : '••••••';
  if (value === null || value === undefined || value === '') return '(trống)';
  if (MONEY_COLUMNS.has(column) && typeof value === 'number') return `${value.toLocaleString('vi-VN')} đ`;
  if (YES_NO_COLUMNS.has(column)) return Number(value) === 1 ? 'Có' : 'Không';
  const text = String(value);
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoDate && (column.endsWith('_at') || column.endsWith('_date') || column === 'date' || column === 'birthday')) {
    const day = `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
    // A timestamp is shown in the viewer's local time; a plain date has no time to convert.
    const stamp = new Date(text);
    return column.endsWith('_at') && /T\d{2}:\d{2}/.test(text) && !Number.isNaN(stamp.getTime())
      ? stamp.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : day;
  }
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/**
 * Names a record so a person recognises it: the invoice number, the product name and so on.
 *
 * @param table Table of the record.
 * @param row The record.
 * @param fallback Text used when the record has no recognisable name.
 * @returns The name.
 */
function describeRow(table: string, row: SyncRow, fallback: string): string {
  const pick = (...columns: string[]) => columns.map(column => row[column]).find(value => typeof value === 'string' && value !== '') as string | undefined;
  switch (table) {
    case 'orders': return pick('order_number', 'temp_order_number') ?? fallback;
    case 'inventory_transactions': return pick('transaction_number', 'temp_code') ?? fallback;
    case 'cash_vouchers': return pick('code', 'temp_code') ?? fallback;
    case 'inventory_batches': return pick('batch_code') ?? fallback;
    case 'bank_accounts': return pick('account_name', 'account_number') ?? fallback;
    case 'shifts': return pick('staff_name') ?? fallback;
    case 'attendance': return pick('user_name') ?? fallback;
    case 'order_items': case 'inventory_transaction_items': return `${pick('product_name', 'product_id') ?? fallback} x${row.quantity ?? '?'}`;
    case 'product_option_choices': return pick('label') ?? fallback;
    default: return pick('name') ?? fallback;
  }
}

/**
 * @param incoming First value.
 * @param other Second value.
 * @returns True when the two values show the same on screen (an empty value equals null; 1 equals true).
 */
function sameShown(incoming: unknown, other: unknown): boolean {
  const normal = (value: unknown) => (value === null || value === undefined ? '' : typeof value === 'boolean' ? String(Number(value)) : String(value));
  return normal(incoming) === normal(other);
}

/**
 * Lists the visible fields on which two rows differ.
 *
 * @param table Table of the rows.
 * @param server The server's row.
 * @param device The device's row.
 * @returns The differences, in the order of the labels of the table.
 */
function diffFields(table: string, server: SyncRow, device: SyncRow): FieldDifference[] {
  const columns = [...new Set([...Object.keys(server), ...Object.keys(device)])].filter(column => isVisibleColumn(table, column));
  return columns
    .filter(column => !sameShown(server[column], device[column]))
    .map(column => ({ column, label: labelOf(table, column), serverValue: formatValue(column, server[column]), deviceValue: formatValue(column, device[column]) }));
}

/**
 * Compares the child rows of the two versions of a record.
 *
 * @param device The device's version.
 * @param server The server's version.
 * @returns One entry per kind of child row that differs.
 */
function diffChildren(device: PushGroup, server: PushGroup): ChildDifference[] {
  const result: ChildDifference[] = [];
  for (const [table, deviceRows] of Object.entries(device.children ?? {})) {
    const serverRows = server.children?.[table] ?? [];
    const key = TABLE_PRIMARY_KEY[table] ?? 'id';
    const serverById = new Map(serverRows.map(row => [String(row[key]), row]));
    const deviceById = new Map(deviceRows.map(row => [String(row[key]), row]));
    const added = deviceRows.filter(row => !serverById.has(String(row[key]))).map(row => describeRow(table, row, String(row[key])));
    const removed = serverRows.filter(row => !deviceById.has(String(row[key]))).map(row => describeRow(table, row, String(row[key])));
    const changed: string[] = [];
    for (const row of deviceRows) {
      const match = serverById.get(String(row[key]));
      if (!match) continue;
      const fields = diffFields(table, match, row);
      if (fields.length > 0) {
        changed.push(`${describeRow(table, row, String(row[key]))}: ${fields.map(field => `${field.label} ${field.serverValue} → ${field.deviceValue}`).join(', ')}`);
      }
    }
    if (added.length > 0 || removed.length > 0 || changed.length > 0) {
      result.push({ label: CHILD_LABELS[table] ?? humanize(table), serverCount: serverRows.length, deviceCount: deviceRows.length, added, removed, changed });
    }
  }
  return result;
}

/**
 * Prepares a conflict for the screen where a manager chooses between the two versions.
 *
 * @param conflict The conflict with both versions.
 * @returns The record's name, the fields that differ (in words, passwords hidden) and the differences of child rows.
 */
export function compareConflict(conflict: ConflictDetail): ConflictComparison {
  const tableLabel = TABLE_LABELS[conflict.table] ?? humanize(conflict.table);
  const deviceRow = conflict.devicePayload.row;
  const server = conflict.serverPayload;
  const rowLabel = describeRow(conflict.table, server?.row ?? deviceRow, conflict.rowId);
  if (!server) return { tableLabel, rowLabel, serverRemoved: true, fields: [], children: [] };
  return {
    tableLabel,
    rowLabel,
    serverRemoved: false,
    fields: diffFields(conflict.table, server.row, deviceRow),
    children: diffChildren(conflict.devicePayload, server),
  };
}

/** Tables with a label table, for the test that checks every column is labelled or hidden. */
export const LABELLED_TABLES = Object.keys(TABLE_LABELS);

/**
 * @param table Table name.
 * @param column Column name.
 * @returns True when the column has a label or is hidden.
 */
export function isColumnCovered(table: string, column: string): boolean {
  return HIDDEN_COLUMNS.has(column) || column in (COLUMN_LABELS[table] ?? {});
}
