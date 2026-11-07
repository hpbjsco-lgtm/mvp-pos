/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SYNCED_TABLES, TABLE_PRIMARY_KEY } from '../db/schema';
import type { SqlStatement } from '../db/driver';
import { buildPullStatements } from './pullApplier';
import { SyncRequestError, type PullSource } from './syncClient';
import { SyncStore } from './syncStore';

/** Progress of the first download, for the loading screen. */
export interface InitialSyncProgress {
  /** Rows written to the device so far. */
  downloaded: number;
  /** Tables of the last page, in words for the screen; empty before the first page arrives. */
  table: string;
}

/**
 * Statements that empty every synchronised table and the upload bookkeeping, children first.
 *
 * @returns Statements to run through `SyncStore.applyRemote`.
 */
export function buildWipeStatements(): SqlStatement[] {
  const statements: SqlStatement[] = [...SYNCED_TABLES].reverse().map(table => ({ sql: `DELETE FROM ${table} WHERE ${TABLE_PRIMARY_KEY[table]} IS NOT NULL` }));
  statements.push({ sql: 'DELETE FROM sync_outbox' }, { sql: 'DELETE FROM sync_row_base' });
  return statements;
}

/**
 * Downloads a whole store from the server into the device database.
 *
 * The device must have `initialSync = pending` (see `SyncStore.markInitialSyncPending`). With no saved
 * download position the synchronised tables are wiped first; with one the download resumes where it stopped.
 * Each page and its position are written in one transaction, so stopping at any moment leaves a position that
 * matches the data. When the server database was restored in the meantime (`EPOCH_CHANGED`) the download starts again.
 *
 * @param store Bookkeeping tables of the device.
 * @param source Where pages come from.
 * @param onProgress Called after every page.
 * @returns Resolves when the store is fully downloaded and `initialSync` is `done`.
 * @throws {Error} When the server cannot be reached, rejects the request or sends data the device cannot store.
 */
export async function runInitialSync(store: SyncStore, source: PullSource, onProgress: (progress: InitialSyncProgress) => void = () => {}): Promise<void> {
  const storeId = await store.getState('storeId');
  if (!storeId) throw new Error('The device has no store chosen for synchronisation.');
  if ((await store.getState('initialSync')) === 'done') return;

  let downloaded = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let cursor = await store.getState('cursor');
    if (!cursor) await store.applyRemote(buildWipeStatements());
    try {
      for (;;) {
        const page = await source.pull(storeId, cursor);
        const statements = buildPullStatements(page.changes);
        statements.push(SyncStore.stateStatement('cursor', page.cursor), SyncStore.stateStatement('epoch', page.epoch));
        if (page.done) statements.push(SyncStore.stateStatement('initialSync', 'done'));
        await store.applyRemote(statements);
        downloaded += page.changes.length;
        onProgress({ downloaded, table: page.changes.length > 0 ? page.changes[page.changes.length - 1].table : '' });
        if (page.done) return;
        if (page.cursor === cursor) throw new Error('The server returned the same download position twice; stopping to avoid an endless loop.');
        cursor = page.cursor;
      }
    } catch (error) {
      // The server database was restored: the saved position is useless, so drop it and download everything again.
      if (error instanceof SyncRequestError && error.code === 'EPOCH_CHANGED' && attempt === 0) {
        await store.markInitialSyncPending(storeId);
        continue;
      }
      throw error;
    }
  }
}
