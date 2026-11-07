/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Capacitor } from '@capacitor/core';
import { initDatabase } from '../db';
import { getAppSyncClient } from './appSyncClient';
import { DocumentNumberer, type DocumentKind, type DocumentNumber } from './documentNumberer';
import { SyncStore } from './syncStore';

export type { DocumentKind, DocumentNumber };

/** Numberer of this app run; built on first use because a phone needs its database first. */
let numberer: Promise<DocumentNumberer | null> | null = null;

/**
 * @returns The numberer for the way this app keeps its data, or null when the data stays on this device or in this
 *   browser (the documents then keep the numbers the app made before the server existed).
 */
function resolveNumberer(): Promise<DocumentNumberer | null> {
  if (!numberer) {
    numberer = (async () => {
      const client = getAppSyncClient();
      if (!client) return null;
      // A phone can fall back to temporary codes; a browser cannot work without the server.
      return new DocumentNumberer(client, Capacitor.isNativePlatform() ? new SyncStore(await initDatabase()) : null);
    })();
  }
  return numberer;
}

/**
 * Gives a new document its number: from the server when the app uses one (a temporary code on a phone that cannot
 * reach it), and the app's own local number otherwise.
 *
 * @param kind Kind of document.
 * @param storeId Store the document belongs to.
 * @param localNumber Makes the number used when the data stays on this device or browser.
 * @returns The number and, for a temporary one, its code.
 * @throws {Error} In a browser that uses the server, when the server cannot be reached.
 */
export async function createDocumentNumber(kind: DocumentKind, storeId: string, localNumber: () => string): Promise<DocumentNumber> {
  const active = await resolveNumberer();
  return active ? active.next(storeId, kind) : { number: localNumber(), tempNumber: '' };
}
