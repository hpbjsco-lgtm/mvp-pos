/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error with a machine-readable `code` and the HTTP status the router answers with.
 * Codes: `NOT_READY` (database has no app schema yet), `BAD_REQUEST`, `BAD_CURSOR`, `EPOCH_CHANGED`
 * (the database was restored, so the device must download everything again), `CURSOR_AHEAD`,
 * `NOT_FOUND`, `NOT_PENDING` (conflict already resolved), `CONFLICT_STALE` (the server row changed
 * after the conflict was recorded; look at it again before deciding).
 */
export class SyncError extends Error {
  /**
   * @param {string} code Machine-readable reason.
   * @param {string} message Readable explanation.
   * @param {number} status HTTP status.
   */
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
