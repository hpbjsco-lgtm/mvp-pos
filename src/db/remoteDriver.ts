/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SqlDriver, SqlStatement } from './driver';
import type { ServerConnection } from './serverConnection';

/** How long one request may take before it is treated as a lost connection. */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * SQL driver that runs every statement on the database server (server/pos-db-server) over HTTP.
 * The database file lives on the server, so there is no local copy and the app needs a connection to work.
 */
export class RemoteSqlDriver implements SqlDriver {
  readonly platform = 'web' as const;

  /**
   * @param connection Server address and API token.
   * @param fetchImpl HTTP function; replaced in tests.
   */
  constructor(
    private readonly connection: ServerConnection,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async exec(sql: string): Promise<void> {
    await this.post('/api/sql', { action: 'exec', sql });
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.post('/api/sql', { action: 'run', sql, params });
  }

  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const body = await this.post('/api/sql', { action: 'all', sql, params });
    return (body.rows ?? []) as T[];
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    if (!statements.length) return;
    await this.post('/api/batch', { statements });
  }

  async flush(): Promise<void> {
    /* Every statement is already stored on the server when its request returns. */
  }

  async exportRawBytes(): Promise<Uint8Array | null> {
    /* Downloading the file needs the admin token; use the admin page of the server instead. */
    return null;
  }

  async importRawBytes(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {
    /* Nothing to release. */
  }

  /**
   * Sends one JSON request to the server and returns its JSON answer.
   *
   * @param path API path, for example "/api/sql".
   * @param payload Request body.
   * @returns The parsed answer.
   * @throws Error with a readable message when the server cannot be reached, rejects the token or reports an SQL error.
   */
  private async post(path: string, payload: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.connection.url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.connection.token}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`Không kết nối được máy chủ dữ liệu (${this.connection.url}): ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Máy chủ dữ liệu từ chối mã API. Hãy kiểm tra lại mã API.');
    if (!response.ok) throw new Error(body.error || `Máy chủ dữ liệu trả lỗi ${response.status}.`);
    return body;
  }
}
