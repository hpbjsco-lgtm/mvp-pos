/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../../src/db/schema';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { PasswordResetError, PasswordResetService } from './passwordReset.mjs';
import { SqlService } from './sqlService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const NOW = '2026-11-01T10:00:00.000Z';
const API_TOKEN = 'integration-token-0123';
const NEW_SALT = 'a'.repeat(32);
const NEW_HASH = 'b'.repeat(64);

describe('PasswordResetService', () => {
  let folder;
  let manager;
  let sent;
  let clock;
  let service;
  let logged;

  /** Inserts a user row. */
  const addUser = (uid, extra = {}) => {
    const user = { uid, email: `${uid}@example.com`, username: uid, name: `Name ${uid}`, role: 'owner', is_active: 1, password_hash: 'old-hash', password_salt: 'old-salt', ...extra };
    manager.database
      .prepare('INSERT INTO users (uid, email, username, name, role, is_active, password_hash, password_salt, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(user.uid, user.email, user.username, user.name, user.role, user.is_active, user.password_hash, user.password_salt, NOW, NOW, user.deleted_at ?? null);
  };
  const password = (uid) => manager.database.prepare('SELECT password_hash, password_salt, rev FROM users WHERE uid = ?').get(uid);
  const lastCode = () => /\b(\d{6})\b/.exec(sent.at(-1).text)[1];

  beforeEach(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-reset-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    for (const migration of MIGRATIONS) for (const statement of migration.statements) manager.database.exec(statement);
    sent = [];
    logged = [];
    clock = 1_000_000;
    let counter = 0;
    service = new PasswordResetService(() => manager.database, { send: async (message) => { sent.push(message); } }, {
      now: () => clock, newCode: () => String(123450 + counter++), log: (message) => logged.push(message),
    });
    addUser('owner1');
  });
  afterEach(() => {
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('mails a 6-digit code to the email of the account, found by user name or by email', async () => {
    await service.requestReset('OWNER1');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'owner1@example.com', subject: expect.stringContaining('đặt lại mật khẩu') });
    expect(sent[0].text).toContain('123450');
    expect(sent[0].text).toContain('15 phút');
    clock += 61_000;
    await service.requestReset('owner1@example.com');
    expect(sent).toHaveLength(2);
  });

  it('sends nothing, and tells nothing, for an unknown, inactive, deleted or email-less account', async () => {
    addUser('gone', { deleted_at: NOW });
    addUser('off', { is_active: 0 });
    addUser('noemail', { email: '' });
    for (const login of ['nobody', 'gone', 'off', 'noemail', '']) await expect(service.requestReset(login)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('does not send a second code within a minute', async () => {
    await service.requestReset('owner1');
    await service.requestReset('owner1');
    expect(sent).toHaveLength(1);
  });

  it('keeps quiet when the mail server fails, and writes the reason to the log', async () => {
    const failing = new PasswordResetService(() => manager.database, { send: async () => { throw new Error('connection refused'); } }, { log: (message) => logged.push(message) });
    await expect(failing.requestReset('owner1')).resolves.toBeUndefined();
    expect(logged[0]).toContain('connection refused');
  });

  it('sets the new password with the right code, raises the row version and uses the code up', async () => {
    await service.requestReset('owner1');
    service.resetPassword({ login: 'owner1', code: lastCode(), salt: NEW_SALT, hash: NEW_HASH });
    expect(password('owner1')).toEqual({ password_hash: NEW_HASH, password_salt: NEW_SALT, rev: 2 });
    expect(() => service.resetPassword({ login: 'owner1', code: lastCode(), salt: NEW_SALT, hash: NEW_HASH })).toThrow(PasswordResetError);
  });

  it('refuses a wrong code and throws the code away after five wrong tries', async () => {
    await service.requestReset('owner1');
    const real = lastCode();
    for (let i = 0; i < 5; i += 1) expect(() => service.resetPassword({ login: 'owner1', code: '000000', salt: NEW_SALT, hash: NEW_HASH })).toThrow('Mã không đúng hoặc đã hết hạn');
    expect(() => service.resetPassword({ login: 'owner1', code: real, salt: NEW_SALT, hash: NEW_HASH })).toThrow('Mã không đúng hoặc đã hết hạn');
    expect(password('owner1').password_hash).toBe('old-hash');
  });

  it('refuses an expired code', async () => {
    await service.requestReset('owner1');
    clock += 16 * 60_000;
    expect(() => service.resetPassword({ login: 'owner1', code: lastCode(), salt: NEW_SALT, hash: NEW_HASH })).toThrow(PasswordResetError);
    expect(password('owner1').password_hash).toBe('old-hash');
  });

  it('gives the same answer for a wrong login as for a wrong code', () => {
    const answer = (login) => { try { service.resetPassword({ login, code: '123456', salt: NEW_SALT, hash: NEW_HASH }); return null; } catch (error) { return [error.code, error.message]; } };
    expect(answer('nobody')).toEqual(answer('owner1'));
  });

  it('refuses a password that is not in the expected form, or a code that is not 6 digits', async () => {
    await service.requestReset('owner1');
    expect(() => service.resetPassword({ login: 'owner1', code: lastCode(), salt: '', hash: NEW_HASH })).toThrow('expected form');
    expect(() => service.resetPassword({ login: 'owner1', code: lastCode(), salt: NEW_SALT, hash: 'has space in it........' })).toThrow('expected form');
    expect(() => service.resetPassword({ login: 'owner1', code: 'abc', salt: NEW_SALT, hash: NEW_HASH })).toThrow('Mã không đúng');
  });

  it('only resets the account that asked: the code of one account does not open another', async () => {
    addUser('other');
    await service.requestReset('owner1');
    expect(() => service.resetPassword({ login: 'other', code: lastCode(), salt: NEW_SALT, hash: NEW_HASH })).toThrow(PasswordResetError);
    expect(password('other').password_hash).toBe('old-hash');
  });
});

describe('the /api/auth routes', () => {
  let folder;
  let manager;
  let server;
  let url;
  let sent;

  const call = (route, body, token = API_TOKEN) => fetch(`${url}/api/auth/${route}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  });

  beforeEach(async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-reset-http-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    for (const migration of MIGRATIONS) for (const statement of migration.statements) manager.database.exec(statement);
    manager.database.prepare("INSERT INTO users (uid, email, username, name, role, is_active, created_at, updated_at) VALUES ('u1', 'u1@example.com', 'u1', 'U1', 'owner', 1, ?, ?)").run(NOW, NOW);
    sent = [];
    const getDatabase = () => manager.database;
    const passwordReset = new PasswordResetService(getDatabase, { send: async (message) => { sent.push(message); } });
    const app = createApp({
      sqlService: new SqlService(getDatabase), explorer: new TableExplorer(getDatabase), manager, apiToken: API_TOKEN, adminToken: 'admin-token-integration-01', passwordReset,
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('needs the API token', async () => {
    expect((await call('capabilities', undefined, 'wrong-token-0123456')).status).toBe(401);
  });

  it('says that password reset is available', async () => {
    expect(await (await call('capabilities')).json()).toEqual({ passwordReset: true });
  });

  it('answers ok for any login and mails only the real one; the code then changes the password', async () => {
    expect(await (await call('forgot', { login: 'nobody' })).json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    expect(await (await call('forgot', { login: 'u1' })).json()).toEqual({ ok: true });
    const code = /\b(\d{6})\b/.exec(sent[0].text)[1];
    const response = await call('reset', { login: 'u1', code, salt: NEW_SALT, hash: NEW_HASH });
    expect(await response.json()).toEqual({ ok: true });
    expect(manager.database.prepare("SELECT password_hash FROM users WHERE uid = 'u1'").get().password_hash).toBe(NEW_HASH);
  });

  it('answers 400 with a code for a wrong code', async () => {
    await call('forgot', { login: 'u1' });
    const response = await call('reset', { login: 'u1', code: '000000', salt: NEW_SALT, hash: NEW_HASH });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_CODE' });
  });
});

describe('mail settings of the server', () => {
  const base = { API_TOKEN: 'a'.repeat(20), ADMIN_TOKEN: 'b'.repeat(20) };

  it('are off without SMTP_HOST', () => {
    expect(loadConfig(base).smtp).toBeNull();
  });

  it('are read from the environment, with TLS on port 465', () => {
    expect(loadConfig({ ...base, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'MVP POS <no-reply@example.com>', SMTP_USER: 'u', SMTP_PASS: 'p' }).smtp)
      .toEqual({ host: 'smtp.example.com', port: 587, secure: false, user: 'u', pass: 'p', from: 'MVP POS <no-reply@example.com>' });
    expect(loadConfig({ ...base, SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_FROM: 'x@example.com' }).smtp.secure).toBe(true);
  });

  it('need a sender and a valid port', () => {
    expect(() => loadConfig({ ...base, SMTP_HOST: 'smtp.example.com' })).toThrow('SMTP_FROM');
    expect(() => loadConfig({ ...base, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'x@example.com', SMTP_PORT: 'abc' })).toThrow('SMTP_PORT');
  });
});
