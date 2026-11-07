/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DocumentNumberer } from './documentNumberer';
import { DEVICE_MIGRATIONS } from '../db/deviceSchema';
import { MIGRATIONS } from '../db/schema';
import { createSqlJsTestDriver } from './sqlJsTestDriver';
import { SyncStore } from './syncStore';

const temp = { nextTempCode: async () => 'TAM-AAAA-1' };

describe('DocumentNumberer', () => {
  it('uses the official number from the server when it answers', async () => {
    const numberer = new DocumentNumberer({ nextNumber: async (_store, kind) => `${kind}-00001` }, temp);
    expect(await numberer.next('S1', 'order')).toEqual({ number: 'order-00001', tempNumber: '' });
  });

  it('falls back to a temporary code when the server fails', async () => {
    const numberer = new DocumentNumberer({ nextNumber: async () => { throw new Error('offline'); } }, temp);
    expect(await numberer.next('S1', 'order')).toEqual({ number: 'TAM-AAAA-1', tempNumber: 'TAM-AAAA-1' });
  });

  it('falls back to a temporary code when the server is too slow', async () => {
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('HD00001'), 200));
    const numberer = new DocumentNumberer({ nextNumber: () => slow }, temp, 20);
    expect((await numberer.next('S1', 'order')).tempNumber).toBe('TAM-AAAA-1');
  });

  it('reports the error in a browser, which has no temporary codes', async () => {
    const numberer = new DocumentNumberer({ nextNumber: async () => { throw new Error('Không kết nối được máy chủ'); } }, null);
    await expect(numberer.next('S1', 'order')).rejects.toThrow('Không kết nối được máy chủ');
  });
});

describe('SyncStore.nextTempCode', () => {
  it('rises by one, keeps the device tag and survives a new store object', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of [...MIGRATIONS, ...DEVICE_MIGRATIONS]) for (const statement of migration.statements) await driver.exec(statement);
    const first = new SyncStore(driver);
    const a = await first.nextTempCode();
    const b = await new SyncStore(driver).nextTempCode();
    expect(a).toMatch(/^TAM-[0-9A-F]{4}-1$/);
    expect(b).toBe(a.replace(/-1$/, '-2'));
  });
});
