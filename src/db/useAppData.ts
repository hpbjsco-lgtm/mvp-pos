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
  type CartMap,
  type CollectionKey,
} from './collections';
import { batch, flush, initDatabase, run, setMeta } from './index';
import {
  ensureDemoStore,
  ensureSysAdmin,
  registerOwner,
  restoreSession,
  signIn as authSignIn,
  signOut as authSignOut,
  type AuthStore,
  type AuthUser,
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
  isSysAdmin: boolean;
  isDemoSession: boolean;

  data: CollectionState;
  carts: CartMap;
  setters: Record<CollectionKey, Setter>;
  setCarts: (updater: CartMap | ((prev: CartMap) => CartMap)) => void;

  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  demoLogin: (userName: string, storeId: string, storeType: 'fnb' | 'retail', storeName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Nạp lại toàn bộ dữ liệu từ SQLite (dùng sau khi tải dữ liệu từ Cloud về). */
  reload: () => Promise<void>;
  setStoreType: (type: 'fnb' | 'retail') => void;
}

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

  /** Xếp mọi lệnh ghi vào một hàng đợi tuần tự để tránh tranh chấp transaction. */
  const enqueue = useCallback((task: () => Promise<void>) => {
    writeChain.current = writeChain.current.then(task).catch((err) => {
      console.error('[SQLITE] Lỗi ghi dữ liệu:', err);
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
        await ensureSysAdmin();
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

  const isSysAdmin = user?.role === 'sysadmin';

  return {
    ready,
    initError,
    user,
    store,
    storeId: store?.id ?? '',
    storeType: storeTypeState,
    isSysAdmin,
    isDemoSession: !!user?.uid?.startsWith('demo-'),
    data,
    carts,
    setters,
    setCarts,
    signIn,
    register,
    demoLogin,
    signOut: signOutCb,
    reload,
    setStoreType,
  };
}
