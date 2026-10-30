/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearServerConnection, getServerConnection, normalizeServerUrl, saveServerConnection,
} from './serverConnection';

/** Minimal in-memory localStorage for the node test environment. */
function installFakeLocalStorage() {
  const values = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  return values;
}

describe('normalizeServerUrl', () => {
  it('trims spaces and trailing slashes', () => {
    expect(normalizeServerUrl('  https://pos.hp-backup.com/// ')).toBe('https://pos.hp-backup.com');
  });

  it('keeps a port and a path prefix', () => {
    expect(normalizeServerUrl('http://192.168.1.5:8790')).toBe('http://192.168.1.5:8790');
  });

  it('rejects text that is not an http(s) address', () => {
    expect(() => normalizeServerUrl('pos.hp-backup.com')).toThrow('http');
    expect(() => normalizeServerUrl('ftp://host')).toThrow('http');
    expect(() => normalizeServerUrl('')).toThrow('http');
  });
});

describe('server connection storage', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = installFakeLocalStorage();
    // A developer's .env.local may fix a connection; these tests cover the saved one.
    vi.stubEnv('VITE_SERVER_API_TOKEN', '');
  });
  afterEach(() => {
    delete (globalThis as any).localStorage;
    vi.unstubAllEnvs();
  });

  it('returns null when nothing was saved', () => {
    expect(getServerConnection()).toBeNull();
  });

  it('saves a normalized address and reads it back', () => {
    saveServerConnection({ url: 'https://pos.hp-backup.com/', token: ' secret-token-123456 ' });
    expect(getServerConnection()).toEqual({ url: 'https://pos.hp-backup.com', token: 'secret-token-123456' });
  });

  it('refuses an empty token', () => {
    expect(() => saveServerConnection({ url: 'https://pos.hp-backup.com', token: '  ' })).toThrow('mã API');
  });

  it('forgets the connection after clearServerConnection', () => {
    saveServerConnection({ url: 'https://pos.hp-backup.com', token: 'secret-token-123456' });
    clearServerConnection();
    expect(getServerConnection()).toBeNull();
  });

  it('fails loudly on a damaged saved value instead of using another database', () => {
    values.set('smartpos.serverConnection', '{not json');
    expect(() => getServerConnection()).toThrow('bị hỏng');
  });

  it('prefers the connection fixed by VITE_SERVER_* over the saved one', () => {
    saveServerConnection({ url: 'https://saved.example.com', token: 'saved-token-123456' });
    vi.stubEnv('VITE_SERVER_URL', 'http://127.0.0.1:8790/');
    vi.stubEnv('VITE_SERVER_API_TOKEN', ' fixed-token-123456 ');
    try {
      expect(getServerConnection()).toEqual({ url: 'http://127.0.0.1:8790', token: 'fixed-token-123456' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
