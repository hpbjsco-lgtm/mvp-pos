/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** An error the caller can show: a short code and the HTTP status that fits it. */
export class PasswordResetError extends Error {
  /**
   * @param {string} code Short code, for example `INVALID_CODE`.
   * @param {string} message Readable message.
   * @param {number} status HTTP status.
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PasswordResetError';
    this.code = code;
    this.status = status;
  }
}

/** Settings of the reset codes. */
export const DEFAULT_RESET_OPTIONS = Object.freeze({
  /** How long a code works, in milliseconds. */
  codeTtlMs: 15 * 60 * 1000,
  /** Wrong codes allowed before the code is thrown away. */
  maxAttempts: 5,
  /** Least time between two codes sent to the same account, in milliseconds. */
  minIntervalMs: 60 * 1000,
});

/**
 * @param {string} value Text to hash.
 * @returns {string} SHA-256 of the text, in hex.
 */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Lets a person who forgot their password choose a new one: a 6-digit code is mailed to the address of the account and
 * is exchanged for a new password. The password is hashed by the app before it is sent, so the server never sees it.
 * Whether an account exists is never revealed to the caller.
 */
export class PasswordResetService {
  /**
   * @param {() => import('better-sqlite3').Database} getDatabase Returns the current connection.
   * @param {import('./mailer.mjs').Mailer} mailer Sends the mail.
   * @param {{ codeTtlMs?: number, maxAttempts?: number, minIntervalMs?: number, now?: () => number, newCode?: () => string, log?: (message: string) => void }} [options] Tuning and test hooks.
   */
  constructor(getDatabase, mailer, options = {}) {
    this.getDatabase = getDatabase;
    this.mailer = mailer;
    this.settings = { ...DEFAULT_RESET_OPTIONS, ...options };
    this.now = options.now ?? (() => Date.now());
    this.newCode = options.newCode ?? (() => String(randomInt(0, 1000000)).padStart(6, '0'));
    this.log = options.log ?? ((message) => console.error(message));
  }

  /** Creates the table that holds the codes. It lives only in the server database and is not synchronised. */
  ensureTable() {
    this.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS password_resets (
        uid        TEXT PRIMARY KEY,
        code_salt  TEXT NOT NULL,
        code_hash  TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        sent_at    INTEGER NOT NULL
      );
    `);
  }

  /**
   * @param {string} login User name or email typed by the person.
   * @returns {{ uid: string, email: string, name: string } | undefined} The account that can be reset: not deleted, active, with an email address.
   */
  findAccount(login) {
    const key = String(login || '').trim().toLowerCase();
    if (!key) return undefined;
    return this.getDatabase()
      .prepare(`SELECT uid, email, name FROM users
                WHERE (lower(username) = ? OR lower(email) = ?) AND deleted_at IS NULL AND is_active <> 0 AND role <> 'sysadmin' AND email <> ''`)
      .get(key, key);
  }

  /**
   * Sends a reset code to the email address of the account, if there is one. It returns the same whatever happens, so
   * a caller cannot find out which accounts exist; a failure to send is only written to the log.
   *
   * @param {string} login User name or email.
   * @returns {Promise<void>}
   */
  async requestReset(login) {
    this.ensureTable();
    const account = this.findAccount(login);
    if (!account) return;
    const database = this.getDatabase();
    const existing = database.prepare('SELECT sent_at FROM password_resets WHERE uid = ?').get(account.uid);
    const now = this.now();
    if (existing && now - existing.sent_at < this.settings.minIntervalMs) return;

    const code = this.newCode();
    const salt = randomBytes(16).toString('hex');
    database
      .prepare(`INSERT INTO password_resets (uid, code_salt, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, ?, 0, ?)
                ON CONFLICT(uid) DO UPDATE SET code_salt = excluded.code_salt, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`)
      .run(account.uid, salt, sha256(`${salt}:${code}`), now + this.settings.codeTtlMs, now);
    try {
      await this.mailer.send({
        to: account.email,
        subject: 'Mã đặt lại mật khẩu MVP POS',
        text: `Xin chào ${account.name || ''},\n\nMã đặt lại mật khẩu của bạn là: ${code}\n\nMã có hiệu lực ${Math.round(this.settings.codeTtlMs / 60000)} phút và chỉ dùng được một lần. `
          + 'Không chia sẻ mã này với bất kỳ ai. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.\n',
      });
    } catch (error) {
      // The caller must not learn that this account exists, so the failure is only logged for the administrator.
      this.log(`[password-reset] Could not send the code to ${account.email}: ${error.message}`);
    }
  }

  /**
   * Checks the code and sets the new password.
   *
   * @param {Object} request The request.
   * @param {string} request.login User name or email.
   * @param {string} request.code The 6-digit code from the email.
   * @param {string} request.salt Salt of the new password, made by the app.
   * @param {string} request.hash Hash of the new password, made by the app.
   * @throws {PasswordResetError} `BAD_REQUEST` for a missing or malformed field; `INVALID_CODE` for a wrong, expired or used code
   *   (one message for all of them).
   */
  resetPassword({ login, code, salt, hash }) {
    const shaped = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max && !/\s/.test(value);
    if (!shaped(salt, 8, 128) || !shaped(hash, 16, 256)) throw new PasswordResetError('BAD_REQUEST', 'The new password is not in the expected form.');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw new PasswordResetError('INVALID_CODE', 'Mã không đúng hoặc đã hết hạn.');

    this.ensureTable();
    const database = this.getDatabase();
    const invalid = new PasswordResetError('INVALID_CODE', 'Mã không đúng hoặc đã hết hạn.');
    const account = this.findAccount(login);
    const record = account ? database.prepare('SELECT * FROM password_resets WHERE uid = ?').get(account.uid) : undefined;
    if (!account || !record) throw invalid;
    if (this.now() > record.expires_at || record.attempts >= this.settings.maxAttempts) {
      database.prepare('DELETE FROM password_resets WHERE uid = ?').run(account.uid);
      throw invalid;
    }
    // Counted before comparing, so a failed comparison cannot be retried without limit.
    database.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE uid = ?').run(account.uid);
    const expected = Buffer.from(record.code_hash, 'hex');
    const given = Buffer.from(sha256(`${record.code_salt}:${code.trim()}`), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid;

    database.transaction(() => {
      database
        .prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), rev = rev + 1 WHERE uid = ?")
        .run(hash, salt, account.uid);
      database.prepare('DELETE FROM password_resets WHERE uid = ?').run(account.uid);
    })();
  }
}
