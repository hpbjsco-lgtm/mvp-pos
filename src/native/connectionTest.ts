/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Result of testing one address. */
export interface AddressTestResult {
  /** Address that was tested. */
  url: string;
  ok: boolean;
  /** What happened, in words the person can act on. */
  message: string;
}

/** Longest wait for one address, in milliseconds. */
const TEST_TIMEOUT_MS = 5000;

/**
 * Tests one server address: the server must answer its health check and accept the API token.
 *
 * @param url Server address without a trailing slash.
 * @param token API token to try.
 * @param fetchImpl HTTP function; replaced in tests.
 * @returns The result for this address; never throws.
 */
export async function testServerAddress(url: string, token: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<AddressTestResult> {
  const call = async (path: string, init: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      return await fetchImpl(`${url}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const health = await call('/api/health', { method: 'GET' });
    if (!health.ok) return { url, ok: false, message: `Máy chủ trả mã ${health.status} ở /api/health.` };
    const probe = await call('/api/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'all', sql: 'SELECT 1 AS ok' }),
    });
    if (probe.status === 401) return { url, ok: false, message: 'Máy chủ có phản hồi nhưng mã API không đúng.' };
    if (!probe.ok) return { url, ok: false, message: `Máy chủ trả mã ${probe.status} khi thử truy vấn.` };
    return { url, ok: true, message: 'Kết nối được, mã API hợp lệ.' };
  } catch (error) {
    const reason = (error as Error).name === 'AbortError' ? `không phản hồi sau ${TEST_TIMEOUT_MS / 1000} giây` : (error as Error).message;
    return { url, ok: false, message: `Không kết nối được: ${reason}.` };
  }
}
