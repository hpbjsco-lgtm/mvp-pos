/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

/**
 * Settings of the database server, read from environment variables.
 *
 * @typedef {Object} ServerConfig
 * @property {number} port TCP port to listen on.
 * @property {string} host Network interface to listen on (127.0.0.1 behind a reverse proxy, 0.0.0.0 inside Docker).
 * @property {string} dataDir Folder that holds the SQLite file. Keep it outside the build output so deploys never touch it.
 * @property {string} databaseFile Full path of the SQLite file.
 * @property {string} apiToken Secret that every API call must send as a Bearer token.
 * @property {string} adminToken Secret for the admin page; keep it different from `apiToken` because the API token is stored in the app.
 * @property {string} backupDir Folder where automatic backups (taken before a restore) are written.
 * @property {string} corsOrigin Origin allowed to call the API from a browser; empty disables CORS headers.
 */

/** Name of the SQLite file inside the data folder. */
export const DATABASE_FILE_NAME = 'pos.db';

/**
 * Reads and validates the server settings.
 *
 * @param {Record<string, string | undefined>} env Environment variables (normally `process.env`).
 * @returns {ServerConfig} Validated settings.
 * @throws {Error} When a required variable is missing or a value is invalid.
 */
export function loadConfig(env) {
  const apiToken = (env.API_TOKEN || '').trim();
  if (apiToken.length < 16) {
    throw new Error('API_TOKEN is required and must be at least 16 characters long.');
  }

  const adminToken = (env.ADMIN_TOKEN || '').trim();
  if (adminToken.length < 16) {
    throw new Error('ADMIN_TOKEN is required and must be at least 16 characters long.');
  }
  if (adminToken === apiToken) {
    throw new Error('ADMIN_TOKEN must be different from API_TOKEN.');
  }

  const port = Number(env.PORT || 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}".`);
  }

  const dataDir = path.resolve(env.DATA_DIR || './data');

  return {
    port,
    host: env.HOST || '127.0.0.1',
    dataDir,
    databaseFile: path.join(dataDir, DATABASE_FILE_NAME),
    apiToken,
    adminToken,
    backupDir: path.join(dataDir, 'backups'),
    corsOrigin: (env.CORS_ORIGIN || '').trim(),
  };
}
