/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LỚP TRỪU TƯỢNG HOÁ SQLITE
 * -------------------------
 * Cùng một bộ câu lệnh SQL chạy được trên cả 3 nền tảng:
 *
 *   - iOS / Android (app native đóng gói bằng Capacitor)
 *        -> @capacitor-community/sqlite (SQLite thật của hệ điều hành, file trên máy)
 *   - Trình duyệt (npm run dev / bản web)
 *        -> sql.js (SQLite biên dịch sang WebAssembly), dữ liệu được lưu bền vững
 *           xuống IndexedDB sau mỗi lần ghi (debounce 250ms).
 */

import { Capacitor } from '@capacitor/core';

export interface SqlStatement {
  sql: string;
  params?: unknown[];
}

export interface SqlDriver {
  readonly platform: 'native' | 'web';
  /** Chạy nhiều câu lệnh DDL / lệnh không tham số. */
  exec(sql: string): Promise<void>;
  /** Ghi 1 câu lệnh có tham số. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Truy vấn trả về danh sách dòng. */
  all<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Ghi nhiều câu lệnh trong 1 transaction (nguyên tử). */
  batch(statements: SqlStatement[]): Promise<void>;
  /** Ghi dữ liệu xuống bộ nhớ bền vững (chỉ có ý nghĩa trên web). */
  flush(): Promise<void>;
  /** Xuất toàn bộ file DB ra mảng byte (dùng để sao lưu). Trả null nếu nền tảng không hỗ trợ. */
  exportRawBytes(): Promise<Uint8Array | null>;
  /** Nạp lại DB từ mảng byte đã sao lưu. */
  importRawBytes(bytes: Uint8Array): Promise<boolean>;
  close(): Promise<void>;
}

export const DB_NAME = 'smartpos';

/* ====================================================================== */
/* WEB: sql.js + IndexedDB                                                */
/* ====================================================================== */

const IDB_NAME = 'smartpos-sqlite';
const IDB_STORE = 'files';
const IDB_KEY = 'smartpos.db';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result;
        resolve(val ? new Uint8Array(val as ArrayBuffer | Uint8Array) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(bytes: Uint8Array): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    // Sao chép sang ArrayBuffer thuần để tránh lỗi structured-clone với view của WASM memory.
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    tx.objectStore(IDB_STORE).put(copy, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

class WebSqlDriver implements SqlDriver {
  readonly platform = 'web' as const;
  private db: any;
  private SQL: any;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<void> = Promise.resolve();

  constructor(SQL: any, db: any) {
    this.SQL = SQL;
    this.db = db;
    if (typeof window !== 'undefined') {
      // Cố gắng ghi nốt khi người dùng đóng tab / chuyển app.
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void this.flush();
      });
      window.addEventListener('pagehide', () => void this.flush());
    }
  }

  static async create(): Promise<WebSqlDriver> {
    const initSqlJs = (await import('sql.js')).default as any;
    const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default as string;
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const saved = await idbGet();
    const db = saved && saved.length > 0 ? new SQL.Database(saved) : new SQL.Database();
    return new WebSqlDriver(SQL, db);
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.savePromise = this.persistNow();
    }, 250);
  }

  private async persistNow(): Promise<void> {
    try {
      const bytes: Uint8Array = this.db.export();
      await idbPut(bytes);
    } catch (e) {
      console.error('[SQLITE/web] Không ghi được DB xuống IndexedDB:', e);
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.run(sql);
    this.scheduleSave();
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.run(sql, params as any[]);
    this.scheduleSave();
  }

  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      if (params.length) stmt.bind(params as any[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    if (!statements.length) return;
    this.db.run('BEGIN');
    try {
      for (const st of statements) this.db.run(st.sql, (st.params ?? []) as any[]);
      this.db.run('COMMIT');
    } catch (e) {
      try {
        this.db.run('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    }
    this.scheduleSave();
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.savePromise;
    await this.persistNow();
  }

  async exportRawBytes(): Promise<Uint8Array | null> {
    return this.db.export();
  }

  async importRawBytes(bytes: Uint8Array): Promise<boolean> {
    this.db.close();
    this.db = new this.SQL.Database(bytes);
    await this.persistNow();
    return true;
  }

  async close(): Promise<void> {
    await this.flush();
    this.db.close();
  }
}

/* ====================================================================== */
/* NATIVE: @capacitor-community/sqlite                                    */
/* ====================================================================== */

class NativeSqlDriver implements SqlDriver {
  readonly platform = 'native' as const;
  private conn: any;

  private constructor(conn: any) {
    this.conn = conn;
  }

  static async create(): Promise<NativeSqlDriver> {
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);

    // Nếu connection đã tồn tại (hot reload / mở lại app) thì lấy lại thay vì tạo mới.
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    const conn = isConn
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

    if (!(await conn.isDBOpen()).result) await conn.open();
    await conn.execute('PRAGMA journal_mode=WAL;');
    await conn.execute('PRAGMA foreign_keys=ON;');
    return new NativeSqlDriver(conn);
  }

  async exec(sql: string): Promise<void> {
    await this.conn.execute(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.conn.run(sql, params as any[], false);
  }

  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.conn.query(sql, params as any[]);
    return (res.values ?? []) as T[];
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    if (!statements.length) return;
    const set = statements.map((st) => ({ statement: st.sql, values: (st.params ?? []) as any[] }));
    await this.conn.executeSet(set, true);
  }

  async flush(): Promise<void> {
    /* SQLite native ghi trực tiếp xuống file, không cần flush. */
  }

  async exportRawBytes(): Promise<Uint8Array | null> {
    /* Trên native ta dùng snapshot JSON (xem src/cloud/snapshot.ts) thay vì copy file .db. */
    return null;
  }

  async importRawBytes(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {
    try {
      await this.conn.close();
    } catch {
      /* ignore */
    }
  }
}

/* ====================================================================== */

let driverPromise: Promise<SqlDriver> | null = null;

/** Lấy driver SQLite phù hợp với nền tảng đang chạy (singleton). */
export function getDriver(): Promise<SqlDriver> {
  if (!driverPromise) {
    driverPromise = Capacitor.isNativePlatform()
      ? (NativeSqlDriver.create() as Promise<SqlDriver>)
      : (WebSqlDriver.create() as Promise<SqlDriver>);
  }
  return driverPromise;
}
