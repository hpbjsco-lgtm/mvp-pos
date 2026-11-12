/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { initDatabase } from '../db';
import { ServerEndpoints } from '../db/serverEndpoints';
import { getNativeSettings } from '../native/nativeSettings';
import { runInitialSync, type InitialSyncProgress } from '../sync/initialSync';
import { SyncClient } from '../sync/syncClient';
import { SyncStore } from '../sync/syncStore';
import { startNativeSync } from '../sync/nativeSyncRuntime';
import NativeConfigButton from './NativeConfigDialog';

/** What the gate is doing. */
type GatePhase = { kind: 'checking' } | { kind: 'downloading'; progress: InitialSyncProgress } | { kind: 'failed'; message: string } | { kind: 'ready' };

/** Names of tables on the loading screen. */
const TABLE_LABELS: Record<string, string> = {
  stores: 'cửa hàng', users: 'tài khoản', zones: 'khu vực', dining_tables: 'bàn', products: 'món và hàng hóa', product_option_groups: 'tùy chọn của món', product_option_choices: 'tùy chọn của món',
  suppliers: 'nhà cung cấp', customers: 'khách hàng', bank_accounts: 'tài khoản ngân hàng', inventory_batches: 'lô hàng',
  inventory_transactions: 'phiếu kho', inventory_transaction_items: 'phiếu kho', orders: 'hóa đơn', order_items: 'hóa đơn',
  kitchen_items: 'phiếu bếp', carts: 'đơn đang mở', cart_items: 'đơn đang mở', attendance: 'chấm công',
  activity_logs: 'nhật ký', shifts: 'ca làm việc', cash_vouchers: 'sổ quỹ',
};

/**
 * Wraps the app on a phone. When the device is set to use the server and its data has not been downloaded yet,
 * it shows a loading screen that blocks everything until the download finishes. Otherwise it shows the app at once.
 *
 * @param props `children`: the app.
 */
export default function NativeSyncGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<GatePhase>({ kind: 'checking' });
  const [skipped, setSkipped] = useState(false);
  const settings = getNativeSettings();
  const needsServer = Capacitor.isNativePlatform() && settings.mode === 'server';

  /** Downloads the store when needed. */
  const start = useCallback(async () => {
    setPhase({ kind: 'checking' });
    try {
      if (!settings.storeId) throw new Error('Chưa chọn cửa hàng để đồng bộ. Bấm "Cấu hình", kiểm tra kết nối và chọn cửa hàng.');
      const store = new SyncStore(await initDatabase());
      if ((await store.getState('initialSync')) !== 'done' || (await store.getState('storeId')) !== settings.storeId) {
        await store.markInitialSyncPending(settings.storeId);
      }
      const client = new SyncClient(new ServerEndpoints({ domainUrl: settings.domainUrl, localUrl: settings.localUrl }), settings.token);
      setPhase({ kind: 'downloading', progress: { downloaded: 0, table: '' } });
      await runInitialSync(store, client, progress => setPhase({ kind: 'downloading', progress }));
      setPhase({ kind: 'ready' });
    } catch (error) {
      setPhase({ kind: 'failed', message: (error as Error).message });
    }
  }, [settings.storeId, settings.domainUrl, settings.localUrl, settings.token]);

  useEffect(() => {
    if (needsServer) void start();
  }, [needsServer, start]);

  // Background synchronisation starts once the data is complete (not when the person chose to skip the download).
  useEffect(() => {
    if (needsServer && phase.kind === 'ready') {
      startNativeSync().catch(error => setPhase({ kind: 'failed', message: (error as Error).message }));
    }
  }, [needsServer, phase.kind]);

  if (!needsServer || skipped || phase.kind === 'ready') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-center gap-5 p-8 text-center">
      {phase.kind === 'failed' ? (
        <>
          <h1 className="text-xl font-bold text-on-surface">Chưa tải được dữ liệu từ máy chủ</h1>
          <p className="text-base text-on-surface-variant max-w-md">{phase.message}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button type="button" onClick={() => void start()} className="m3-btn-filled !min-h-12">Thử lại</button>
            <NativeConfigButton />
            <button type="button" onClick={() => setSkipped(true)} className="m3-btn-outlined !min-h-12">Dùng dữ liệu trên máy</button>
          </div>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" aria-hidden="true" />
          <h1 className="text-xl font-bold text-on-surface">Đang tải dữ liệu từ máy chủ</h1>
          <p className="text-base text-on-surface-variant" aria-live="polite">
            {phase.kind === 'downloading' && phase.progress.downloaded > 0
              ? `Đã tải ${phase.progress.downloaded.toLocaleString('vi-VN')} dòng${phase.progress.table ? ` (${TABLE_LABELS[phase.progress.table] ?? phase.progress.table})` : ''}`
              : 'Đang kết nối...'}
          </p>
          <p className="text-sm text-on-surface-variant max-w-sm">Vui lòng chờ, chưa thao tác được cho đến khi tải xong.</p>
        </>
      )}
    </div>
  );
}
