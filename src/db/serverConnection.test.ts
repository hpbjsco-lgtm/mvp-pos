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
    saveServerConnection({ domainUrl: 'https://pos.hp-backup.com/api/', localUrl: 'http://192.168.1.12/api', token: ' secret-token-123456 ' });
    expect(getServerConnection()).toEqual({ domainUrl: 'https://pos.hp-backup.com', localUrl: 'http://192.168.1.12', token: 'secret-token-123456' });
  });

  it('refuses an empty token', () => {
    expect(() => saveServerConnection({ domainUrl: 'https://pos.hp-backup.com', localUrl: '', token: '  ' })).toThrow('mã API');
  });

  it('forgets the connection after clearServerConnection', () => {
    saveServerConnection({ domainUrl: 'https://pos.hp-backup.com', localUrl: '', token: 'secret-token-123456' });
    clearServerConnection();
    expect(getServerConnection()).toBeNull();
  });

  it('fails loudly on a damaged saved value instead of using another database', () => {
    values.set('smartpos.serverConnection', '{not json');
    expect(() => getServerConnection()).toThrow('bị hỏng');
  });

  it('prefers the connection fixed by VITE_SERVER_* over the saved one', () => {
    saveServerConnection({ domainUrl: 'https://saved.example.com', localUrl: '', token: 'saved-token-123456' });
    vi.stubEnv('VITE_SERVER_DOMAIN_URL', 'https://pos.hp-backup.com/api');
    vi.stubEnv('VITE_SERVER_LOCAL_URL', 'http://192.168.1.12/api/');
    vi.stubEnv('VITE_SERVER_API_TOKEN', ' fixed-token-123456 ');
    try {
      expect(getServerConnection()).toEqual({ domainUrl: 'https://pos.hp-backup.com', localUrl: 'http://192.168.1.12', token: 'fixed-token-123456' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('leaves the local address empty when it is not set, and rejects a bad address', () => {
    vi.stubEnv('VITE_SERVER_DOMAIN_URL', 'https://pos.hp-backup.com');
    vi.stubEnv('VITE_SERVER_LOCAL_URL', '');
    vi.stubEnv('VITE_SERVER_API_TOKEN', 'fixed-token-123456');
    expect(getServerConnection()).toEqual({ domainUrl: 'https://pos.hp-backup.com', localUrl: '', token: 'fixed-token-123456' });
    vi.stubEnv('VITE_SERVER_LOCAL_URL', '192.168.1.12');
    expect(() => getServerConnection()).toThrow('http://');
  });
});
