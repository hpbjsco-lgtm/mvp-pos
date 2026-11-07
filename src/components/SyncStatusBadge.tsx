/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getNativeSettings } from '../native/nativeSettings';
import { onSyncSchedulerReady } from '../sync/nativeSyncRuntime';
import type { SyncScheduler, SyncStatus } from '../sync/syncScheduler';

/**
 * Words and colour of the badge for a status.
 *
 * @param status Current synchronisation status.
 * @returns Label and colour classes.
 */
function describeStatus(status: SyncStatus): { label: string; tone: string } {
  if (status.state === 'syncing') return { label: 'Đang đồng bộ...', tone: 'bg-surface-container text-on-surface-variant' };
  if (status.state === 'error') return { label: 'Lỗi đồng bộ', tone: 'bg-error-container text-on-error-container' };
  if (status.state === 'offline') {
    return { label: status.pending > 0 ? `Mất kết nối, chờ gửi ${status.pending}` : 'Mất kết nối', tone: 'bg-tertiary-container text-on-tertiary-container' };
  }
  if (status.pending > 0) return { label: `Chờ đồng bộ ${status.pending}`, tone: 'bg-tertiary-container text-on-tertiary-container' };
  return { label: 'Đã đồng bộ', tone: 'bg-secondary-container text-on-secondary-container' };
}

/**
 * Small badge with the synchronisation state of a phone that uses the server. Pressing it runs a round at once.
 * It shows nothing in a browser or on a phone that keeps its data on the device only.
 */
export default function SyncStatusBadge() {
  const [scheduler, setScheduler] = useState<SyncScheduler | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const applicable = Capacitor.isNativePlatform() && getNativeSettings().mode === 'server';

  useEffect(() => {
    if (!applicable) return;
    let unsubscribe: (() => void) | undefined;
    const stopWaiting = onSyncSchedulerReady(ready => {
      setScheduler(ready);
      setStatus(ready.getStatus());
      unsubscribe?.();
      unsubscribe = ready.subscribe(setStatus);
    });
    return () => { stopWaiting(); unsubscribe?.(); };
  }, [applicable]);

  if (!applicable || !scheduler || !status) return null;
  const { label, tone } = describeStatus(status);
  const lastSynced = status.lastSyncedAt ? `Lần đồng bộ cuối: ${new Date(status.lastSyncedAt).toLocaleTimeString('vi-VN')}` : 'Chưa đồng bộ lần nào';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => scheduler.requestRound()}
        title={`${status.message ? `${status.message}\n` : ''}${lastSynced}\nBấm để đồng bộ ngay`}
        className={`text-xs font-bold rounded-full px-2.5 py-1 cursor-pointer ${tone}`}
      >
        {label}
      </button>
      {status.pendingConflicts > 0 && (
        <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-error-container text-on-error-container">
          {status.pendingConflicts} xung đột
        </span>
      )}
    </div>
  );
}
