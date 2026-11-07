/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Capacitor } from '@capacitor/core';
import { getServerRoute } from '../db/driver';
import { ServerEndpoints } from '../db/serverEndpoints';
import { getNativeSettings } from '../native/nativeSettings';
import { getNativeSyncScheduler } from './nativeSyncRuntime';
import { SyncClient } from './syncClient';

/** Client of a phone app, built once from its settings. */
let nativeClient: { key: string; client: SyncClient } | null = null;
/** Client of a browser that uses the server, built once from the shared routes. */
let webClient: SyncClient | null = null;

/**
 * Returns the client for the server this app uses, the same way for a phone and for a browser.
 *
 * @returns The client, or null when the data stays on this device or in this browser.
 */
export function getAppSyncClient(): SyncClient | null {
  if (Capacitor.isNativePlatform()) {
    const settings = getNativeSettings();
    if (settings.mode !== 'server') return null;
    const key = JSON.stringify([settings.domainUrl, settings.localUrl, settings.token]);
    if (!nativeClient || nativeClient.key !== key) {
      nativeClient = { key, client: new SyncClient(new ServerEndpoints({ domainUrl: settings.domainUrl, localUrl: settings.localUrl }), settings.token) };
    }
    return nativeClient.client;
  }
  const route = getServerRoute();
  if (!route) return null;
  webClient ??= new SyncClient(route.endpoints, route.token);
  return webClient;
}

/**
 * Asks a phone to run a synchronisation round now, for example right after a conflict was resolved. A browser
 * needs no call: it reads the server directly and refreshes by itself.
 */
export function requestSyncNow(): void {
  getNativeSyncScheduler()?.requestRound();
}
