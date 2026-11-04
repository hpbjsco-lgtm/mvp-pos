import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, utimesSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { AUTO_BACKUP_PREFIX, BackupScheduler } from './backupScheduler.mjs';
import { loadConfig } from './config.mjs';
import { DatabaseManager } from './databaseManager.mjs';

describe('backup settings', () => {
  const base = { API_TOKEN: 'a'.repeat(16), ADMIN_TOKEN: 'b'.repeat(16) };
  it('defaults to a daily backup keeping 14 copies', () => {
    const config = loadConfig(base);
    expect(config.backupIntervalHours).toBe(24);
    expect(config.backupKeepCount).toBe(14);
  });
  it('accepts 0 to turn scheduled backups off and rejects bad values', () => {
    expect(loadConfig({ ...base, BACKUP_INTERVAL_HOURS: '0' }).backupIntervalHours).toBe(0);
    expect(() => loadConfig({ ...base, BACKUP_INTERVAL_HOURS: '-1' })).toThrow('BACKUP_INTERVAL_HOURS');
    expect(() => loadConfig({ ...base, BACKUP_INTERVAL_HOURS: 'x' })).toThrow('BACKUP_INTERVAL_HOURS');
    expect(() => loadConfig({ ...base, BACKUP_KEEP: '0' })).toThrow('BACKUP_KEEP');
  });
});

describe('BackupScheduler', () => {
  let folder;
  let manager;
  let clock;
  beforeEach(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-backup-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    manager.database.exec('CREATE TABLE t (v TEXT); INSERT INTO t VALUES (\'hello\')');
    clock = new Date('2026-11-01T10:00:00Z');
  });
  afterEach(() => {
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const scheduler = (options = {}) => new BackupScheduler({ manager, intervalHours: 24, keepCount: 3, now: () => clock, log: () => undefined, ...options });

  it('writes a valid copy that contains the live data, including data still in the WAL', async () => {
    const file = await scheduler().runOnce();
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'hello' });
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    copy.close();
  });

  it('keeps only the newest scheduled backups and never touches other files', async () => {
    const backups = path.join(folder, 'backups');
    const instance = scheduler();
    await instance.runOnce();
    writeFileSync(path.join(backups, 'pos-before-restore-old.db'), 'x');
    for (let day = 2; day <= 5; day++) {
      clock = new Date(`2026-11-0${day}T10:00:00Z`);
      await instance.runOnce();
    }
    const names = readdirSync(backups).sort();
    expect(names.filter(name => name.startsWith(AUTO_BACKUP_PREFIX))).toHaveLength(3);
    expect(names).toContain('pos-before-restore-old.db');
    expect(names.some(name => name.includes('2026-11-01'))).toBe(false);
    expect(names.some(name => name.includes('2026-11-05'))).toBe(true);
  });

  it('runs only when the newest backup is older than the interval', async () => {
    const instance = scheduler();
    expect(await instance.runIfDue()).not.toBeNull();
    clock = new Date(clock.getTime() + 3600 * 1000);
    expect(await instance.runIfDue()).toBeNull();
    const [name] = instance.listBackups();
    const old = new Date(clock.getTime() - 25 * 3600 * 1000);
    utimesSync(path.join(folder, 'backups', name), old, old);
    expect(await instance.runIfDue()).not.toBeNull();
  });

  it('does nothing when switched off', () => {
    const lines = [];
    scheduler({ intervalHours: 0, log: line => lines.push(line) }).start();
    expect(lines[0]).toContain('off');
  });
});
