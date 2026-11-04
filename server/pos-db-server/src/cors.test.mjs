import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { DatabaseManager } from './databaseManager.mjs';
import { SqlService } from './sqlService.mjs';
import { TableExplorer } from './tableExplorer.mjs';

const TOKEN = 'cors-token-0123456789';
const base = { API_TOKEN: TOKEN, ADMIN_TOKEN: 'admin-token-0123456789' };

describe('CORS_ORIGIN setting', () => {
  it('is empty by default', () => expect(loadConfig(base).corsOrigins).toEqual([]));
  it('reads a list, trims entries and drops trailing slashes', () => {
    expect(loadConfig({ ...base, CORS_ORIGIN: ' http://192.168.1.12 , https://localhost/, capacitor://localhost ' }).corsOrigins)
      .toEqual(['http://192.168.1.12', 'https://localhost', 'capacitor://localhost']);
  });
  it('rejects an entry that is not an origin', () => {
    expect(() => loadConfig({ ...base, CORS_ORIGIN: '192.168.1.12' })).toThrow('CORS_ORIGIN');
    expect(() => loadConfig({ ...base, CORS_ORIGIN: 'https://host/path' })).toThrow('CORS_ORIGIN');
  });
});

describe('CORS headers', () => {
  let folder;
  let manager;
  let server;
  let url;

  beforeEach(async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pos-cors-'));
    manager = new DatabaseManager(path.join(folder, 'pos.db'), path.join(folder, 'backups'));
    const getDatabase = () => manager.database;
    const app = createApp({
      sqlService: new SqlService(getDatabase), explorer: new TableExplorer(getDatabase), manager,
      apiToken: TOKEN, adminToken: base.ADMIN_TOKEN, corsOrigins: ['http://192.168.1.12', 'https://localhost'],
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    manager.close();
    rmSync(folder, { recursive: true, force: true });
  });

  const preflight = (origin, extra = {}) => fetch(`${url}/api/sql`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type', ...extra },
  });

  it('answers a listed origin with that origin only', async () => {
    const response = await preflight('http://192.168.1.12');
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://192.168.1.12');
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('vary')).toContain('Origin');
    expect((await preflight('https://localhost')).headers.get('access-control-allow-origin')).toBe('https://localhost');
  });

  it('gives no CORS permission to an origin that is not listed', async () => {
    const response = await preflight('https://evil.example.com');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('agrees to a private network request from a listed origin only', async () => {
    const allowed = await preflight('https://localhost', { 'Access-Control-Request-Private-Network': 'true' });
    expect(allowed.headers.get('access-control-allow-private-network')).toBe('true');
    const refused = await preflight('https://evil.example.com', { 'Access-Control-Request-Private-Network': 'true' });
    expect(refused.headers.get('access-control-allow-private-network')).toBeNull();
  });

  it('also sets the origin on a normal response', async () => {
    const response = await fetch(`${url}/api/health`, { headers: { Origin: 'http://192.168.1.12' } });
    expect(response.headers.get('access-control-allow-origin')).toBe('http://192.168.1.12');
  });
});
