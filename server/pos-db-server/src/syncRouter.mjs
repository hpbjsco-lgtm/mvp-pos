/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { SyncError } from './syncService.mjs';

/**
 * Builds the router of the synchronisation API. The caller mounts it behind the API token check.
 *
 * Routes:
 *  - GET  /pull?storeId=...&cursor=...&limit=...  next page of changes for a store (see `SyncService.pull`)
 *  - POST /push  body `{ storeId, deviceId, groups }` (see `SyncService.push`)
 *  - GET  /stores  stores a device can choose from (id and name)
 *  - GET  /summary?storeId=...&after=...  tables changed after a log position (omit `after` for the current position)
 *  - POST /next-number  body `{ storeId, kind }`: next official number (`order`, `import`, `export`, `receipt`, `payment`, `stocktake`)
 *  - GET  /conflicts?storeId=...&status=pending|resolved  conflicts of a store, without payloads
 *  - GET  /conflicts/:id  one conflict with the device's and the server's version
 *  - POST /conflicts/:id/resolve  body `{ choice: 'server' | 'device', resolvedBy }`
 *
 * Errors answer `{ error, code }` with the status of the `SyncError`.
 *
 * @param {import('./syncService.mjs').SyncService} syncService Source of the changes.
 * @returns {import('express').Router} The router.
 */
export function createSyncRouter(syncService) {
  const router = express.Router();

  router.get('/pull', (request, response) => {
    const limit = request.query.limit === undefined ? undefined : Number(request.query.limit);
    try {
      response.json(syncService.pull({
        storeId: String(request.query.storeId || ''),
        cursor: request.query.cursor ? String(request.query.cursor) : null,
        limit,
      }));
    } catch (error) {
      if (!(error instanceof SyncError)) throw error;
      response.status(error.status).json({ error: error.message, code: error.code });
    }
  });

  /**
   * Runs a handler and turns a `SyncError` into its JSON answer; other errors reach Express.
   *
   * @param {import('express').Response} response Response to answer.
   * @param {() => unknown} work Produces the JSON body.
   */
  const answer = (response, work) => {
    try {
      response.json(work());
    } catch (error) {
      if (!(error instanceof SyncError)) throw error;
      response.status(error.status).json({ error: error.message, code: error.code });
    }
  };

  router.post('/push', (request, response) => {
    const { storeId, deviceId, groups } = request.body || {};
    answer(response, () => syncService.push({ storeId, deviceId, groups }));
  });

  router.get('/stores', (request, response) => {
    answer(response, () => syncService.listStores());
  });

  router.get('/summary', (request, response) => {
    const after = request.query.after === undefined ? null : Number(request.query.after);
    answer(response, () => syncService.summary({ storeId: String(request.query.storeId || ''), after }));
  });

  router.post('/next-number', (request, response) => {
    const { storeId, kind } = request.body || {};
    answer(response, () => syncService.nextNumber({ storeId, kind }));
  });

  router.get('/conflicts', (request, response) => {
    answer(response, () => {
      syncService.ensureInfrastructure();
      const status = request.query.status === 'resolved' ? 'resolved' : 'pending';
      const storeId = String(request.query.storeId || '');
      if (!storeId) throw new SyncError('BAD_REQUEST', 'storeId is required.', 400);
      return { conflicts: syncService.conflicts.list(storeId, status) };
    });
  });

  router.get('/conflicts/:id', (request, response) => {
    answer(response, () => {
      syncService.ensureInfrastructure();
      return syncService.conflicts.get(request.params.id);
    });
  });

  router.post('/conflicts/:id/resolve', (request, response) => {
    const { choice, resolvedBy } = request.body || {};
    answer(response, () => {
      syncService.ensureInfrastructure();
      syncService.conflicts.resolve(request.params.id, choice, resolvedBy);
      return { ok: true };
    });
  });

  return router;
}
