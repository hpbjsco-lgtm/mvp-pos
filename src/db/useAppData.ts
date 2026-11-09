/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * HOOK DỮ LIỆU TRUNG TÂM CỦA APP
 * ------------------------------
 * Cung cấp cho toàn bộ UI: phiên đăng nhập + tất cả các mảng dữ liệu nghiệp vụ,
 * kèm các hàm setState "có lưu trữ": mỗi lần UI thay đổi state, phần thay đổi
 * được tính toán (diff) và ghi ngay xuống SQLite trong một transaction.
 *
 * => Không còn tình trạng "thao tác xong nhưng không lưu được".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COLLECTION_KEYS,
  diffCartStatements,
  diffStatements,
  loadAllCollections,
  loadCarts,
  loadCollection,
  type CartMap,
  type CollectionKey,
} from './collections';
import { getServerRoute } from './driver';
import { batch, flush, initDatabase, queryOne, run, setMeta } from './index';
import { fetchChangeSummary, planReload, type ReloadPlan } from './liveRefresh';
import { onSyncSchedulerReady } from '../sync/nativeSyncRuntime';
import {
  changeOwnPassword as authChangeOwnPassword,
  changePassword,
  createEmployee as authCreateEmployee,
  ensureDemoStore,
  getStore,
  registerOwner,
  restoreSession,
  signIn as authSignIn,
  signOut as authSignOut,
  updateAutoStockDeduction,
  updateStoreLogo,
  type AuthStore,
  type AuthUser,
  type StoreRole,
  type RegisterInput,
} from './auth';

export type CollectionState = Record<CollectionKey, any[]>;

function emptyState(): CollectionState {
  const s = {} as CollectionState;
  for (const k of COLLECTION_KEYS) s[k] = [];
  return s;
}

export type Setter = (updater: any[] | ((prev: any[]) => any[])) => void;

export interface AppDataApi {
  ready: boolean;
  initError: string;

  user: AuthUser | null;
  store: AuthStore | null;
  storeId: string;
  storeType: 'fnb' | 'retail';
  isDemoSession: boolean;

  data: CollectionState;
  carts: CartMap;
  setters: Record<CollectionKey, Setter>;
  setCarts: (updater: CartMap | ((prev: CartMap) => CartMap)) => void;

  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  demoLogin: (userName: string, storeId: string, storeType: 'fnb' | 'retail', storeName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Tạo tài khoản nhân viên (có mật khẩu) trong cửa hàng hiện tại rồi nạp lại danh sách nhân viên. */
  createEmployee: (params: { username: string; email: string; password: string; name: string; role: StoreRole; hourlyRate: number }) => Promise<void>;
  /** Người dùng đang đăng nhập tự đổi mật khẩu của mình. */
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Đặt lại mật khẩu cho một tài khoản trong cửa hàng hiện tại (chủ / quản lý thực hiện). */
  resetPassword: (uid: string, newPassword: string) => Promise<void>;
  /** Nạp lại toàn bộ dữ liệu từ SQLite (dùng khi cần làm mới dữ liệu từ ổ lưu trữ). */
  reload: () => Promise<void>;
  setStoreType: (type: 'fnb' | 'retail') => void;
  /** Lưu logo in trên hóa đơn của cửa hàng hiện tại (chuỗi rỗng = bỏ logo). */
  setStoreLogo: (logoUrl: string) => Promise<void>;
  /** Bật / tắt việc tự trừ kho khi báo bếp và thanh toán (F&B) cho cửa hàng hiện tại. */
  setAutoStockDeduction: (enabled: boolean) => Promise<void>;
}

/** How often a device asks the server whether other devices changed something. */
const LIVE_REFRESH_INTERVAL_MS = 3000;

export function useAppData(): AppDataApi {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [store, setStore] = useState<AuthStore | null>(null);
  const [storeTypeState, setStoreTypeState] = useState<'fnb' | 'retail'>('fnb');
  const [data, setData] = useState<CollectionState>(emptyState);
  const [carts, setCartsState] = useState<CartMap>({});

  const dataRef = useRef<CollectionState>(data);
  const cartsRef = useRef<CartMap>(carts);
  const storeIdRef = useRef<string>('');
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  /** Number of writes queued or running; the live refresh waits until it is 0. */
  const pendingWrites = useRef(0);
  /** Raised by every change made on this device; the live refresh drops a reload that started before the last change. */
  const mutationVersion = useRef(0);

  /** Xếp mọi lệnh ghi vào một hàng đợi tuần tự để tránh tranh chấp transaction. */
  const enqueue = useCallback((task: () => Promise<void>) => {
    pendingWrites.current += 1;
    writeChain.current = writeChain.current
      .then(task)
      .catch((err) => {
        console.error('[SQLITE] Lỗi ghi dữ liệu:', err);
      })
      .finally(() => {
        pendingWrites.current -= 1;
      });
    return writeChain.current;
  }, []);

  const applyStore = useCallback(async (nextStore: AuthStore | null) => {
    const sid = nextStore?.id ?? '';
    storeIdRef.current = sid;
    setStore(nextStore);
    if (nextStore) setStoreTypeState(nextStore.storeType);

    if (!sid) {
      dataRef.current = emptyState();
      cartsRef.current = {};
      setData(dataRef.current);
      setCartsState({});
      return;
    }

    const [collections, loadedCarts] = await Promise.all([loadAllCollections(sid), loadCarts(sid)]);
    dataRef.current = collections;
    cartsRef.current = loadedCarts;
    setData(collections);
    setCartsState(loadedCarts);
  }, []);

  /* --------------------------- Khởi động app --------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        const session = await restoreSession();
        if (cancelled) return;
        if (session) {
          setUser(session.user);
          await applyStore(session.store);
        }
      } catch (err: any) {
        console.error('[SQLITE] Không khởi tạo được cơ sở dữ liệu:', err);
        if (!cancelled) setInitError(err?.message ?? 'Lỗi khởi tạo cơ sở dữ liệu SQLite.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStore]);

  /* ----------------------- Setter có lưu trữ ------------------------- */
  const setters = useMemo(() => {
    const map = {} as Record<CollectionKey, Setter>;
    for (const key of COLLECTION_KEYS) {
      map[key] = (updater) => {
        const prev = dataRef.current[key];
        const next = typeof updater === 'function' ? (updater as (p: any[]) => any[])(prev) : updater;
        if (next === prev) return;
        mutationVersion.current += 1;
        dataRef.current = { ...dataRef.current, [key]: next };
        setData(dataRef.current);

        const sid = storeIdRef.current;
        if (!sid) return;
        void enqueue(async () => {
          const statements = diffStatements(key, prev, next, sid);
          if (statements.length) await batch(statements);
        });
      };
    }
    return map;
  }, [enqueue]);

  const setCarts = useCallback(
    (updater: CartMap | ((prev: CartMap) => CartMap)) => {
      const prev = cartsRef.current;
      const next = typeof updater === 'function' ? (updater as (p: CartMap) => CartMap)(prev) : updater;
      if (next === prev) return;
      mutationVersion.current += 1;
      cartsRef.current = next;
      setCartsState(next);

      const sid = storeIdRef.current;
      if (!sid) return;
      void enqueue(async () => {
        const statements = diffCartStatements(prev, next, sid);
        if (statements.length) await batch(statements);
      });
    },
    [enqueue],
  );

  /* ------------------------------ Phiên ------------------------------- */
  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authSignIn(email, password);
      setUser(result.user);
      await applyStore(result.store);
    },
    [applyStore],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await registerOwner(input);
      setUser(result.user);
      await applyStore(result.store);
    },
    [applyStore],
  );

  const demoLogin = useCallback(
    async (userName: string, storeId: string, storeType: 'fnb' | 'retail', storeName: string) => {
      const result = await ensureDemoStore(storeId, storeName, storeType, userName);
      setUser(result.user);
      await applyStore(result.store);
    },
    [applyStore],
  );

  const createEmployee = useCallback(
    async (params: { username: string; email: string; password: string; name: string; role: StoreRole; hourlyRate: number }) => {
      const sid = storeIdRef.current;
      if (!sid) throw new Error('Chưa chọn cửa hàng.');
      await writeChain.current;
      await authCreateEmployee({ storeId: sid, ...params });
      const [collections, loadedCarts] = await Promise.all([loadAllCollections(sid), loadCarts(sid)]);
      dataRef.current = collections;
      cartsRef.current = loadedCarts;
      setData(collections);
      setCartsState(loadedCarts);
    },
    [],
  );

  const resetPassword = useCallback(
    async (uid: string, newPassword: string) => {
      const sid = storeIdRef.current;
      if (!sid) throw new Error('Chưa chọn cửa hàng.');
      if (newPassword.length < 6) throw new Error('Mật khẩu cần tối thiểu 6 ký tự.');
      const target = await queryOne('SELECT store_id, role FROM users WHERE uid = ? AND deleted_at IS NULL', [uid]);
      if (!target || target.store_id !== sid) throw new Error('Không tìm thấy tài khoản trong cửa hàng này.');
      // Quản lý không được đặt lại mật khẩu của chủ cửa hàng
      if (user?.role !== 'owner' && target.role === 'owner') throw new Error('Chỉ chủ cửa hàng mới đặt lại được mật khẩu của chủ cửa hàng.');
      await changePassword(uid, newPassword);
    },
    [user],
  );

  const changeOwnPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error('Chưa đăng nhập.');
      await authChangeOwnPassword(user.uid, currentPassword, newPassword);
    },
    [user],
  );

  const signOutCb = useCallback(async () => {
    await flush();
    await authSignOut();
    setUser(null);
    await applyStore(null);
  }, [applyStore]);

  const reload = useCallback(async () => {
    const sid = storeIdRef.current;
    if (!sid) return;
    await writeChain.current;
    const [collections, loadedCarts] = await Promise.all([loadAllCollections(sid), loadCarts(sid)]);
    dataRef.current = collections;
    cartsRef.current = loadedCarts;
    setData(collections);
    setCartsState(loadedCarts);
  }, []);

  const setStoreType = useCallback((type: 'fnb' | 'retail') => {
    setStoreTypeState(type);
    const sid = storeIdRef.current;
    setStore((prev) => (prev ? { ...prev, storeType: type } : prev));
    if (!sid) return;
    void enqueue(async () => {
      await run('UPDATE stores SET store_type = ?, updated_at = ?, rev = rev + 1 WHERE id = ?', [
        type,
        new Date().toISOString(),
        sid,
      ]);
      await setMeta('active_store_id', sid);
    });
  }, [enqueue]);

  const setStoreLogo = useCallback(async (logoUrl: string) => {
    const sid = storeIdRef.current;
    if (!sid) throw new Error('Chưa chọn cửa hàng.');
    // Wait for queued writes so this update does not run in the middle of them.
    await writeChain.current;
    await updateStoreLogo(sid, logoUrl);
    setStore((prev) => (prev ? { ...prev, logoUrl } : prev));
  }, []);

  /**
   * Reloads parts of the data from the database and shows them if they differ from the screen. Used after the
   * server (web) or the synchronisation (phone) changed rows that belong to other devices' work.
   *
   * @param storeId Store being shown.
   * @param plan What to reload.
   * @param isStopped True when the caller no longer wants the result.
   * @returns False when the result was dropped because this device changed something meanwhile.
   */
  const reloadParts = useCallback(async (storeId: string, plan: ReloadPlan, isStopped: () => boolean): Promise<boolean> => {
    const version = mutationVersion.current;
    const loaded = await Promise.all(plan.keys.map(async (key) => [key, await loadCollection(key, storeId)] as const));
    const loadedCarts = plan.carts ? await loadCarts(storeId) : null;
    const loadedStore = plan.store ? await getStore(storeId) : null;
    // A change made here while loading (or a write still running) means the loaded copy may be older than
    // the screen: drop it, the caller loads again later.
    if (isStopped() || storeIdRef.current !== storeId || version !== mutationVersion.current || pendingWrites.current > 0) return false;
    let next = dataRef.current;
    for (const [key, items] of loaded) {
      if (JSON.stringify(items) !== JSON.stringify(dataRef.current[key])) next = { ...next, [key]: items };
    }
    if (next !== dataRef.current) {
      dataRef.current = next;
      setData(next);
    }
    if (loadedCarts && JSON.stringify(loadedCarts) !== JSON.stringify(cartsRef.current)) {
      cartsRef.current = loadedCarts;
      setCartsState(loadedCarts);
    }
    // Settings changed on another device (for example the automatic stock deduction)
    if (loadedStore) setStore(prev => (prev && JSON.stringify(prev) !== JSON.stringify(loadedStore) ? loadedStore : prev));
    return true;
  }, []);

  /* Phone that synchronises with the server: show what the last round changed (rows of other devices, official numbers). */
  useEffect(() => {
    const storeId = store?.id;
    if (!storeId) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const apply = async (tables: string[], attempt: number) => {
      const done = await reloadParts(storeId, planReload(tables), () => stopped);
      // The screen was busy (a local write was running): try again shortly, a few times.
      if (!done && !stopped && attempt < 5) retry = setTimeout(() => { void apply(tables, attempt + 1); }, 1000);
    };
    let unsubscribe: (() => void) | undefined;
    const stopWaiting = onSyncSchedulerReady(scheduler => {
      unsubscribe = scheduler.onChanged(tables => { void apply(tables, 0); });
    });
    return () => {
      stopped = true;
      clearTimeout(retry);
      stopWaiting();
      unsubscribe?.();
    };
  }, [store?.id, reloadParts]);

  const setAutoStockDeduction = useCallback(async (enabled: boolean) => {
    const sid = storeIdRef.current;
    if (!sid) throw new Error('Chưa chọn cửa hàng.');
    // Wait for queued writes so this update does not run in the middle of them.
    await writeChain.current;
    await updateAutoStockDeduction(sid, enabled);
    setStore((prev) => (prev ? { ...prev, autoStockDeduction: enabled } : prev));
  }, []);

  /* Cập nhật trực tiếp: thiết bị khác cùng dùng máy chủ thay đổi dữ liệu (bếp, bàn, giỏ hàng...) thì tải lại phần đã đổi. */
  useEffect(() => {
    const route = getServerRoute();
    const storeId = store?.id;
    if (!route || !storeId) return;
    let stopped = false;
    let position: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const summary = await fetchChangeSummary(storeId, position);
        if (position === null) {
          position = summary.seq;
        } else if (summary.reset) {
          if (await reloadParts(storeId, { keys: COLLECTION_KEYS, carts: true, store: true }, () => stopped)) position = summary.seq;
        } else if (summary.tables.length === 0) {
          position = summary.seq;
        } else if (pendingWrites.current === 0 && (await reloadParts(storeId, planReload(summary.tables), () => stopped))) {
          position = summary.seq;
        }
      } catch (error) {
        // A short network failure is retried at the next check; the SQL calls report persistent failures themselves.
        console.warn('[LIVE] Không kiểm tra được thay đổi từ máy chủ:', error);
      }
    };

    const loop = async () => {
      await check();
      if (!stopped) timer = setTimeout(loop, LIVE_REFRESH_INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || stopped) return;
      clearTimeout(timer);
      void loop();
    };
    void loop();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store?.id, reloadParts]);

  /* Ghi nốt dữ liệu khi app bị đưa vào nền / đóng. */
  useEffect(() => {
    const handler = () => {
      void writeChain.current.then(() => flush());
    };
    window.addEventListener('pagehide', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, []);

  return {
    ready,
    initError,
    user,
    store,
    storeId: store?.id ?? '',
    storeType: storeTypeState,
    isDemoSession: !!user?.uid?.startsWith('demo-'),
    data,
    carts,
    setters,
    setCarts,
    signIn,
    register,
    demoLogin,
    signOut: signOutCb,
    createEmployee,
    resetPassword,
    changeOwnPassword,
    reload,
    setStoreType,
    setStoreLogo,
    setAutoStockDeduction,
  };
}
