/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entry point of the database server.
 *
 *   API_TOKEN=<at least 16 characters> DATA_DIR=/var/lib/mvp-pos node src/index.mjs
 *
 * Optional: PORT (8790), HOST (127.0.0.1), CORS_ORIGIN.
 */

import { mkdirSync } from 'node:fs';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { openDatabase, SqlService } from './sqlService.mjs';

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });

const database = openDatabase(config.databaseFile);
const app = createApp({
  sqlService: new SqlService(database),
  apiToken: config.apiToken,
  corsOrigin: config.corsOrigin,
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[pos-db-server] listening on ${config.host}:${config.port}, database file: ${config.databaseFile}`);
});

/** Closes the HTTP server and the database so the WAL file is checkpointed before the process ends. */
function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
