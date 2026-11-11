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
 * @property {SmtpConfig | null} smtp Mail server used to send password reset codes; null when `SMTP_HOST` is not set (the "forgot password" feature is then off).
 */

/**
 * @typedef {Object} SmtpConfig
 * @property {string} host Mail server name.
 * @property {number} port Mail server port (587 with STARTTLS, 465 with TLS).
 * @property {boolean} secure True for a TLS connection from the start (port 465).
 * @property {string} user Account name; empty for a server that needs no login.
 * @property {string} pass Account password.
 * @property {string} from Sender shown on the mail, for example `MVP POS <no-reply@example.com>`.
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
 * Reads the mail settings.
 *
 * @param {Record<string, string | undefined>} env Environment variables.
 * @returns {SmtpConfig | null} The settings, or null when `SMTP_HOST` is empty.
 * @throws {Error} When `SMTP_HOST` is set but the port or the sender is missing or invalid.
 */
function parseSmtp(env) {
  const host = (env.SMTP_HOST || '').trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`SMTP_PORT must be an integer between 1 and 65535, got "${env.SMTP_PORT}".`);
  const from = (env.SMTP_FROM || '').trim();
  if (!from) throw new Error('SMTP_FROM is required when SMTP_HOST is set, for example "MVP POS <no-reply@example.com>".');
  return { host, port, secure: port === 465, user: (env.SMTP_USER || '').trim(), pass: env.SMTP_PASS || '', from };
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
    smtp: parseSmtp(env),
  };
}
