/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entry point of the database server.
 *
 *   API_TOKEN=<16+ chars> ADMIN_TOKEN=<16+ chars, different> DATA_DIR=/var/lib/mvp-pos node src/index.mjs
 *
 * Optional: PORT (8790), HOST (127.0.0.1), STATIC_DIR (built web app to serve at /), CORS_ORIGIN (comma-separated list),
 * BACKUP_INTERVAL_HOURS (24, 0 = off), BACKUP_KEEP (14),
 * SMTP_HOST / SMTP_PORT (587) / SMTP_USER / SMTP_PASS / SMTP_FROM (to mail password reset codes; without SMTP_HOST the feature is off).
 */

import { mkdirSync } from 'node:fs';
import { createApp } from './app.mjs';
import { BackupScheduler } from './backupScheduler.mjs';
import { loadConfig } from './config.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { createSmtpMailer } from './mailer.mjs';
import { PasswordResetService } from './passwordReset.mjs';
import { SqlService } from './sqlService.mjs';
import { SyncService } from './syncService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });

const manager = new DatabaseManager(config.databaseFile, config.backupDir);
const getDatabase = () => manager.database;
const syncService = new SyncService(getDatabase);
// A restored database file has its own change log, so devices must download everything again.
manager.onRestore(() => syncService.regenerateEpoch());
// Forgot-password needs a mail server; without SMTP_HOST the feature is off and the app hides it
const passwordReset = config.smtp ? new PasswordResetService(getDatabase, createSmtpMailer(config.smtp)) : null;
console.log(`[pos-db-server] password reset by email: ${passwordReset ? `on (SMTP ${config.smtp.host}:${config.smtp.port})` : 'off (SMTP_HOST is not set)'}`);
const app = createApp({
  sqlService: new SqlService(getDatabase),
  explorer: new TableExplorer(getDatabase),
  manager,
  syncService,
  passwordReset,
  apiToken: config.apiToken,
  adminToken: config.adminToken,
  staticDir: config.staticDir,
  corsOrigins: config.corsOrigins,
});

const backups = new BackupScheduler({ manager, intervalHours: config.backupIntervalHours, keepCount: config.backupKeepCount });
backups.start();

const server = app.listen(config.port, config.host, () => {
  console.log(`[pos-db-server] listening on ${config.host}:${config.port}, database file: ${config.databaseFile}`);
});

/** Closes the HTTP server and the database so the WAL file is checkpointed before the process ends. */
function shutdown() {
  backups.stop();
  server.close(() => {
    manager.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
