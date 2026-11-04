/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SqlDriver, SqlStatement } from './driver';
import type { ServerEndpoints } from './serverEndpoints';

/**
 * SQL driver that runs every statement on the database server (server/pos-db-server) over HTTP.
 * The database file lives on the server, so there is no local copy and the app needs a connection to work.
 * Requests go through `ServerEndpoints`, which moves between the domain and the local address.
 */
export class RemoteSqlDriver implements SqlDriver {
  readonly platform = 'web' as const;

  /**
   * @param endpoints Routes to the server.
   * @param token API token sent with every request.
   */
  constructor(
    private readonly endpoints: ServerEndpoints,
    private readonly token: string,
  ) {}

  async exec(sql: string): Promise<void> {
    await this.post('/api/sql', { action: 'exec', sql }, false);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.post('/api/sql', { action: 'run', sql, params }, false);
  }

  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const body = await this.post('/api/sql', { action: 'all', sql, params }, true);
    return (body.rows ?? []) as T[];
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    if (!statements.length) return;
    await this.post('/api/batch', { statements }, false);
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
   * @param isRead True for a query that only reads, which may be repeated on the other address.
   * @returns The parsed answer.
   * @throws Error with a readable message when no address can be reached, the server rejects the token or reports an SQL error.
   */
  private async post(path: string, payload: unknown, isRead: boolean): Promise<any> {
    const response = await this.endpoints.request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload),
      },
      { idempotent: isRead },
    );

    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Máy chủ dữ liệu từ chối mã API. Hãy kiểm tra lại mã API.');
    if (!response.ok) throw new Error(body.error || `Máy chủ dữ liệu trả lỗi ${response.status}.`);
    return body;
  }
}
