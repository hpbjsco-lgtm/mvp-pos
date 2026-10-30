/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from './sqlService.mjs';

/** First 16 bytes of every SQLite file. */
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');

/**
 * Owns the SQLite connection of the server and the operations that replace the whole file
 * (backup and restore). Everything else asks it for the current connection through `database`.
 */
export class DatabaseManager {
  /**
   * @param {string} filePath Path of the live SQLite file.
   * @param {string} backupDir Folder for automatic backups; created when missing.
   */
  constructor(filePath, backupDir) {
    this.filePath = filePath;
    this.backupDir = backupDir;
    this.connection = openDatabase(filePath);
  }

  /**
   * The current connection. Do not keep a reference across requests: a restore replaces it.
   *
   * @returns {import('better-sqlite3').Database} Open connection.
   */
  get database() {
    return this.connection;
  }

  /**
   * Returns the whole database as bytes (consistent snapshot, includes data still in the WAL file).
   *
   * @returns {Buffer} Content of a valid SQLite file.
   */
  createBackupBytes() {
    return this.connection.serialize();
  }

  /**
   * Replaces the live database with an uploaded SQLite file. The current database is saved to the
   * backup folder first, so a wrong upload can be undone by restoring that file.
   *
   * @param {Buffer} uploadedBytes Content of the SQLite file to restore.
   * @returns {string} Path of the backup that holds the data from before the restore.
   * @throws {Error} When the upload is not a SQLite file or fails `PRAGMA integrity_check`; the live database is untouched.
   */
  restoreFromBytes(uploadedBytes) {
    if (uploadedBytes.length < SQLITE_HEADER.length || !uploadedBytes.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
      throw new Error('The uploaded file is not a SQLite database.');
    }

    const temporaryPath = `${this.filePath}.upload`;
    writeFileSync(temporaryPath, uploadedBytes);
    try {
      const candidate = new Database(temporaryPath, { readonly: true });
      try {
        const result = candidate.pragma('integrity_check', { simple: true });
        if (result !== 'ok') throw new Error(`The uploaded database failed the integrity check: ${result}`);
      } finally {
        candidate.close();
      }
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }

    mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `pos-before-restore-${stamp}.db`);
    writeFileSync(backupPath, this.createBackupBytes());

    this.connection.close();
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${this.filePath}${suffix}`;
      if (existsSync(sidecar)) rmSync(sidecar);
    }
    renameSync(temporaryPath, this.filePath);
    this.connection = openDatabase(this.filePath);
    return backupPath;
  }

  /** Closes the connection so the WAL file is checkpointed. */
  close() {
    this.connection.close();
  }
}
