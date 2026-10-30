/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entry point of the database server.
 *
 *   API_TOKEN=<16+ chars> ADMIN_TOKEN=<16+ chars, different> DATA_DIR=/var/lib/mvp-pos node src/index.mjs
 *
 * Optional: PORT (8790), HOST (127.0.0.1), CORS_ORIGIN.
 */

import { mkdirSync } from 'node:fs';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });

const manager = new DatabaseManager(config.databaseFile, config.backupDir);
const getDatabase = () => manager.database;
const app = createApp({
  sqlService: new SqlService(getDatabase),
  explorer: new TableExplorer(getDatabase),
  manager,
  apiToken: config.apiToken,
  adminToken: config.adminToken,
  corsOrigin: config.corsOrigin,
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[pos-db-server] listening on ${config.host}:${config.port}, database file: ${config.databaseFile}`);
});

/** Closes the HTTP server and the database so the WAL file is checkpointed before the process ends. */
function shutdown() {
  server.close(() => {
    manager.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
