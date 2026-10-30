/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBearerToken } from './auth.mjs';
import { ExplorerError } from './tableExplorer.mjs';

/** Folder of the static admin page. */
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Largest database file accepted by the restore upload. */
const MAX_RESTORE_SIZE = '512mb';

/**
 * Builds the admin routes, mounted at `/admin`.
 *
 *  - GET    /admin/db                        the admin page (static HTML, no data in it)
 *  - GET    /admin/api/tables                tables with row counts
 *  - GET    /admin/api/tables/:table         one page of rows (`limit`, `offset`, `search`)
 *  - GET    /admin/api/tables/:table/row     one full row (`key` = JSON)
 *  - POST   /admin/api/tables/:table/rows    insert, body `{ values }`
 *  - PUT    /admin/api/tables/:table/rows    update, body `{ key, values }`
 *  - DELETE /admin/api/tables/:table/rows    delete, body `{ key }`
 *  - GET    /admin/api/backup                download the database file
 *  - POST   /admin/api/restore               replace the database with the uploaded file (raw bytes)
 *
 * Every `/admin/api` route needs `Authorization: Bearer <ADMIN_TOKEN>`.
 *
 * @param {Object} options Dependencies and settings.
 * @param {import('./tableExplorer.mjs').TableExplorer} options.explorer Reads and edits table rows.
 * @param {import('./databaseManager.mjs').DatabaseManager} options.manager Takes backups and restores them.
 * @param {string} options.adminToken Secret required by the admin API.
 * @returns {import('express').Router} Router to mount at `/admin`.
 */
export function createAdminRouter({ explorer, manager, adminToken }) {
  const router = express.Router();

  router.get('/db', (request, response) => {
    response.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
  });

  const api = express.Router();
  api.use(requireBearerToken(adminToken));

  /**
   * Wraps a handler so database and validation errors become a 400 answer with their message.
   *
   * @param {(request: import('express').Request, response: import('express').Response) => void} handler Route logic.
   * @returns {import('express').RequestHandler} Safe handler.
   */
  const guarded = (handler) => (request, response) => {
    try {
      handler(request, response);
    } catch (error) {
      response.status(400).json({ error: error.message, validation: error instanceof ExplorerError });
    }
  };

  api.get('/tables', guarded((request, response) => {
    response.json({ tables: explorer.listTables() });
  }));

  api.get('/tables/:table', guarded((request, response) => {
    const { limit, offset, search } = request.query;
    response.json(explorer.readRows(request.params.table, { limit, offset, search }));
  }));

  api.get('/tables/:table/row', guarded((request, response) => {
    let key;
    try {
      key = JSON.parse(String(request.query.key || ''));
    } catch {
      throw new ExplorerError('key must be valid JSON.');
    }
    const row = explorer.readRow(request.params.table, key);
    if (!row) {
      response.status(404).json({ error: 'The row no longer exists.' });
      return;
    }
    response.json({ row });
  }));

  api.post('/tables/:table/rows', express.json({ limit: '32mb' }), guarded((request, response) => {
    const rowId = explorer.insertRow(request.params.table, request.body?.values);
    response.json({ ok: true, rowId: Number(rowId) });
  }));

  api.put('/tables/:table/rows', express.json({ limit: '32mb' }), guarded((request, response) => {
    const changes = explorer.updateRow(request.params.table, request.body?.key, request.body?.values);
    response.json({ ok: true, changes });
  }));

  api.delete('/tables/:table/rows', express.json(), guarded((request, response) => {
    const changes = explorer.deleteRow(request.params.table, request.body?.key);
    response.json({ ok: true, changes });
  }));

  api.get('/backup', guarded((request, response) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="pos-${stamp}.db"`);
    response.send(manager.createBackupBytes());
  }));

  api.post('/restore', express.raw({ type: 'application/octet-stream', limit: MAX_RESTORE_SIZE }), guarded((request, response) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new ExplorerError('Send the database file as application/octet-stream.');
    }
    const backupPath = manager.restoreFromBytes(request.body);
    response.json({ ok: true, previousDataSavedAs: path.basename(backupPath) });
  }));

  router.use('/api', api);
  return router;
}
