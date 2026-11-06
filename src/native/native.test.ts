import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
  },
}));

const filesystem = { written: [] as { path: string; data: string }[] };
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    writeFile: async (options: { path: string; data: string }) => { filesystem.written.push(options); },
    getUri: async ({ path }: { path: string }) => ({ uri: `file:///cache/${path}` }),
  },
}));
const shared: unknown[] = [];
vi.mock('@capacitor/share', () => ({ Share: { share: async (options: unknown) => { shared.push(options); } } }));
let exported: Uint8Array | null = Uint8Array.from([83, 81, 76]);
vi.mock('../db/driver', () => ({ getDriver: async () => ({ exportRawBytes: async () => exported }) }));

import { testServerAddress } from './connectionTest';
import { bytesToBase64, exportDatabaseToShare, exportFileName } from './exportDatabase';
import { DEFAULT_NATIVE_SETTINGS, getNativeSettings, loadNativeSettings, saveNativeSettings, validateNativeSettings } from './nativeSettings';

beforeEach(() => {
  store.clear();
  filesystem.written.length = 0;
  shared.length = 0;
  exported = Uint8Array.from([83, 81, 76]);
});

describe('native settings', () => {
  it('starts unset, which means the device database only', async () => {
    expect(await loadNativeSettings()).toEqual(DEFAULT_NATIVE_SETTINGS);
    expect(getNativeSettings().mode).toBe('unset');
  });

  it('saves normalised addresses and reads them back after a restart', async () => {
    await saveNativeSettings({ mode: 'server', domainUrl: ' https://pos.hp-backup.com/api/ ', localUrl: 'http://192.168.1.12:8790/', token: ' secret-token ' });
    expect(getNativeSettings()).toEqual({ mode: 'server', domainUrl: 'https://pos.hp-backup.com', localUrl: 'http://192.168.1.12:8790', token: 'secret-token' });
    expect(await loadNativeSettings()).toEqual(getNativeSettings());
  });

  it('accepts standalone mode without any address or token', async () => {
    await saveNativeSettings({ mode: 'standalone', domainUrl: '', localUrl: '', token: '' });
    expect(getNativeSettings().mode).toBe('standalone');
  });

  it('allows a server with only a domain or only a local address', () => {
    expect(validateNativeSettings({ mode: 'server', domainUrl: 'https://a.example.com', localUrl: '', token: 't' }).localUrl).toBe('');
    expect(validateNativeSettings({ mode: 'server', domainUrl: '', localUrl: 'http://192.168.1.12', token: 't' }).domainUrl).toBe('');
  });

  it('rejects server mode without an address or a token, and a bad address', () => {
    expect(() => validateNativeSettings({ mode: 'server', domainUrl: '', localUrl: '', token: 't' })).toThrow('địa chỉ');
    expect(() => validateNativeSettings({ mode: 'server', domainUrl: 'https://a.example.com', localUrl: '', token: ' ' })).toThrow('mã API');
    expect(() => validateNativeSettings({ mode: 'server', domainUrl: '192.168.1.12', localUrl: '', token: 't' })).toThrow('http');
    expect(() => validateNativeSettings({ mode: 'nope' as never, domainUrl: '', localUrl: '', token: '' })).toThrow('không hợp lệ');
  });

  it('fails loudly on a damaged saved value', async () => {
    store.set('smartpos.nativeSettings', '{"mode":"server","domainUrl":"","localUrl":"","token":""}');
    await expect(loadNativeSettings()).rejects.toThrow('bị hỏng');
  });
});

describe('testServerAddress', () => {
  const answer = (statuses: Record<string, number | 'down'>) => (async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '');
    const status = statuses[path];
    if (status === 'down') throw new TypeError('Failed to fetch');
    return new Response('{}', { status: status ?? 200 });
  }) as typeof fetch;

  it('accepts a server that answers and knows the token', async () => {
    expect(await testServerAddress('http://x', 't', answer({}))).toMatchObject({ ok: true });
  });
  it('tells a wrong token from an unreachable server', async () => {
    expect((await testServerAddress('http://x', 't', answer({ '/api/sql': 401 }))).message).toContain('mã API');
    expect((await testServerAddress('http://x', 't', answer({ '/api/health': 'down' }))).message).toContain('Không kết nối được');
  });
  it('reports an unhealthy server', async () => {
    expect((await testServerAddress('http://x', 't', answer({ '/api/health': 503 }))).message).toContain('503');
  });
});

describe('export', () => {
  it('names the file with the date and time', () => {
    expect(exportFileName(new Date(2026, 10, 5, 9, 7))).toBe('mvp-pos-20261105-0907.db');
  });
  it('encodes bytes as base64, also for large data', () => {
    expect(bytesToBase64(Uint8Array.from([83, 81, 76]))).toBe('U1FM');
    expect(bytesToBase64(new Uint8Array(100000)).length).toBe(Math.ceil(100000 / 3) * 4);
  });
  it('writes the database to a file and opens the share sheet', async () => {
    const name = await exportDatabaseToShare(new Date(2026, 10, 5, 9, 7));
    expect(name).toBe('mvp-pos-20261105-0907.db');
    expect(filesystem.written).toEqual([{ directory: 'CACHE', path: name, data: 'U1FM' }]);
    expect(shared[0]).toMatchObject({ url: `file:///cache/${name}` });
  });
  it('says so when the device cannot produce the file', async () => {
    exported = null;
    await expect(exportDatabaseToShare()).rejects.toThrow('không xuất được');
  });
});
