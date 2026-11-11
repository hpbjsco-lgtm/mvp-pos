/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { PasswordResetError } from './passwordReset.mjs';

/** Requests one address may make in a window before it is told to wait. */
const LIMIT_PER_WINDOW = 30;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Builds the router of the password reset API. The caller mounts it behind the API token check.
 *
 * Routes:
 *  - GET  /capabilities  `{ passwordReset: true }` (the router only exists when the server can send mail)
 *  - POST /forgot        body `{ login }`: sends a code to the email of the account; always answers `{ ok: true }`
 *  - POST /reset         body `{ login, code, salt, hash }`: sets the new password; errors answer `{ error, code }`
 *
 * @param {import('./passwordReset.mjs').PasswordResetService} service The reset logic.
 * @param {{ now?: () => number }} [options] Test hook.
 * @returns {import('express').Router} The router.
 */
export function createAuthRouter(service, options = {}) {
  const now = options.now ?? (() => Date.now());
  const router = express.Router();
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const windows = new Map();

  /** Answers 429 when an address calls too often. */
  router.use((request, response, next) => {
    const key = request.ip || 'unknown';
    const time = now();
    const entry = windows.get(key);
    if (!entry || time > entry.resetAt) windows.set(key, { count: 1, resetAt: time + WINDOW_MS });
    else entry.count += 1;
    if ((windows.get(key)?.count ?? 0) > LIMIT_PER_WINDOW) {
      response.status(429).json({ error: 'Quá nhiều yêu cầu. Hãy thử lại sau ít phút.', code: 'TOO_MANY_REQUESTS' });
      return;
    }
    next();
  });

  router.get('/capabilities', (request, response) => {
    response.json({ passwordReset: true });
  });

  router.post('/forgot', async (request, response, next) => {
    try {
      await service.requestReset(request.body?.login);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reset', (request, response) => {
    try {
      service.resetPassword(request.body || {});
      response.json({ ok: true });
    } catch (error) {
      if (!(error instanceof PasswordResetError)) throw error;
      response.status(error.status).json({ error: error.message, code: error.code });
    }
  });

  return router;
}
