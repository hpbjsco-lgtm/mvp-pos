/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/** File name prefix of scheduled backups; restore backups use another prefix and are never pruned. */
export const AUTO_BACKUP_PREFIX = 'pos-auto-';

/** How often the scheduler checks whether a backup is due, so a long interval still reacts to a restart. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Takes a backup of the live database on a schedule and keeps only the newest ones.
 */
export class BackupScheduler {
  /**
   * @param {Object} options Settings.
   * @param {import('./databaseManager.mjs').DatabaseManager} options.manager Source of the backups.
   * @param {number} options.intervalHours Hours between backups; 0 turns the scheduler off.
   * @param {number} options.keepCount Number of scheduled backups to keep.
   * @param {() => Date} [options.now] Clock, replaceable in tests.
   * @param {(message: string) => void} [options.log] Receives status and error lines.
   */
  constructor({ manager, intervalHours, keepCount, now = () => new Date(), log = console.log }) {
    this.manager = manager;
    this.intervalHours = intervalHours;
    this.keepCount = keepCount;
    this.now = now;
    this.log = log;
    this.timer = null;
  }

  /**
   * Scheduled backups in the backup folder, oldest first.
   *
   * @returns {string[]} File names.
   */
  listBackups() {
    try {
      return readdirSync(this.manager.backupDir)
        .filter(name => name.startsWith(AUTO_BACKUP_PREFIX) && name.endsWith('.db'))
        .sort();
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * Takes a backup now and removes the scheduled backups beyond `keepCount`.
   *
   * @returns {Promise<string>} Path of the new backup.
   */
  async runOnce() {
    mkdirSync(this.manager.backupDir, { recursive: true });
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const target = path.join(this.manager.backupDir, `${AUTO_BACKUP_PREFIX}${stamp}.db`);
    await this.manager.backupToFile(target);
    for (const name of this.listBackups().slice(0, -this.keepCount)) {
      rmSync(path.join(this.manager.backupDir, name));
    }
    return target;
  }

  /**
   * Takes a backup only when the newest scheduled one is older than the interval (or none exists).
   *
   * @returns {Promise<string | null>} Path of the new backup, or null when none was due.
   */
  async runIfDue() {
    const newest = this.listBackups().at(-1);
    if (newest) {
      const ageMs = this.now().getTime() - statSync(path.join(this.manager.backupDir, newest)).mtimeMs;
      if (ageMs < this.intervalHours * 3600 * 1000) return null;
    }
    return this.runOnce();
  }

  /** Starts the schedule: checks at once and then every few minutes. Does nothing when `intervalHours` is 0. */
  start() {
    if (this.intervalHours <= 0) {
      this.log('[pos-db-server] automatic backup is off (BACKUP_INTERVAL_HOURS=0)');
      return;
    }
    const check = () => this.runIfDue()
      .then(file => { if (file) this.log(`[pos-db-server] backup written: ${file}`); })
      .catch(error => this.log(`[pos-db-server] backup FAILED: ${error.message}`));
    check();
    this.timer = setInterval(check, CHECK_INTERVAL_MS);
    // The schedule must not keep the process alive on shutdown.
    this.timer.unref();
  }

  /** Stops the schedule. */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
