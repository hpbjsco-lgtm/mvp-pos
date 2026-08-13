/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SCHEMA CƠ SỞ DỮ LIỆU SQLITE CỦA SMARTPOS
 * ----------------------------------------
 * Toàn bộ dữ liệu của app được lưu trong 1 file SQLite duy nhất (smartpos.db).
 *
 * Nguyên tắc thiết kế:
 *  1. Mọi bảng nghiệp vụ đều có `store_id` -> hỗ trợ nhiều cửa hàng (multi-tenant) trên cùng thiết bị.
 *  2. Mọi bảng đều có `created_at`, `updated_at`, `deleted_at` (xoá mềm) và `rev` (số phiên bản dòng)
 *     -> phục vụ đồng bộ Cloud 2 chiều (tải lên / tải xuống) mà không mất dữ liệu.
 *  3. Dữ liệu dạng danh sách con (hàng trong đơn, hàng trong phiếu kho) được tách thành bảng riêng
 *     thay vì nhét JSON -> báo cáo, thống kê chạy trực tiếp bằng SQL.
 *  4. Sản phẩm bán (product) và nguyên vật liệu (ingredient) dùng chung bảng `products`, phân biệt
 *     bằng cột `kind` -> kho F&B và kho bán lẻ dùng một bộ code chung.
 *  5. Giỏ hàng đang mở của từng bàn được lưu xuống DB (`carts`, `cart_items`) -> tắt app mở lại
 *     không mất order đang gọi (lỗi "không lưu được" của bản cũ).
 */

export const SCHEMA_VERSION = 2;

/** Các câu lệnh DDL, chạy tuần tự khi khởi tạo / nâng cấp DB. */
export const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `PRAGMA foreign_keys = ON;`,

      /* ------------------------------------------------------------------ */
      /* Bảng hệ thống                                                       */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS meta (
        key         TEXT PRIMARY KEY,
        value       TEXT,
        updated_at  TEXT NOT NULL DEFAULT ''
      );`,

      /* ------------------------------------------------------------------ */
      /* Cửa hàng & người dùng                                               */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS stores (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        address         TEXT NOT NULL DEFAULT '',
        phone           TEXT NOT NULL DEFAULT '',
        store_type      TEXT NOT NULL DEFAULT 'fnb',    -- fnb | retail
        status          TEXT NOT NULL DEFAULT 'active', -- pending | active | rejected
        tax_code        TEXT NOT NULL DEFAULT '',
        currency        TEXT NOT NULL DEFAULT 'VND',
        receipt_footer  TEXT NOT NULL DEFAULT '',
        logo_url        TEXT NOT NULL DEFAULT '',
        order_seq       INTEGER NOT NULL DEFAULT 0,     -- bộ đếm số hoá đơn HD00001...
        import_seq      INTEGER NOT NULL DEFAULT 0,     -- bộ đếm phiếu nhập kho PNK0001
        export_seq      INTEGER NOT NULL DEFAULT 0,     -- bộ đếm phiếu xuất kho PXK0001
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT,
        rev             INTEGER NOT NULL DEFAULT 1
      );`,

      `CREATE TABLE IF NOT EXISTS users (
        uid             TEXT PRIMARY KEY,
        email           TEXT NOT NULL,
        password_hash   TEXT NOT NULL DEFAULT '',
        password_salt   TEXT NOT NULL DEFAULT '',
        pin_code        TEXT NOT NULL DEFAULT '',
        store_id        TEXT,
        role            TEXT NOT NULL DEFAULT 'staff',  -- sysadmin | owner | manager | staff
        name            TEXT NOT NULL DEFAULT '',
        phone           TEXT NOT NULL DEFAULT '',
        hourly_rate     REAL NOT NULL DEFAULT 25000,
        is_active       INTEGER NOT NULL DEFAULT 1,
        last_login_at   TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT,
        rev             INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
      `CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);`,

      /* ------------------------------------------------------------------ */
      /* Sơ đồ bàn (F&B)                                                     */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS zones (
        id          TEXT PRIMARY KEY,
        store_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT,
        rev         INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_zones_store ON zones(store_id);`,

      `CREATE TABLE IF NOT EXISTS dining_tables (
        id          TEXT PRIMARY KEY,
        store_id    TEXT NOT NULL,
        zone_id     TEXT,
        name        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'empty',  -- empty | serving
        capacity    INTEGER NOT NULL DEFAULT 4,
        x           REAL NOT NULL DEFAULT 10,
        y           REAL NOT NULL DEFAULT 10,
        width       REAL NOT NULL DEFAULT 95,
        height      REAL NOT NULL DEFAULT 95,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT,
        rev         INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tables_store ON dining_tables(store_id);`,

      /* ------------------------------------------------------------------ */
      /* Hàng hoá / Thực đơn / Nguyên vật liệu                               */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS products (
        id            TEXT PRIMARY KEY,
        store_id      TEXT NOT NULL,
        kind          TEXT NOT NULL DEFAULT 'product', -- product (bán) | ingredient (nguyên liệu)
        sku           TEXT NOT NULL DEFAULT '',
        name          TEXT NOT NULL,
        price         REAL NOT NULL DEFAULT 0,
        cost          REAL NOT NULL DEFAULT 0,
        unit          TEXT NOT NULL DEFAULT '',
        category      TEXT NOT NULL DEFAULT 'Khác',
        is_available  INTEGER NOT NULL DEFAULT 1,
        track_stock   INTEGER NOT NULL DEFAULT 1,
        min_stock     REAL NOT NULL DEFAULT 0,
        image_url     TEXT NOT NULL DEFAULT '',
        note          TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        deleted_at    TEXT,
        rev           INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_products_store_kind ON products(store_id, kind);`,
      `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(store_id, sku);`,

      /* ------------------------------------------------------------------ */
      /* Nhà cung cấp & Khách hàng                                           */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS suppliers (
        id          TEXT PRIMARY KEY,
        store_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        phone       TEXT NOT NULL DEFAULT '',
        email       TEXT NOT NULL DEFAULT '',
        address     TEXT NOT NULL DEFAULT '',
        tax_code    TEXT NOT NULL DEFAULT '',
        note        TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT,
        rev         INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_suppliers_store ON suppliers(store_id);`,

      `CREATE TABLE IF NOT EXISTS customers (
        id           TEXT PRIMARY KEY,
        store_id     TEXT NOT NULL,
        name         TEXT NOT NULL,
        phone        TEXT NOT NULL DEFAULT '',
        email        TEXT NOT NULL DEFAULT '',
        address      TEXT NOT NULL DEFAULT '',
        birthday     TEXT NOT NULL DEFAULT '',
        points       REAL NOT NULL DEFAULT 0,
        total_spent  REAL NOT NULL DEFAULT 0,
        visit_count  INTEGER NOT NULL DEFAULT 0,
        note         TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        deleted_at   TEXT,
        rev          INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);`,
      `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(store_id, phone);`,

      /* ------------------------------------------------------------------ */
      /* Kho: lô hàng + phiếu nhập/xuất                                      */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS inventory_batches (
        id                TEXT PRIMARY KEY,
        store_id          TEXT NOT NULL,
        product_id        TEXT NOT NULL,
        product_kind      TEXT NOT NULL DEFAULT 'product',
        batch_code        TEXT NOT NULL DEFAULT '',
        expiry_date       TEXT NOT NULL DEFAULT '',
        manufacture_date  TEXT NOT NULL DEFAULT '',
        import_price      REAL NOT NULL DEFAULT 0,
        quantity          REAL NOT NULL DEFAULT 0,
        original_quantity REAL NOT NULL DEFAULT 0,
        transaction_id    TEXT,
        supplier_id       TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        deleted_at        TEXT,
        rev               INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_batches_store_kind ON inventory_batches(store_id, product_kind);`,
      `CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);`,
      `CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(store_id, expiry_date);`,

      `CREATE TABLE IF NOT EXISTS inventory_transactions (
        id                  TEXT PRIMARY KEY,
        store_id            TEXT NOT NULL,
        transaction_number  TEXT NOT NULL DEFAULT '',
        type                TEXT NOT NULL DEFAULT 'import', -- import | export | adjustment
        kind                TEXT NOT NULL DEFAULT 'product',
        supplier_id         TEXT,
        supplier_name       TEXT NOT NULL DEFAULT '',
        total_amount        REAL NOT NULL DEFAULT 0,
        staff_id            TEXT NOT NULL DEFAULT '',
        staff_name          TEXT NOT NULL DEFAULT '',
        note                TEXT NOT NULL DEFAULT '',
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL,
        deleted_at          TEXT,
        rev                 INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_invtx_store ON inventory_transactions(store_id, created_at);`,

      `CREATE TABLE IF NOT EXISTS inventory_transaction_items (
        id              TEXT PRIMARY KEY,
        store_id        TEXT NOT NULL,
        transaction_id  TEXT NOT NULL,
        product_id      TEXT NOT NULL DEFAULT '',
        product_name    TEXT NOT NULL DEFAULT '',
        batch_id        TEXT,
        batch_code      TEXT NOT NULL DEFAULT '',
        quantity        REAL NOT NULL DEFAULT 0,
        price           REAL NOT NULL DEFAULT 0,
        line_no         INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_invtxitems_tx ON inventory_transaction_items(transaction_id);`,

      /* ------------------------------------------------------------------ */
      /* Bán hàng: đơn hàng + chi tiết đơn                                   */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS orders (
        id               TEXT PRIMARY KEY,
        store_id         TEXT NOT NULL,
        order_number     TEXT NOT NULL DEFAULT '',
        store_type       TEXT NOT NULL DEFAULT 'fnb',
        order_type       TEXT NOT NULL DEFAULT 'takeaway',  -- dine-in | takeaway
        status           TEXT NOT NULL DEFAULT 'completed', -- completed | void
        table_id         TEXT,
        table_number     TEXT NOT NULL DEFAULT '',
        customer_id      TEXT,
        customer_name    TEXT NOT NULL DEFAULT '',
        staff_id         TEXT NOT NULL DEFAULT '',
        staff_name       TEXT NOT NULL DEFAULT '',
        subtotal         REAL NOT NULL DEFAULT 0,
        discount_amount  REAL NOT NULL DEFAULT 0,
        tax_amount       REAL NOT NULL DEFAULT 0,
        total_amount     REAL NOT NULL DEFAULT 0,
        total_cost       REAL NOT NULL DEFAULT 0,
        payment_method   TEXT NOT NULL DEFAULT 'cash',      -- cash | card | qr
        paid_amount      REAL NOT NULL DEFAULT 0,
        change_amount    REAL NOT NULL DEFAULT 0,
        points_earned    REAL NOT NULL DEFAULT 0,
        points_used      REAL NOT NULL DEFAULT 0,
        note             TEXT NOT NULL DEFAULT '',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        deleted_at       TEXT,
        rev              INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_orders_store_date ON orders(store_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);`,

      `CREATE TABLE IF NOT EXISTS order_items (
        id            TEXT PRIMARY KEY,
        store_id      TEXT NOT NULL,
        order_id      TEXT NOT NULL,
        product_id    TEXT NOT NULL DEFAULT '',
        product_name  TEXT NOT NULL DEFAULT '',
        quantity      REAL NOT NULL DEFAULT 0,
        price         REAL NOT NULL DEFAULT 0,
        cost          REAL NOT NULL DEFAULT 0,
        batch_id      TEXT,
        batch_code    TEXT NOT NULL DEFAULT '',
        note          TEXT NOT NULL DEFAULT '',
        line_no       INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_orderitems_order ON order_items(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_orderitems_product ON order_items(store_id, product_id);`,

      /* ------------------------------------------------------------------ */
      /* Bếp (KDS)                                                           */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS kitchen_items (
        id            TEXT PRIMARY KEY,
        store_id      TEXT NOT NULL,
        order_id      TEXT NOT NULL DEFAULT '',
        product_id    TEXT NOT NULL DEFAULT '',
        product_name  TEXT NOT NULL DEFAULT '',
        quantity      REAL NOT NULL DEFAULT 1,
        table_id      TEXT,
        table_number  TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'pending', -- pending | preparing | completed | served
        note          TEXT NOT NULL DEFAULT '',
        served_at     TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        deleted_at    TEXT,
        rev           INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_kitchen_store_status ON kitchen_items(store_id, status);`,

      /* ------------------------------------------------------------------ */
      /* Giỏ hàng đang mở (theo bàn / quầy bán lẻ) - lưu bền vững             */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS carts (
        id          TEXT PRIMARY KEY,             -- storeId::cartKey
        store_id    TEXT NOT NULL,
        cart_key    TEXT NOT NULL,                -- id bàn (T1) hoặc 'retail'
        customer_id TEXT,
        note        TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        rev         INTEGER NOT NULL DEFAULT 1
      );`,

      `CREATE TABLE IF NOT EXISTS cart_items (
        id          TEXT PRIMARY KEY,             -- storeId::cartKey::productId
        cart_id     TEXT NOT NULL,
        store_id    TEXT NOT NULL,
        cart_key    TEXT NOT NULL,
        product_id  TEXT NOT NULL,
        quantity    REAL NOT NULL DEFAULT 1,
        note        TEXT NOT NULL DEFAULT '',
        line_no     INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cartitems_cart ON cart_items(store_id, cart_key);`,

      /* ------------------------------------------------------------------ */
      /* Chấm công & Nhật ký thao tác                                         */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS attendance (
        id            TEXT PRIMARY KEY,
        store_id      TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        user_name     TEXT NOT NULL DEFAULT '',
        date          TEXT NOT NULL,                -- YYYY-MM-DD
        check_in      TEXT NOT NULL,
        check_out     TEXT,
        hours_worked  REAL NOT NULL DEFAULT 0,
        hourly_rate   REAL NOT NULL DEFAULT 0,
        daily_wage    REAL NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'working', -- working | completed
        note          TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        deleted_at    TEXT,
        rev           INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_attendance_store_date ON attendance(store_id, date);`,

      `CREATE TABLE IF NOT EXISTS activity_logs (
        id           TEXT PRIMARY KEY,
        store_id     TEXT NOT NULL DEFAULT '',
        user_id      TEXT NOT NULL DEFAULT '',
        user_name    TEXT NOT NULL DEFAULT '',
        screen_name  TEXT NOT NULL DEFAULT '',
        action       TEXT NOT NULL DEFAULT '',
        data         TEXT NOT NULL DEFAULT '{}',    -- JSON
        created_at   TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_logs_store_date ON activity_logs(store_id, created_at);`,

      /* ------------------------------------------------------------------ */
      /* Hạ tầng đồng bộ Cloud                                               */
      /* ------------------------------------------------------------------ */
      `CREATE TABLE IF NOT EXISTS sync_outbox (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id    TEXT NOT NULL DEFAULT '',
        table_name  TEXT NOT NULL,
        row_id      TEXT NOT NULL,
        op          TEXT NOT NULL,                 -- upsert | delete
        payload     TEXT NOT NULL DEFAULT '{}',    -- JSON dòng dữ liệu
        created_at  TEXT NOT NULL,
        pushed_at   TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox(store_id, pushed_at);`,

      `CREATE TABLE IF NOT EXISTS sync_state (
        store_id          TEXT PRIMARY KEY,
        endpoint          TEXT NOT NULL DEFAULT '',
        token             TEXT NOT NULL DEFAULT '',
        device_id         TEXT NOT NULL DEFAULT '',
        auto_sync         INTEGER NOT NULL DEFAULT 0,
        last_push_at      TEXT,
        last_pull_at      TEXT,
        remote_version    INTEGER NOT NULL DEFAULT 0,
        last_error        TEXT NOT NULL DEFAULT '',
        updated_at        TEXT NOT NULL DEFAULT ''
      );`,
    ],
  },
  {
    version: 2,
    statements: [
      /* Đặt bàn trước (F&B): thông tin khách đặt lưu trực tiếp trên dining_tables,
         không phụ thuộc trạng thái phục vụ (empty/serving) hiện tại của bàn. */
      `ALTER TABLE dining_tables ADD COLUMN reservation_name TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE dining_tables ADD COLUMN reservation_phone TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE dining_tables ADD COLUMN reservation_time TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE dining_tables ADD COLUMN reservation_note TEXT NOT NULL DEFAULT '';`,
    ],
  },
];

/** Danh sách bảng nghiệp vụ dùng cho export / import snapshot Cloud. */
export const SYNCED_TABLES = [
  'stores',
  'users',
  'zones',
  'dining_tables',
  'products',
  'suppliers',
  'customers',
  'inventory_batches',
  'inventory_transactions',
  'inventory_transaction_items',
  'orders',
  'order_items',
  'kitchen_items',
  'carts',
  'cart_items',
  'attendance',
  'activity_logs',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Khoá chính của từng bảng (dùng khi merge dữ liệu tải về từ Cloud). */
export const TABLE_PRIMARY_KEY: Record<string, string> = {
  stores: 'id',
  users: 'uid',
  zones: 'id',
  dining_tables: 'id',
  products: 'id',
  suppliers: 'id',
  customers: 'id',
  inventory_batches: 'id',
  inventory_transactions: 'id',
  inventory_transaction_items: 'id',
  orders: 'id',
  order_items: 'id',
  kitchen_items: 'id',
  carts: 'id',
  cart_items: 'id',
  attendance: 'id',
  activity_logs: 'id',
};

/** Bảng có cột `rev` / `updated_at` để so sánh khi merge (last-write-wins). */
export const TABLES_WITH_REV: Record<string, boolean> = {
  stores: true,
  users: true,
  zones: true,
  dining_tables: true,
  products: true,
  suppliers: true,
  customers: true,
  inventory_batches: true,
  inventory_transactions: true,
  orders: true,
  kitchen_items: true,
  carts: true,
  attendance: true,
};
