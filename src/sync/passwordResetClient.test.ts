/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ServerEndpoints } from '../db/serverEndpoints';
import { SyncClient, SyncRequestError } from './syncClient';

/** Builds a client whose server is a function from request to answer. */
function clientFor(handler: (path: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Array<{ path: string; body: any }> = [];
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const path = String(input).replace('http://server', '');
    if (path === '/api/health') return new Response('{}', { status: 200 });
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const answer = handler(path, init);
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { client: new SyncClient(new ServerEndpoints({ domainUrl: 'http://server', localUrl: '' }, { fetchImpl, pageOrigin: 'http://page' }), 'token-0123456789abcdef'), calls };
}

describe('password reset calls', () => {
  it('knows whether the server can mail codes, and treats an old server or an error as "no"', async () => {
    expect(await clientFor(() => ({ body: { passwordReset: true } })).client.passwordResetAvailable()).toBe(true);
    expect(await clientFor(() => ({ body: { passwordReset: false } })).client.passwordResetAvailable()).toBe(false);
    expect(await clientFor(() => ({ status: 404, body: { error: 'not found' } })).client.passwordResetAvailable()).toBe(false);
  });

  it('asks for a code with the login typed', async () => {
    const { client, calls } = clientFor(() => ({ body: { ok: true } }));
    await client.requestPasswordReset('owner1');
    expect(calls).toEqual([{ path: '/api/auth/forgot', body: { login: 'owner1' } }]);
  });

  it('sends the code with a salt and a hash, never the password itself', async () => {
    const { client, calls } = clientFor(() => ({ body: { ok: true } }));
    await client.resetPassword('owner1', '123456', 'new-secret-password');
    expect(calls[0].path).toBe('/api/auth/reset');
    expect(calls[0].body).toMatchObject({ login: 'owner1', code: '123456' });
    expect(calls[0].body.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(calls[0].body.hash.length).toBeGreaterThanOrEqual(16);
    expect(JSON.stringify(calls[0].body)).not.toContain('new-secret-password');
  });

  it('reports a wrong code with its code', async () => {
    const { client } = clientFor(() => ({ status: 400, body: { error: 'Mã không đúng hoặc đã hết hạn.', code: 'INVALID_CODE' } }));
    await expect(client.resetPassword('owner1', '000000', 'new-secret-password')).rejects.toMatchObject({ code: 'INVALID_CODE', message: 'Mã không đúng hoặc đã hết hạn.' });
    await expect(client.resetPassword('owner1', '000000', 'new-secret-password')).rejects.toBeInstanceOf(SyncRequestError);
  });
});
