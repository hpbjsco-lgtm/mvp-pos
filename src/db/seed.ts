/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DỮ LIỆU MẪU KHI KHỞI TẠO CỬA HÀNG MỚI
 * -------------------------------------
 * Khác với bản cũ, phần seed này tạo luôn cả LÔ HÀNG TỒN KHO (inventory_batches)
 * cho cửa hàng bán lẻ, vì màn hình POS bán lẻ chặn bán khi sản phẩm không có lô
 * tồn kho -> trước đây cửa hàng mới tạo không bán được hàng nào.
 */

import { batch as runBatch, buildUpsert, newId, nowIso, queryOne } from './index';
import type { SqlStatement } from './driver';
import { hashPassword, randomSalt } from './password';

const FNB_PRODUCTS = [
  { id: 'P1', sku: '8930001001', name: 'Cà Phê Sữa Đá Sài Gòn', price: 29000, cost: 10000, category: 'Đồ uống' },
  { id: 'P2', sku: '8930001002', name: 'Trà Đào Cam Sả Hồng Đài', price: 35000, cost: 12000, category: 'Đồ uống' },
  { id: 'P3', sku: '8930001003', name: 'Phở Bò Thượng Hạng Kobe', price: 89000, cost: 35000, category: 'Món ăn' },
  { id: 'P4', sku: '8930001004', name: 'Bún Chả Hà Nội Gia Truyền', price: 45000, cost: 18000, category: 'Món ăn' },
  { id: 'P5', sku: '8930001005', name: 'Bánh Mì Garlic Bơ Tỏi', price: 25000, cost: 8000, category: 'Ăn nhẹ' },
  { id: 'P6', sku: '8930001006', name: 'Nước Ngọt Coca Cola Lon', price: 15000, cost: 6000, category: 'Đồ uống' },
];

const FNB_INGREDIENTS = [
  { id: 'I1', sku: 'RAW-001', name: 'Hạt Cà Phê Robusta Măng Đen', cost: 120000, unit: 'kg', category: 'Đồ uống' },
  { id: 'I2', sku: 'RAW-002', name: 'Sữa Đặc Có Đường Ông Thọ', cost: 22000, unit: 'hộp', category: 'Đồ uống' },
  { id: 'I3', sku: 'RAW-003', name: 'Trà Đen Phúc Long Cao Cấp', cost: 140000, unit: 'kg', category: 'Đồ uống' },
  { id: 'I4', sku: 'RAW-004', name: 'Thịt Bò Thượng Hạng Mỹ', cost: 320000, unit: 'kg', category: 'Món ăn' },
  { id: 'I5', sku: 'RAW-005', name: 'Bánh Phở Tươi Trong Ngày', cost: 15000, unit: 'kg', category: 'Món ăn' },
  { id: 'I6', sku: 'RAW-006', name: 'Bơ Lạt Anchor Nhập Khẩu', cost: 240000, unit: 'kg', category: 'Món ăn' },
  { id: 'I7', sku: 'RAW-007', name: 'Cam Sành Hàm Yên Hữu Cơ', cost: 30000, unit: 'kg', category: 'Khác' },
  { id: 'I8', sku: 'RAW-008', name: 'Đá Viên Tinh Khiết (Bao 10kg)', cost: 12000, unit: 'bao', category: 'Khác' },
];

const RETAIL_PRODUCTS = [
  { id: 'P1', sku: '8930001001', name: 'Gạo ST25 Thượng Hạng (5kg)', price: 185000, cost: 140000, category: 'Nhu yếu phẩm' },
  { id: 'P2', sku: '8930001002', name: 'Nước Mắm Nam Ngư (750ml)', price: 42000, cost: 30000, category: 'Gia vị' },
  { id: 'P3', sku: '8930001003', name: 'Mì Hảo Hảo Tôm Chua Cay', price: 4500, cost: 3200, category: 'Mì ăn liền' },
  { id: 'P4', sku: '8930001004', name: 'Dầu Ăn Simply (1L)', price: 58000, cost: 45000, category: 'Gia vị' },
  { id: 'P5', sku: '8930001005', name: 'Sữa Tươi Vinamilk Ít Đường', price: 8500, cost: 6500, category: 'Đồ uống' },
  { id: 'P6', sku: '8930001006', name: 'Khăn Giấy Bless You', price: 22000, cost: 15000, category: 'Gia dụng' },
];

const ZONES = [
  { id: 'z1', name: 'Khu chung (Tầng 1)' },
  { id: 'z2', name: 'Tầng 2' },
  { id: 'z3', name: 'Tầng 3' },
];

const TABLES = [
  { id: 'T1', name: 'Bàn 01', capacity: 4, zoneId: 'z1', x: 10, y: 15, width: 95, height: 95 },
  { id: 'T2', name: 'Bàn 02', capacity: 2, zoneId: 'z1', x: 40, y: 15, width: 95, height: 95 },
  { id: 'T3', name: 'Bàn 03', capacity: 6, zoneId: 'z1', x: 70, y: 15, width: 110, height: 95 },
  { id: 'T4', name: 'Bàn 04', capacity: 4, zoneId: 'z2', x: 25, y: 30, width: 95, height: 95 },
  { id: 'T5', name: 'Bàn 05 (VIP)', capacity: 8, zoneId: 'z3', x: 45, y: 35, width: 130, height: 110 },
];

const CUSTOMERS = [
  { id: 'C1', name: 'Nguyễn Văn Anh', phone: '0901234567', points: 150 },
  { id: 'C2', name: 'Trần Thị Bình', phone: '0987654321', points: 45 },
  { id: 'C3', name: 'Lê Hoàng Minh', phone: '0912345678', points: 310 },
  { id: 'C4', name: 'Phạm Hồng Nhung', phone: '0933445566', points: 12 },
];

const EMPLOYEES = [
  { name: 'Trần Thị Quản Lý', email: 'quanly', role: 'manager' as const, hourlyRate: 35000 },
  { name: 'Nguyễn Văn Nhân Viên', email: 'nhanvien1', role: 'staff' as const, hourlyRate: 25000 },
  { name: 'Lê Thị Thu Ngân', email: 'nhanvien2', role: 'staff' as const, hourlyRate: 25000 },
];
const EMPLOYEE_DEFAULT_PASSWORD = '123456';

const SUPPLIERS = [
  {
    id: 'S1',
    name: 'Công ty Cổ phần Sữa Việt Nam (Vinamilk)',
    phone: '0281234567',
    email: 'sales@vinamilk.com.vn',
    address: '10 Tân Trào, Tân Phú, Quận 7, TP. HCM',
  },
  {
    id: 'S2',
    name: 'Nông trại Rau sạch Đà Lạt GAP',
    phone: '02633888999',
    email: 'info@dalatgap.com',
    address: '152 Tự Phước, Phường 11, Đà Lạt',
  },
];

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Đã có sản phẩm nào chưa? Dùng để không seed lại lần thứ hai. */
export async function isStoreSeeded(storeId: string): Promise<boolean> {
  const row = await queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM products WHERE store_id = ?', [
    storeId,
  ]);
  return Number(row?.c ?? 0) > 0;
}

/**
 * Tạo dữ liệu khởi đầu cho một cửa hàng: thực đơn / hàng hoá, kho, khu vực,
 * bàn ăn, nhà cung cấp và khách vãng lai mặc định.
 */
export async function seedStore(storeId: string, storeType: 'fnb' | 'retail'): Promise<boolean> {
  try {
    if (await isStoreSeeded(storeId)) {
      console.log(`[SEED] Cửa hàng ${storeId} đã có dữ liệu, bỏ qua.`);
      return true;
    }

    const ts = nowIso();
    const stmts: SqlStatement[] = [];
    const push = (table: string, row: Record<string, any>) => {
      stmts.push(...buildUpsert(table, row));
    };

    /* Khách vãng lai mặc định (mọi loại cửa hàng đều cần) */
    push('customers', {
      id: 'khach-vang-lai',
      store_id: storeId,
      name: 'Khách vãng lai mặc định',
      phone: '',
      email: '',
      points: 0,
      created_at: ts,
      updated_at: ts,
    });

    /* Khách hàng thành viên mẫu */
    for (const c of CUSTOMERS) {
      push('customers', {
        id: `${storeId}-${c.id}`,
        store_id: storeId,
        name: c.name,
        phone: c.phone,
        email: '',
        points: c.points,
        created_at: ts,
        updated_at: ts,
      });
    }

    /* Nhân viên mẫu (mật khẩu mặc định: 123456) */
    for (const e of EMPLOYEES) {
      const salt = randomSalt();
      push('users', {
        uid: newId('user'),
        email: `${e.email}@${storeId.toLowerCase()}.local`,
        password_hash: await hashPassword(EMPLOYEE_DEFAULT_PASSWORD, salt),
        password_salt: salt,
        store_id: storeId,
        role: e.role,
        name: e.name,
        hourly_rate: e.hourlyRate,
        is_active: 1,
        created_at: ts,
        updated_at: ts,
      });
    }

    for (const s of SUPPLIERS) {
      push('suppliers', { ...s, store_id: storeId, created_at: ts, updated_at: ts });
    }

    const products = storeType === 'fnb' ? FNB_PRODUCTS : RETAIL_PRODUCTS;
    for (const p of products) {
      push('products', {
        id: p.id,
        store_id: storeId,
        kind: 'product',
        sku: p.sku,
        name: p.name,
        price: p.price,
        cost: p.cost,
        category: p.category,
        is_available: 1,
        track_stock: storeType === 'retail' ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      });
    }

    if (storeType === 'fnb') {
      for (const z of ZONES) {
        push('zones', { ...z, store_id: storeId, sort_order: 0, created_at: ts, updated_at: ts });
      }
      for (const t of TABLES) {
        push('dining_tables', {
          id: t.id,
          store_id: storeId,
          zone_id: t.zoneId,
          name: t.name,
          status: 'empty',
          capacity: t.capacity,
          x: t.x,
          y: t.y,
          width: t.width,
          height: t.height,
          created_at: ts,
          updated_at: ts,
        });
      }

      /* Nguyên vật liệu + lô tồn kho ban đầu */
      FNB_INGREDIENTS.forEach((ing, idx) => {
        push('products', {
          id: ing.id,
          store_id: storeId,
          kind: 'ingredient',
          sku: ing.sku,
          name: ing.name,
          price: 0,
          cost: ing.cost,
          unit: ing.unit,
          category: ing.category,
          is_available: 1,
          track_stock: 1,
          created_at: ts,
          updated_at: ts,
        });
        push('inventory_batches', {
          id: `B-${ing.id}-01`,
          store_id: storeId,
          product_id: ing.id,
          product_kind: 'ingredient',
          batch_code: `LO-${ing.sku}`,
          expiry_date: futureDate(120 + idx * 15),
          manufacture_date: futureDate(-15),
          import_price: ing.cost,
          quantity: 20,
          original_quantity: 20,
          supplier_id: 'S1',
          created_at: ts,
          updated_at: ts,
        });
      });
    } else {
      /* Bán lẻ: mỗi hàng hoá có 1 lô tồn kho để bán được ngay */
      RETAIL_PRODUCTS.forEach((p, idx) => {
        push('inventory_batches', {
          id: `B-${p.id}-01`,
          store_id: storeId,
          product_id: p.id,
          product_kind: 'product',
          batch_code: `LO-${p.sku}`,
          expiry_date: futureDate(180 + idx * 20),
          manufacture_date: futureDate(-30),
          import_price: p.cost,
          quantity: 50,
          original_quantity: 50,
          supplier_id: 'S1',
          created_at: ts,
          updated_at: ts,
        });
      });
    }

    await runBatch(stmts);
    console.log(`[SEED] Đã tạo dữ liệu mẫu cho cửa hàng ${storeId} (${storeType}).`);
    return true;
  } catch (err) {
    console.error('[SEED] Lỗi tạo dữ liệu mẫu:', err);
    return false;
  }
}
