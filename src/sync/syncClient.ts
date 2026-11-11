/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerEndpoints } from '../db/serverEndpoints';
import { hashPassword, randomSalt } from '../db/password';

/** One change delivered by the server's change feed. */
export interface PullChange {
  table: string;
  rowId: string;
  op: 'upsert' | 'delete';
  /** The full row for `upsert`. */
  row?: Record<string, string | number | null>;
}

/** One page of the change feed. */
export interface PullPage {
  /** Identifies the server database; it changes when the database is restored. */
  epoch: string;
  /** Opaque position to send with the next request. */
  cursor: string;
  changes: PullChange[];
  /** True when the device has caught up for now. */
  done: boolean;
  /** Unresolved conflicts of the store. */
  pendingConflicts: number;
}

/** A store a device can choose. */
export interface StoreSummary {
  id: string;
  name: string;
}

/** A row as plain values. */
export type SyncRow = Record<string, string | number | null>;

/** One record sent to the server: a row, with the child rows that belong to it (replaced as a set). */
export interface PushGroup {
  table: string;
  rowId: string;
  /** Server version of the row the device last saw; null for a row the device created. */
  baseRev: number | null;
  row: SyncRow;
  children?: Record<string, SyncRow[]>;
}

/** Outcome of one pushed record that the server stored or already had. */
export interface PushedRecord {
  table: string;
  rowId: string;
  /** Row version on the server; null for tables without versions. */
  rev: number | null;
  /** For a numbered document: the number now on the server and the temporary code it came with. */
  number?: string;
  tempNumber?: string;
}

/** The server's answer to a push. */
export interface PushResult {
  applied: PushedRecord[];
  unchanged: PushedRecord[];
  conflicts: Array<{ conflictId: string; table: string; rowId: string }>;
}

/** A conflict as listed (without the two versions). */
export interface ConflictSummary {
  id: string;
  storeId: string;
  table: string;
  rowId: string;
  /** Device that pushed the edit. */
  deviceId: string;
  baseRev: number | null;
  serverRev: number | null;
  status: 'pending' | 'resolved';
  /** `server` or `device` once resolved. */
  resolution: 'server' | 'device' | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** A conflict with both versions, for the screen where a manager compares them. */
export interface ConflictDetail extends ConflictSummary {
  /** The version the device wanted to store. */
  devicePayload: PushGroup;
  /** The server's version; null when the record was removed on the server. */
  serverPayload: PushGroup | null;
}

/** The part of the client that uploads changes; tests replace it. */
export interface PushTarget {
  /**
   * @param storeId Store the device belongs to.
   * @param deviceId Identifier of the device.
   * @param groups Records to send, parents before the records that refer to them.
   * @returns What the server did with each record.
   */
  push(storeId: string, deviceId: string, groups: PushGroup[]): Promise<PushResult>;
}

/** The part of the client that downloads changes; tests replace it. */
export interface PullSource {
  /**
   * @param storeId Store to download.
   * @param cursor Position from the previous page; null for the first call.
   * @returns The next page.
   */
  pull(storeId: string, cursor: string | null): Promise<PullPage>;
}

/** An error answered by the sync API; `code` is the server's error code, for example `EPOCH_CHANGED`. */
export class SyncRequestError extends Error {
  /**
   * @param message Readable message.
   * @param code Server error code, or an empty string when the server sent none.
   * @param status HTTP status.
   */
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

/**
 * HTTP client of the server's `/api/sync` routes. Requests go through `ServerEndpoints`, so they use the
 * domain first and the local address when the domain cannot be reached.
 */
export class SyncClient implements PullSource, PushTarget {
  /**
   * @param endpoints Routes to the server.
   * @param token API token sent with every request.
   */
  constructor(private readonly endpoints: ServerEndpoints, private readonly token: string) {}

  /**
   * @returns The stores of the server.
   * @throws {Error} When the server cannot be reached or rejects the token.
   */
  async listStores(): Promise<StoreSummary[]> {
    const body = await this.get('/api/sync/stores');
    return body.stores as StoreSummary[];
  }

  async pull(storeId: string, cursor: string | null): Promise<PullPage> {
    const query = new URLSearchParams({ storeId });
    if (cursor) query.set('cursor', cursor);
    return (await this.get(`/api/sync/pull?${query.toString()}`)) as PullPage;
  }

  /**
   * Sends records to the server. Repeating a push is safe: the server answers `unchanged` for records it
   * already holds with the same values, so the request may be retried on the other address.
   */
  async push(storeId: string, deviceId: string, groups: PushGroup[]): Promise<PushResult> {
    return (await this.request('/api/sync/push', { method: 'POST', body: JSON.stringify({ storeId, deviceId, groups }) })) as PushResult;
  }

  /**
   * @param storeId Store to list for.
   * @param status Which conflicts to list.
   * @returns Conflicts newest first, without their versions.
   */
  async listConflicts(storeId: string, status: 'pending' | 'resolved'): Promise<ConflictSummary[]> {
    const query = new URLSearchParams({ storeId, status });
    return (await this.get(`/api/sync/conflicts?${query.toString()}`)).conflicts as ConflictSummary[];
  }

  /**
   * @param id Conflict id.
   * @returns The conflict with both versions.
   */
  async getConflict(id: string): Promise<ConflictDetail> {
    return (await this.get(`/api/sync/conflicts/${encodeURIComponent(id)}`)) as ConflictDetail;
  }

  /**
   * Decides a conflict.
   *
   * @param id Conflict id.
   * @param choice `server` keeps the server's data, `device` stores the device's version.
   * @param resolvedBy Name of the person who decided.
   * @throws {SyncRequestError} With code `CONFLICT_STALE` when the server data changed after the conflict was
   *   recorded (read the conflict again and decide again), or `NOT_PENDING` when someone already resolved it.
   */
  async resolveConflict(id: string, choice: 'server' | 'device', resolvedBy: string): Promise<void> {
    await this.request(`/api/sync/conflicts/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: JSON.stringify({ choice, resolvedBy }) }, false);
  }

  /**
   * Tells whether the server can mail password reset codes (it has a mail server set up).
   *
   * @returns True when "forgot password" is available; false when the server has no mail settings, is too old to know the
   *   route, or cannot be reached.
   */
  async passwordResetAvailable(): Promise<boolean> {
    try {
      return Boolean((await this.get('/api/auth/capabilities')).passwordReset);
    } catch {
      return false;
    }
  }

  /**
   * Asks the server to mail a reset code to the account. The answer is the same for every login, so it does not say
   * whether the account exists.
   *
   * @param login User name or email.
   * @throws {Error} When the server cannot be reached or refuses the request (for example too many requests).
   */
  async requestPasswordReset(login: string): Promise<void> {
    await this.request('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ login }) }, false);
  }

  /**
   * Sets a new password with the code from the email. The password is hashed here and only the hash leaves the device.
   *
   * @param login User name or email.
   * @param code The 6-digit code.
   * @param newPassword The new password.
   * @throws {SyncRequestError} With code `INVALID_CODE` for a wrong, expired or used code.
   */
  async resetPassword(login: string, code: string, newPassword: string): Promise<void> {
    const salt = randomSalt();
    const hash = await hashPassword(newPassword, salt);
    await this.request('/api/auth/reset', { method: 'POST', body: JSON.stringify({ login, code, salt, hash }) }, false);
  }

  /**
   * Asks the server for the next official number of a kind of document. A number that is asked for and then
   * not used leaves a gap, so the request is not repeated after a timeout.
   *
   * @param storeId Store the number is for.
   * @param kind `order`, `import`, `export`, `receipt` or `payment`.
   * @returns The number, for example `HD00012`.
   * @throws {Error} When the server cannot be reached or refuses the request.
   */
  async nextNumber(storeId: string, kind: string): Promise<string> {
    const body = await this.request('/api/sync/next-number', { method: 'POST', body: JSON.stringify({ storeId, kind }) }, false);
    return String(body.number);
  }

  /**
   * Sends a GET request and returns its JSON answer.
   *
   * @param path Path with query.
   * @returns The parsed body.
   * @throws {SyncRequestError} When the server answers an error status.
   * @throws {Error} When no address can be reached.
   */
  private async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET' });
  }

  /**
   * Sends a request with the API token and returns its JSON answer.
   *
   * @param path Path with query.
   * @param init Method and body.
   * @param idempotent True when the request may be repeated after a timeout.
   * @returns The parsed body.
   * @throws {SyncRequestError} When the server answers an error status.
   * @throws {Error} When no address can be reached.
   */
  private async request(path: string, init: RequestInit, idempotent = true): Promise<any> {
    const response = await this.endpoints.request(
      path,
      { ...init, headers: { Authorization: `Bearer ${this.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } },
      { idempotent },
    );
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new SyncRequestError('Máy chủ từ chối mã API. Hãy kiểm tra lại mã API.', 'UNAUTHORIZED', 401);
    if (body.code === 'EPOCH_CHANGED') {
      throw new SyncRequestError('Máy chủ vừa được khôi phục từ bản sao lưu. Mở "Cấu hình" và bấm "Tải lại dữ liệu".', 'EPOCH_CHANGED', response.status);
    }
    if (!response.ok) throw new SyncRequestError(body.error || `Máy chủ trả lỗi ${response.status}.`, body.code || '', response.status);
    return body;
  }
}
