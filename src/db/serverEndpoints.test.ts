import { describe, expect, it } from 'vitest';
import { ServerEndpoints } from './serverEndpoints';

const DOMAIN = 'https://pos.example.com';
const LOCAL = 'http://192.168.1.12';

/** A fake network: each address is up or down, and every call is recorded. */
function fakeNetwork(initial: Record<string, 'up' | 'down' | number | 'timeout'>) {
  const state = { ...initial };
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const origin = Object.keys(state).find((address) => url.startsWith(address))!;
    const mode = state[origin];
    if (mode === 'down') throw new TypeError('Failed to fetch');
    if (mode === 'timeout') throw new DOMException('aborted', 'AbortError');
    if (typeof mode === 'number') return new Response(JSON.stringify({ error: 'x' }), { status: mode });
    return new Response(JSON.stringify({ ok: true, from: origin }), { status: 200 });
  }) as typeof fetch;
  return { state, calls, fetchImpl };
}

const read = { idempotent: true };
const write = { idempotent: false };
const json = async (response: Response) => response.json();

describe('ServerEndpoints', () => {
  it('uses the domain when it answers', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'up', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl });
    expect((await json(await endpoints.request('/api/sql', { method: 'POST' }, write))).from).toBe(DOMAIN);
    expect(endpoints.activeRoute).toBe('domain');
    expect(net.calls.some((call) => call.includes(LOCAL))).toBe(false);
  });

  it('starts on the local address when the domain is down, without asking the domain again for every request', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, now: () => 0 });
    expect((await json(await endpoints.request('/api/sql', { method: 'POST' }, write))).from).toBe(LOCAL);
    await endpoints.request('/api/sql', { method: 'POST' }, write);
    await endpoints.request('/api/sql', { method: 'POST' }, write);
    expect(net.calls.filter((call) => call.startsWith('GET') && call.includes(DOMAIN))).toHaveLength(1);
    expect(endpoints.activeRoute).toBe('local');
  });

  it('switches to the local address at once when the domain drops during use, and repeats the request there', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'up', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, now: () => 0 });
    await endpoints.request('/api/sql', { method: 'POST' }, write);
    net.state[DOMAIN] = 'down';
    const answer = await json(await endpoints.request('/api/sql', { method: 'POST' }, write));
    expect(answer.from).toBe(LOCAL);
    expect(endpoints.activeRoute).toBe('local');
  });

  it('treats a gateway or Cloudflare "origin down" status as unreachable but a normal error as an answer', async () => {
    const net = fakeNetwork({ [DOMAIN]: 522, [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl });
    // The health check of the domain answers 522, so the first request goes to the local address.
    expect((await json(await endpoints.request('/api/sql', { method: 'POST' }, read))).from).toBe(LOCAL);

    const answering = fakeNetwork({ [DOMAIN]: 'up', [LOCAL]: 'up' });
    const second = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: answering.fetchImpl });
    await second.request('/api/sql', { method: 'POST' }, read);
    answering.state[DOMAIN] = 500;
    const response = await second.request('/api/sql', { method: 'POST' }, write);
    expect(response.status).toBe(500);
    expect(second.activeRoute).toBe('domain');
  });

  it('does not fail over on 401', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'up', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl });
    await endpoints.request('/api/sql', { method: 'POST' }, read);
    net.state[DOMAIN] = 401;
    expect((await endpoints.request('/api/sql', { method: 'POST' }, read)).status).toBe(401);
    expect(endpoints.activeRoute).toBe('domain');
  });

  it('repeats a read that timed out on the other address but never repeats a write', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'up', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, now: () => 0 });
    await endpoints.request('/api/sql', { method: 'POST' }, read);
    net.state[DOMAIN] = 'timeout';
    await expect(endpoints.request('/api/sql', { method: 'POST' }, write)).rejects.toThrow('có thể đã được lưu');
    expect(net.calls.filter((call) => call.startsWith('POST') && call.includes(LOCAL))).toHaveLength(0);
    // The read goes through: its timeout counts as unreachable and the local health check answers.
    expect((await json(await endpoints.request('/api/sql', { method: 'POST' }, read))).from).toBe(LOCAL);
  });

  it('goes back to the domain once it answers again', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down', [LOCAL]: 'up' });
    let time = 0;
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, now: () => time, domainRecheckMs: 15000 });
    await endpoints.request('/api/sql', { method: 'POST' }, read);
    net.state[DOMAIN] = 'up';
    time = 5000;
    await endpoints.request('/api/sql', { method: 'POST' }, read);
    expect(endpoints.activeRoute).toBe('local');
    time = 20000;
    await endpoints.request('/api/sql', { method: 'POST' }, read);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(endpoints.activeRoute).toBe('domain');
  });

  it('reports both addresses when neither answers', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down', [LOCAL]: 'down' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl });
    await expect(endpoints.request('/api/sql', { method: 'POST' }, read)).rejects.toThrow(/cả hai địa chỉ.*pos\.example\.com.*192\.168\.1\.12/);
  });

  it('works with only a domain and says which address failed', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: '' }, { fetchImpl: net.fetchImpl });
    await expect(endpoints.request('/api/sql', { method: 'POST' }, read)).rejects.toThrow(/địa chỉ này.*pos\.example\.com/);
  });

  it('explains why the local address failed: a page opened over https cannot call http', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, pageOrigin: 'https://pos.example.com' });
    const error = await endpoints.request('/api/sql', { method: 'POST' }, read).catch((caught: Error) => caught);
    expect((error as Error).message).toMatch(/trình duyệt chặn.*https.*http/);
    expect((error as Error).message).toContain('Trang đang mở tại https://pos.example.com');
    expect(net.calls.some((call) => call.includes(LOCAL))).toBe(false);
  });

  it('still reaches the local address from a page opened over http', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down', [LOCAL]: 'up' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, pageOrigin: 'http://192.168.1.12' });
    expect((await json(await endpoints.request('/api/sql', { method: 'POST' }, read))).from).toBe(LOCAL);
  });

  it('puts the reason of a failed local check in the error', async () => {
    const net = fakeNetwork({ [DOMAIN]: 'down', [LOCAL]: 'down' });
    const endpoints = new ServerEndpoints({ domainUrl: DOMAIN, localUrl: LOCAL }, { fetchImpl: net.fetchImpl, pageOrigin: 'http://localhost:3000' });
    const error = await endpoints.request('/api/sql', { method: 'POST' }, read).catch((caught: Error) => caught);
    expect((error as Error).message).toContain('Failed to fetch');
    expect((error as Error).message).toContain('Trang đang mở tại http://localhost:3000');
  });
});
