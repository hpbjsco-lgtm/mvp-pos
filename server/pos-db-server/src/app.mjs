/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createAdminRouter } from './adminRouter.mjs';
import { requireBearerToken } from './auth.mjs';

/** Largest JSON body accepted; product photos are stored as data URLs inside SQL parameters. */
const MAX_BODY_SIZE = '32mb';

/**
 * Builds the HTTP application. It is separate from `index.mjs` so tests can start it on a random port.
 *
 * Admin page and its API are mounted at `/admin` (see `adminRouter.mjs`).
 *
 * Routes (all except `/api/health` need the Bearer token):
 *  - GET  /api/health  liveness check
 *  - POST /api/sql     body `{ action: 'exec' | 'run' | 'all', sql, params? }`
 *  - POST /api/batch   body `{ statements: [{ sql, params? }] }`, applied in one transaction
 *
 * @param {Object} options Dependencies and settings.
 * @param {import('./sqlService.mjs').SqlService} options.sqlService Executes the SQL.
 * @param {string} options.apiToken Secret required by the protected routes.
 * @param {import('./tableExplorer.mjs').TableExplorer} options.explorer Reads and edits table rows for the admin page.
 * @param {import('./databaseManager.mjs').DatabaseManager} options.manager Takes backups and restores them for the admin page.
 * @param {string} options.adminToken Secret required by the admin routes.
 * @param {string} [options.corsOrigin] Origin allowed to call the API from a browser; empty means no CORS headers.
 * @returns {import('express').Express} Configured application.
 */
export function createApp({ sqlService, apiToken, explorer, manager, adminToken, corsOrigin = '' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  if (corsOrigin) {
    app.use((request, response, next) => {
      response.setHeader('Access-Control-Allow-Origin', corsOrigin);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (request.method === 'OPTIONS') {
        response.sendStatus(204);
        return;
      }
      next();
    });
  }

  app.get('/api/health', (request, response) => {
    response.json({ ok: true, service: 'pos-db-server', time: new Date().toISOString() });
  });

  const protectedRoute = requireBearerToken(apiToken);

  app.post('/api/sql', protectedRoute, (request, response) => {
    const { action, sql, params } = request.body || {};
    try {
      if (action === 'exec') {
        sqlService.exec(sql);
        response.json({ ok: true });
      } else if (action === 'run') {
        sqlService.run(sql, params);
        response.json({ ok: true });
      } else if (action === 'all') {
        response.json({ ok: true, rows: sqlService.all(sql, params) });
      } else {
        response.status(400).json({ error: 'action must be "exec", "run" or "all".' });
      }
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.post('/api/batch', protectedRoute, (request, response) => {
    const { statements } = request.body || {};
    if (!Array.isArray(statements)) {
      response.status(400).json({ error: 'statements must be an array.' });
      return;
    }
    try {
      sqlService.batch(statements);
      response.json({ ok: true });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.use('/admin', createAdminRouter({ explorer, manager, adminToken }));

  return app;
}
