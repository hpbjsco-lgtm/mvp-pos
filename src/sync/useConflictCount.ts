/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { getAppSyncClient } from './appSyncClient';

/** How often the number of open conflicts is checked. */
const CHECK_INTERVAL_MS = 30000;

/**
 * Number of unresolved synchronisation conflicts of a store, checked every 30 seconds while the page is visible.
 * A failed check keeps the last number (the next check tries again).
 *
 * @param storeId Store to look at.
 * @param enabled False for people who cannot resolve conflicts, so nothing is requested.
 * @returns The count and a function that checks at once.
 */
export function useConflictCount(storeId: string, enabled: boolean): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(value => value + 1), []);

  useEffect(() => {
    const client = getAppSyncClient();
    if (!enabled || !storeId || !client) { setCount(0); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const open = await client.listConflicts(storeId, 'pending');
          if (!stopped) setCount(open.length);
        } catch (error) {
          console.warn('[SYNC] Không kiểm tra được xung đột đồng bộ:', error);
        }
      }
      if (!stopped) timer = setTimeout(check, CHECK_INTERVAL_MS);
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [storeId, enabled, tick]);

  return { count, refresh };
}
