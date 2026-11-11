/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'node:path';
import { createAdminRouter } from './adminRouter.mjs';
import { requireBearerToken } from './auth.mjs';
import { createAuthRouter } from './authRouter.mjs';
import { createSyncRouter } from './syncRouter.mjs';

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
 *  - GET  /api/sync/pull  change feed for devices (see `syncRouter.mjs`)
 *
 * @param {Object} options Dependencies and settings.
 * @param {import('./sqlService.mjs').SqlService} options.sqlService Executes the SQL.
 * @param {string} options.apiToken Secret required by the protected routes.
 * @param {import('./tableExplorer.mjs').TableExplorer} options.explorer Reads and edits table rows for the admin page.
 * @param {import('./databaseManager.mjs').DatabaseManager} options.manager Takes backups and restores them for the admin page.
 * @param {string} options.adminToken Secret required by the admin routes.
 * @param {import('./passwordReset.mjs').PasswordResetService | null} [options.passwordReset] Password reset by email; without it the `/api/auth` routes are not mounted.
 * @param {import('./syncService.mjs').SyncService} [options.syncService] Change feed for devices; without it the `/api/sync` routes are not mounted.
 * @param {string} [options.staticDir] Folder with the built web app; when set it is served at `/` (the app has no URL routes, so `index.html` answers unknown paths).
 * @param {string[]} [options.corsOrigins] Origins allowed to call the API from a browser; empty means no CORS headers. A request from an origin on the list gets that origin back; other origins get no CORS headers.
 * @returns {import('express').Express} Configured application.
 */
export function createApp({ sqlService, apiToken, explorer, manager, adminToken, syncService = null, passwordReset = null, staticDir = '', corsOrigins = [] }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  if (corsOrigins.length > 0) {
    app.use((request, response, next) => {
      const origin = request.get('Origin');
      response.setHeader('Vary', 'Origin');
      if (origin && corsOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        // A page on the internet calling an address inside the shop network asks for this before the real request.
        if (request.get('Access-Control-Request-Private-Network') === 'true') {
          response.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
      }
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

  if (syncService) app.use('/api/sync', protectedRoute, createSyncRouter(syncService));
  if (passwordReset) app.use('/api/auth', protectedRoute, createAuthRouter(passwordReset));

  app.use('/admin', createAdminRouter({ explorer, manager, adminToken }));

  if (staticDir) {
    app.use(express.static(staticDir));
    // Unknown paths outside /api and /admin return the app shell instead of a 404 page.
    app.get(/^\/(?!api\/|admin\/).*/, (request, response) => {
      response.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}
