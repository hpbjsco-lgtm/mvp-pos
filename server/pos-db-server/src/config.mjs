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
 * @property {string} backupDir Folder where backups are written (the one taken before a restore, and the scheduled ones).
 * @property {number} backupIntervalHours Hours between scheduled backups; 0 turns them off.
 * @property {number} backupKeepCount Number of scheduled backups to keep.
 * @property {string} staticDir Folder with the built web app to serve at `/` (empty: the server only provides the API and admin page).
 * @property {string[]} corsOrigins Origins allowed to call the API from a browser (a web page served from another address, or the app in a phone); empty disables CORS headers.
 */

/** Name of the SQLite file inside the data folder. */
export const DATABASE_FILE_NAME = 'pos.db';

/**
 * Reads the list of origins allowed to call the API.
 *
 * @param {string | undefined} text Comma-separated origins, for example `http://192.168.1.12,https://localhost`.
 * @returns {string[]} The origins without trailing slashes; empty when the text is empty.
 * @throws {Error} When an entry is not an origin (scheme, host and optional port, no path).
 */
function parseOrigins(text) {
  return (text || '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((origin) => {
      if (!/^[a-z][a-z0-9+.-]*:\/\/[^\s/]+$/i.test(origin)) {
        throw new Error(`CORS_ORIGIN entries must look like https://host or http://host:port, got "${origin}".`);
      }
      return origin;
    });
}

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

  const backupIntervalHours = Number(env.BACKUP_INTERVAL_HOURS || 24);
  if (!Number.isFinite(backupIntervalHours) || backupIntervalHours < 0) {
    throw new Error(`BACKUP_INTERVAL_HOURS must be 0 (off) or a positive number of hours, got "${env.BACKUP_INTERVAL_HOURS}".`);
  }

  const backupKeepCount = Number(env.BACKUP_KEEP || 14);
  if (!Number.isInteger(backupKeepCount) || backupKeepCount < 1) {
    throw new Error(`BACKUP_KEEP must be a whole number of at least 1, got "${env.BACKUP_KEEP}".`);
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
    backupIntervalHours,
    backupKeepCount,
    staticDir: env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : '',
    corsOrigins: parseOrigins(env.CORS_ORIGIN),
  };
}
