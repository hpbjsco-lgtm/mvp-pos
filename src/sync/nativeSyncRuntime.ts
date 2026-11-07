/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initDatabase } from '../db';
import { ServerEndpoints } from '../db/serverEndpoints';
import { getNativeSettings } from '../native/nativeSettings';
import { SyncClient } from './syncClient';
import { SyncEngine } from './syncEngine';
import { SyncScheduler } from './syncScheduler';
import { SyncStore } from './syncStore';

/** The scheduler of this app run, once started. */
let scheduler: SyncScheduler | null = null;
let starting: Promise<SyncScheduler> | null = null;
const readyListeners = new Set<(scheduler: SyncScheduler) => void>();

/**
 * Starts background synchronisation on a phone that uses the server: rounds after local changes, every 30
 * seconds, when the network comes back and when the app returns to the front. Call it after the first download.
 *
 * @returns The running scheduler (the same one when called again).
 * @throws {Error} When the settings are not those of a configured server device.
 */
export function startNativeSync(): Promise<SyncScheduler> {
  if (!starting) {
    starting = (async () => {
      const settings = getNativeSettings();
      if (settings.mode !== 'server' || !settings.storeId) throw new Error('This device is not set up to synchronise with a server.');
      const driver = await initDatabase();
      const store = new SyncStore(driver);
      const client = new SyncClient(new ServerEndpoints({ domainUrl: settings.domainUrl, localUrl: settings.localUrl }), settings.token);
      const engine = new SyncEngine(driver, store, client);
      const started = new SyncScheduler({ runRound: () => engine.runOnce(), pendingCount: () => store.pendingCount(), now: () => Date.now() });

      const { Network } = await import('@capacitor/network');
      await Network.addListener('networkStatusChange', status => { if (status.connected) started.requestRound(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') started.requestRound(); });

      started.start();
      scheduler = started;
      readyListeners.forEach(listener => listener(started));
      return started;
    })();
  }
  return starting;
}

/**
 * @returns The running scheduler, or null on a device that does not synchronise (or before it started).
 */
export function getNativeSyncScheduler(): SyncScheduler | null {
  return scheduler;
}

/**
 * Calls the listener with the scheduler as soon as there is one (at once when it already runs).
 *
 * @param listener Receives the scheduler.
 * @returns Function that removes the listener.
 */
export function onSyncSchedulerReady(listener: (scheduler: SyncScheduler) => void): () => void {
  if (scheduler) listener(scheduler);
  readyListeners.add(listener);
  return () => { readyListeners.delete(listener); };
}
