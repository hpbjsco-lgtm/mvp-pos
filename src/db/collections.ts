/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CẦU NỐI GIỮA OBJECT TRONG UI (camelCase) VÀ DÒNG DỮ LIỆU SQLITE (snake_case)
 * --------------------------------------------------------------------------
 * Mỗi "collection" tương ứng với 1 mảng state mà các component đang dùng
 * (simProducts, simOrders, ...). Nhờ lớp này, component chỉ cần setState như
 * bình thường -> dữ liệu tự động được ghi xuống SQLite (xem DataProvider.tsx).
 */

import { buildHardDelete, buildSoftDelete, buildUpsert, nowIso, query, type Row } from './index';
import type { SqlStatement } from './driver';

export type CollectionKey =
  | 'products'
  | 'ingredients'
  | 'zones'
  | 'tables'
  | 'kitchenItems'
  | 'orders'
  | 'batches'
  | 'ingredientBatches'
  | 'transactions'
  | 'ingredientTransactions'
  | 'customers'
  | 'suppliers'
  | 'employees'
  | 'attendance'
  | 'shifts';

interface CollectionSpec {
  /** Bảng SQLite tương ứng. */
  table: string;
  /** Tên thuộc tính khoá chính trong object UI. */
  idField: 'id' | 'uid';
  /** Điều kiện WHERE khi nạp dữ liệu (ngoài store_id / deleted_at). */
  filter?: { sql: string; params: unknown[] };
  /** Sắp xếp khi nạp. */
  orderBy?: string;
  /** UI object -> dòng DB. */
  toRow: (item: any, storeId: string) => Row;
  /** Dòng DB -> UI object. */
  fromRow: (row: Row) => any;
  /** Bảng con (chi tiết đơn / chi tiết phiếu kho). */
  children?: {
    table: string;
    /** Sinh các dòng con từ object cha. */
    toRows: (item: any, storeId: string) => Row[];
    /** Nạp danh sách con cho object cha. */
    attach: (parents: any[], rowsByParent: Map<string, Row[]>) => void;
    /** Cột khoá ngoại trỏ về cha. */
    parentColumn: string;
  };
}

const bool = (v: any): number => (v ? 1 : 0);
const str = (v: any, dflt = ''): string => (v === undefined || v === null ? dflt : String(v));
const num = (v: any, dflt = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

/* ---------------------------------------------------------------------- */
/* Định nghĩa từng collection                                             */
/* ---------------------------------------------------------------------- */

function productSpec(kind: 'product' | 'ingredient'): CollectionSpec {
  return {
    table: 'products',
    idField: 'id',
    filter: { sql: 'kind = ?', params: [kind] },
    orderBy: 'created_at DESC',
    toRow: (p, storeId) => ({
      id: p.id,
      store_id: storeId,
      kind,
      sku: str(p.sku),
      name: str(p.name),
      price: num(p.price),
      cost: num(p.cost),
      unit: str(p.unit),
      category: str(p.category, 'Khác'),
      is_available: bool(p.isAvailable ?? true),
      track_stock: bool(p.trackStock ?? true),
      min_stock: num(p.minStock),
      image_url: str(p.imageUrl),
      note: str(p.note),
      created_at: str(p.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      price: num(r.price),
      cost: num(r.cost),
      unit: r.unit,
      category: r.category,
      isAvailable: !!r.is_available,
      trackStock: !!r.track_stock,
      minStock: num(r.min_stock),
      imageUrl: r.image_url,
      note: r.note,
      createdAt: r.created_at,
    }),
  };
}

function batchSpec(kind: 'product' | 'ingredient'): CollectionSpec {
  return {
    table: 'inventory_batches',
    idField: 'id',
    filter: { sql: 'product_kind = ?', params: [kind] },
    orderBy: 'created_at DESC',
    toRow: (b, storeId) => ({
      id: b.id,
      store_id: storeId,
      product_id: str(b.productId),
      product_kind: kind,
      batch_code: str(b.batchCode),
      expiry_date: str(b.expiryDate),
      manufacture_date: str(b.manufactureDate),
      import_price: num(b.importPrice),
      quantity: num(b.quantity),
      original_quantity: num(b.originalQuantity ?? b.quantity),
      transaction_id: b.transactionId ?? null,
      supplier_id: b.supplierId ?? null,
      created_at: str(b.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      productId: r.product_id,
      batchCode: r.batch_code,
      expiryDate: r.expiry_date,
      manufactureDate: r.manufacture_date || undefined,
      importPrice: num(r.import_price),
      quantity: num(r.quantity),
      originalQuantity: num(r.original_quantity),
      transactionId: r.transaction_id || undefined,
      supplierId: r.supplier_id || undefined,
      createdAt: r.created_at,
    }),
  };
}

function transactionSpec(kind: 'product' | 'ingredient'): CollectionSpec {
  return {
    table: 'inventory_transactions',
    idField: 'id',
    filter: { sql: 'kind = ?', params: [kind] },
    orderBy: 'created_at DESC',
    toRow: (t, storeId) => ({
      id: t.id,
      store_id: storeId,
      transaction_number: str(t.transactionNumber),
      type: str(t.type, 'import'),
      kind,
      supplier_id: t.supplierId ?? null,
      supplier_name: str(t.supplierName),
      total_amount: num(t.totalAmount),
      staff_id: str(t.staffId),
      staff_name: str(t.staffName),
      note: str(t.note),
      created_at: str(t.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      transactionNumber: r.transaction_number,
      type: r.type,
      supplierId: r.supplier_id || undefined,
      supplierName: r.supplier_name || undefined,
      totalAmount: num(r.total_amount),
      staffId: r.staff_id,
      staffName: r.staff_name,
      note: r.note,
      createdAt: r.created_at,
      items: [] as any[],
    }),
    children: {
      table: 'inventory_transaction_items',
      parentColumn: 'transaction_id',
      toRows: (t, storeId) =>
        (t.items ?? []).map((it: any, idx: number) => ({
          id: `${t.id}::${idx}`,
          store_id: storeId,
          transaction_id: t.id,
          product_id: str(it.productId),
          product_name: str(it.productName ?? it.name),
          batch_id: it.batchId ?? null,
          batch_code: str(it.batchCode),
          quantity: num(it.quantity),
          price: num(it.price),
          line_no: idx,
          created_at: str(t.createdAt, nowIso()),
        })),
      attach: (parents, rowsByParent) => {
        for (const p of parents) {
          p.items = (rowsByParent.get(p.id) ?? []).map((r) => ({
            productId: r.product_id,
            productName: r.product_name,
            name: r.product_name,
            batchId: r.batch_id || undefined,
            batchCode: r.batch_code,
            quantity: num(r.quantity),
            price: num(r.price),
          }));
        }
      },
    },
  };
}

export const COLLECTIONS: Record<CollectionKey, CollectionSpec> = {
  products: productSpec('product'),
  ingredients: productSpec('ingredient'),
  batches: batchSpec('product'),
  ingredientBatches: batchSpec('ingredient'),
  transactions: transactionSpec('product'),
  ingredientTransactions: transactionSpec('ingredient'),

  zones: {
    table: 'zones',
    idField: 'id',
    orderBy: 'sort_order ASC, created_at ASC',
    toRow: (z, storeId) => ({
      id: z.id,
      store_id: storeId,
      name: str(z.name),
      sort_order: num(z.sortOrder),
      created_at: str(z.createdAt, nowIso()),
    }),
    fromRow: (r) => ({ id: r.id, name: r.name, sortOrder: num(r.sort_order), createdAt: r.created_at }),
  },

  tables: {
    table: 'dining_tables',
    idField: 'id',
    orderBy: 'name ASC',
    toRow: (t, storeId) => ({
      id: t.id,
      store_id: storeId,
      zone_id: t.zoneId ?? null,
      name: str(t.name),
      status: str(t.status, 'empty'),
      capacity: num(t.capacity, 4),
      x: num(t.x, 10),
      y: num(t.y, 10),
      width: num(t.width, 95),
      height: num(t.height, 95),
      reservation_name: str(t.reservationName),
      reservation_phone: str(t.reservationPhone),
      reservation_time: str(t.reservationTime),
      reservation_note: str(t.reservationNote),
      created_at: str(t.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      zoneId: r.zone_id || undefined,
      name: r.name,
      status: r.status,
      capacity: num(r.capacity, 4),
      x: num(r.x),
      y: num(r.y),
      width: num(r.width, 95),
      height: num(r.height, 95),
      reservationName: r.reservation_name || undefined,
      reservationPhone: r.reservation_phone || undefined,
      reservationTime: r.reservation_time || undefined,
      reservationNote: r.reservation_note || undefined,
      createdAt: r.created_at,
    }),
  },

  kitchenItems: {
    table: 'kitchen_items',
    idField: 'id',
    orderBy: 'created_at ASC',
    toRow: (k, storeId) => ({
      id: k.id,
      store_id: storeId,
      order_id: str(k.orderId),
      product_id: str(k.productId),
      product_name: str(k.productName),
      quantity: num(k.quantity, 1),
      table_id: k.tableId ?? null,
      table_number: str(k.tableNumber),
      status: str(k.status, 'pending'),
      note: str(k.note),
      size: str(k.size),
      sugar_level: str(k.sugarLevel),
      ice_level: str(k.iceLevel),
      served_at: k.status === 'served' ? str(k.servedAt, nowIso()) : (k.servedAt ?? null),
      created_at: str(k.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      orderId: r.order_id,
      productId: r.product_id,
      productName: r.product_name,
      quantity: num(r.quantity, 1),
      tableId: r.table_id || undefined,
      tableNumber: r.table_number,
      status: r.status,
      note: r.note,
      size: r.size || undefined,
      sugarLevel: r.sugar_level || undefined,
      iceLevel: r.ice_level || undefined,
      servedAt: r.served_at || undefined,
      createdAt: r.created_at,
    }),
  },

  orders: {
    table: 'orders',
    idField: 'id',
    orderBy: 'created_at DESC',
    toRow: (o, storeId) => {
      const items: any[] = o.items ?? [];
      const subtotal = num(o.subtotal, items.reduce((s, it) => s + num(it.price) * num(it.quantity), 0));
      return {
        id: o.id,
        store_id: storeId,
        order_number: str(o.orderNumber),
        store_type: str(o.storeType, o.tableId ? 'fnb' : 'retail'),
        order_type: str(o.orderType, o.tableId ? 'dine-in' : 'takeaway'),
        status: str(o.status, 'completed'),
        table_id: o.tableId ?? null,
        table_number: str(o.tableNumber),
        customer_id: o.customerId ?? null,
        customer_name: str(o.customerName),
        staff_id: str(o.staffId),
        staff_name: str(o.staffName),
        subtotal,
        discount_amount: num(o.discountAmount),
        tax_amount: num(o.taxAmount),
        total_amount: num(o.totalAmount, subtotal),
        total_cost: num(o.totalCost),
        payment_method: str(o.paymentMethod, 'cash'),
        paid_amount: num(o.paidAmount),
        change_amount: num(o.changeAmount),
        points_earned: num(o.customerPointsEarned ?? o.pointsEarned),
        points_used: num(o.pointsUsed),
        note: str(o.note),
        created_at: str(o.createdAt, nowIso()),
      };
    },
    fromRow: (r) => ({
      id: r.id,
      orderNumber: r.order_number,
      storeType: r.store_type,
      orderType: r.order_type,
      status: r.status,
      tableId: r.table_id || undefined,
      tableNumber: r.table_number,
      customerId: r.customer_id || undefined,
      customerName: r.customer_name,
      staffId: r.staff_id,
      staffName: r.staff_name,
      subtotal: num(r.subtotal),
      discountAmount: num(r.discount_amount),
      taxAmount: num(r.tax_amount),
      totalAmount: num(r.total_amount),
      totalCost: num(r.total_cost),
      paymentMethod: r.payment_method,
      paidAmount: num(r.paid_amount),
      changeAmount: num(r.change_amount),
      customerPointsEarned: num(r.points_earned),
      note: r.note,
      createdAt: r.created_at,
      items: [] as any[],
    }),
    children: {
      table: 'order_items',
      parentColumn: 'order_id',
      toRows: (o, storeId) =>
        (o.items ?? []).map((it: any, idx: number) => ({
          id: `${o.id}::${idx}`,
          store_id: storeId,
          order_id: o.id,
          product_id: str(it.productId),
          product_name: str(it.name ?? it.productName),
          quantity: num(it.quantity),
          price: num(it.price),
          cost: num(it.cost),
          batch_id: it.batchId ?? null,
          batch_code: str(it.batchCode),
          note: str(it.note),
          size: str(it.size),
          sugar_level: str(it.sugarLevel),
          ice_level: str(it.iceLevel),
          line_no: idx,
          created_at: str(o.createdAt, nowIso()),
        })),
      attach: (parents, rowsByParent) => {
        for (const p of parents) {
          p.items = (rowsByParent.get(p.id) ?? []).map((r) => ({
            productId: r.product_id,
            name: r.product_name,
            quantity: num(r.quantity),
            price: num(r.price),
            cost: num(r.cost),
            batchId: r.batch_id || undefined,
            batchCode: r.batch_code || undefined,
            note: r.note || undefined,
            size: r.size || undefined,
            sugarLevel: r.sugar_level || undefined,
            iceLevel: r.ice_level || undefined,
          }));
        }
      },
    },
  },

  customers: {
    table: 'customers',
    idField: 'id',
    orderBy: 'created_at DESC',
    toRow: (c, storeId) => ({
      id: c.id,
      store_id: storeId,
      name: str(c.name),
      phone: str(c.phone),
      email: str(c.email),
      address: str(c.address),
      birthday: str(c.birthday),
      points: num(c.points),
      total_spent: num(c.totalSpent),
      visit_count: num(c.visitCount),
      note: str(c.note),
      created_at: str(c.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      birthday: r.birthday,
      points: num(r.points),
      totalSpent: num(r.total_spent),
      visitCount: num(r.visit_count),
      note: r.note,
      createdAt: r.created_at,
    }),
  },

  suppliers: {
    table: 'suppliers',
    idField: 'id',
    orderBy: 'created_at DESC',
    toRow: (s, storeId) => ({
      id: s.id,
      store_id: storeId,
      name: str(s.name),
      phone: str(s.phone),
      email: str(s.email),
      address: str(s.address),
      tax_code: str(s.taxCode),
      note: str(s.note),
      created_at: str(s.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      taxCode: r.tax_code,
      note: r.note,
      createdAt: r.created_at,
    }),
  },

  employees: {
    table: 'users',
    idField: 'uid',
    orderBy: 'created_at ASC',
    toRow: (u, storeId) => ({
      uid: u.uid,
      email: str(u.email),
      store_id: storeId,
      role: str(u.role, 'staff'),
      name: str(u.name),
      phone: str(u.phone),
      hourly_rate: num(u.hourlyRate, 25000),
      is_active: bool(u.isActive ?? true),
      created_at: str(u.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      uid: r.uid,
      email: r.email,
      storeId: r.store_id,
      role: r.role,
      name: r.name,
      phone: r.phone,
      hourlyRate: num(r.hourly_rate, 25000),
      isActive: !!r.is_active,
      createdAt: r.created_at,
    }),
  },

  attendance: {
    table: 'attendance',
    idField: 'id',
    orderBy: 'check_in DESC',
    toRow: (a, storeId) => ({
      id: a.id,
      store_id: storeId,
      user_id: str(a.userId),
      user_name: str(a.userName),
      date: str(a.date),
      check_in: str(a.checkIn, nowIso()),
      check_out: a.checkOut ?? null,
      hours_worked: num(a.hoursWorked),
      hourly_rate: num(a.hourlyRate),
      daily_wage: num(a.dailyWage),
      status: str(a.status, 'working'),
      note: str(a.note),
      created_at: str(a.createdAt ?? a.checkIn, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      storeId: r.store_id,
      userId: r.user_id,
      userName: r.user_name,
      date: r.date,
      checkIn: r.check_in,
      checkOut: r.check_out,
      hoursWorked: num(r.hours_worked),
      hourlyRate: num(r.hourly_rate),
      dailyWage: num(r.daily_wage),
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
    }),
  },

  shifts: {
    table: 'shifts',
    idField: 'id',
    orderBy: 'opened_at DESC',
    toRow: (s, storeId) => ({
      id: s.id,
      store_id: storeId,
      staff_id: str(s.staffId),
      staff_name: str(s.staffName),
      opening_cash: num(s.openingCash),
      closing_cash_expected: s.closingCashExpected === undefined || s.closingCashExpected === null ? null : num(s.closingCashExpected),
      closing_cash_actual: s.closingCashActual === undefined || s.closingCashActual === null ? null : num(s.closingCashActual),
      status: str(s.status, 'open'),
      note: str(s.note),
      opened_at: str(s.openedAt, nowIso()),
      closed_at: s.closedAt ?? null,
      created_at: str(s.createdAt, nowIso()),
    }),
    fromRow: (r) => ({
      id: r.id,
      staffId: r.staff_id,
      staffName: r.staff_name,
      openingCash: num(r.opening_cash),
      closingCashExpected: r.closing_cash_expected === null || r.closing_cash_expected === undefined ? undefined : num(r.closing_cash_expected),
      closingCashActual: r.closing_cash_actual === null || r.closing_cash_actual === undefined ? undefined : num(r.closing_cash_actual),
      status: r.status,
      note: r.note,
      openedAt: r.opened_at,
      closedAt: r.closed_at || undefined,
      createdAt: r.created_at,
    }),
  },
};

export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[];

/* ---------------------------------------------------------------------- */
/* Nạp dữ liệu                                                            */
/* ---------------------------------------------------------------------- */

export async function loadCollection(key: CollectionKey, storeId: string): Promise<any[]> {
  const spec = COLLECTIONS[key];
  const where = ['store_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [storeId];
  if (spec.filter) {
    where.push(spec.filter.sql);
    params.push(...spec.filter.params);
  }
  const sql = `SELECT * FROM ${spec.table} WHERE ${where.join(' AND ')}${
    spec.orderBy ? ` ORDER BY ${spec.orderBy}` : ''
  }`;
  const rows = await query(sql, params);
  const items = rows.map((r) => spec.fromRow(r));

  if (spec.children && items.length) {
    const childRows = await query(
      `SELECT * FROM ${spec.children.table} WHERE store_id = ? ORDER BY line_no ASC`,
      [storeId],
    );
    const byParent = new Map<string, Row[]>();
    for (const row of childRows) {
      const pid = String(row[spec.children.parentColumn]);
      const list = byParent.get(pid);
      if (list) list.push(row);
      else byParent.set(pid, [row]);
    }
    spec.children.attach(items, byParent);
  }
  return items;
}

/** Nạp toàn bộ dữ liệu của 1 cửa hàng. */
export async function loadAllCollections(storeId: string): Promise<Record<CollectionKey, any[]>> {
  const result = {} as Record<CollectionKey, any[]>;
  for (const key of COLLECTION_KEYS) {
    result[key] = await loadCollection(key, storeId);
  }
  return result;
}

/* ---------------------------------------------------------------------- */
/* Ghi dữ liệu: so sánh mảng cũ / mới rồi sinh câu lệnh SQL               */
/* ---------------------------------------------------------------------- */

/**
 * So sánh state trước và sau, sinh các câu lệnh UPSERT / xoá mềm tương ứng.
 * Nhờ vậy mọi thao tác setState của UI đều được lưu bền vững, không cần
 * component tự gọi API lưu trữ.
 */
export function diffStatements(
  key: CollectionKey,
  prev: any[],
  next: any[],
  storeId: string,
): SqlStatement[] {
  const spec = COLLECTIONS[key];
  const idOf = (item: any) => String(item?.[spec.idField] ?? '');
  const statements: SqlStatement[] = [];

  const prevMap = new Map<string, any>();
  for (const item of prev ?? []) prevMap.set(idOf(item), item);
  const nextIds = new Set<string>();

  for (const item of next ?? []) {
    const id = idOf(item);
    if (!id) continue;
    nextIds.add(id);
    const before = prevMap.get(id);
    const row = spec.toRow(item, storeId);
    const childRows = spec.children ? spec.children.toRows(item, storeId) : [];

    if (before) {
      const beforeRow = spec.toRow(before, storeId);
      const beforeChildren = spec.children ? spec.children.toRows(before, storeId) : [];
      const sameRow = shallowEqual(beforeRow, row);
      const sameChildren = JSON.stringify(beforeChildren) === JSON.stringify(childRows);
      if (sameRow && sameChildren) continue;
    }

    statements.push(...buildUpsert(spec.table, row));
    if (spec.children) {
      statements.push(
        buildHardDelete(spec.children.table, `${spec.children.parentColumn} = ?`, [id]),
        ...childRows.map((cr) => buildUpsert(spec.children!.table, cr)[0]),
      );
    }
  }

  for (const [id] of prevMap) {
    if (!id || nextIds.has(id)) continue;
    statements.push(...buildSoftDelete(spec.table, id, storeId));
  }

  return statements;
}

function shallowEqual(a: Row, b: Row): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    // `updated_at` được sinh mới mỗi lần map nên bỏ qua khi so sánh.
    if (k === 'updated_at') continue;
    if (String(a[k] ?? '') !== String(b[k] ?? '')) return false;
  }
  return true;
}

/* ---------------------------------------------------------------------- */
/* Giỏ hàng đang mở (persist theo bàn)                                    */
/* ---------------------------------------------------------------------- */

export type CartMap = Record<string, Array<{
  productId: string;
  quantity: number;
  note: string;
  size?: string;
  sugarLevel?: string;
  iceLevel?: string;
}>>;

export async function loadCarts(storeId: string): Promise<CartMap> {
  const rows = await query(
    `SELECT cart_key, product_id, quantity, note, size, sugar_level, ice_level FROM cart_items
     WHERE store_id = ? ORDER BY cart_key ASC, line_no ASC`,
    [storeId],
  );
  const carts: CartMap = {};
  for (const r of rows) {
    const key = String(r.cart_key);
    if (!carts[key]) carts[key] = [];
    carts[key].push({
      productId: String(r.product_id),
      quantity: num(r.quantity, 1),
      note: str(r.note),
      size: r.size || undefined,
      sugarLevel: r.sugar_level || undefined,
      iceLevel: r.ice_level || undefined,
    });
  }
  return carts;
}

export function diffCartStatements(prev: CartMap, next: CartMap, storeId: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const ts = nowIso();

  for (const cartKey of keys) {
    const before = prev?.[cartKey] ?? [];
    const after = next?.[cartKey] ?? [];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;

    const cartId = `${storeId}::${cartKey}`;
    statements.push(buildHardDelete('cart_items', 'store_id = ? AND cart_key = ?', [storeId, cartKey]));

    if (after.length === 0) {
      statements.push(buildHardDelete('carts', 'id = ?', [cartId]));
      continue;
    }

    statements.push(
      ...buildUpsert('carts', {
        id: cartId,
        store_id: storeId,
        cart_key: cartKey,
        note: '',
        created_at: ts,
        updated_at: ts,
      }),
    );
    after.forEach((item, idx) => {
      statements.push(
        buildUpsert('cart_items', {
          id: `${cartId}::${idx}`,
          cart_id: cartId,
          store_id: storeId,
          cart_key: cartKey,
          product_id: str(item.productId),
          quantity: num(item.quantity, 1),
          note: str(item.note),
          size: str(item.size),
          sugar_level: str(item.sugarLevel),
          ice_level: str(item.iceLevel),
          line_no: idx,
          updated_at: ts,
        })[0],
      );
    });
  }

  return statements;
}
