/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Addresses and secret of the database server (server/pos-db-server) the web app talks to. */
export interface ServerConnection {
  /** Address through the internet, without a trailing slash, for example "https://pos.hp-backup.com". Tried first. */
  domainUrl: string;
  /** Address inside the shop network, for example "http://192.168.1.12"; empty when there is none. Used when the domain cannot be reached. */
  localUrl: string;
  /** API token the server expects as a Bearer token. */
  token: string;
}

/** localStorage key. The setting cannot live inside the database because it decides where the database is. */
const STORAGE_KEY = 'smartpos.serverConnection';

/**
 * Cleans a server address typed by a person. A trailing "/api" is dropped, because the app adds the
 * API paths itself and people copy the address together with it.
 *
 * @param input Text typed in the settings form or set in the environment.
 * @returns The address without surrounding spaces, without trailing slashes and without a trailing "/api".
 * @throws Error when the text is not an http(s) address.
 */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) {
    throw new Error('Địa chỉ máy chủ phải bắt đầu bằng http:// hoặc https://');
  }
  return trimmed;
}

/**
 * Cleans an optional server address.
 *
 * @param input Address, or empty text for "none".
 * @returns The cleaned address, or an empty string when the input is empty.
 * @throws Error when the text is not empty and not an http(s) address.
 */
export function normalizeOptionalServerUrl(input: string): string {
  return input.trim() ? normalizeServerUrl(input) : '';
}

/**
 * Reads the connection fixed at build time: `VITE_SERVER_API_TOKEN`, `VITE_SERVER_DOMAIN_URL` (the
 * address the app is served from when empty, which is what `npm run dev` with the proxy needs) and
 * `VITE_SERVER_LOCAL_URL` (optional).
 *
 * @returns The fixed connection, or null when no API token is configured.
 * @throws Error when an address is not an http(s) address.
 */
function getConfiguredConnection(): ServerConnection | null {
  const token = ((import.meta.env.VITE_SERVER_API_TOKEN as string | undefined) ?? '').trim();
  if (!token) return null;
  const domainUrl = ((import.meta.env.VITE_SERVER_DOMAIN_URL as string | undefined) ?? '').trim() || window.location.origin;
  const localUrl = (import.meta.env.VITE_SERVER_LOCAL_URL as string | undefined) ?? '';
  return { domainUrl: normalizeServerUrl(domainUrl), localUrl: normalizeOptionalServerUrl(localUrl), token };
}

/**
 * Reads the server connection: the one fixed at build time wins over the one saved in this browser.
 *
 * @returns The connection, or null when the app is set to use the database in this browser.
 * @throws Error when the saved value is damaged, so the app does not silently fall back to another database.
 */
export function getServerConnection(): ServerConnection | null {
  const configured = getConfiguredConnection();
  if (configured) return configured;
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.domainUrl !== 'string' || typeof parsed?.localUrl !== 'string' || typeof parsed?.token !== 'string') throw new Error('missing fields');
    return { domainUrl: normalizeServerUrl(parsed.domainUrl), localUrl: normalizeOptionalServerUrl(parsed.localUrl), token: parsed.token };
  } catch (error) {
    throw new Error(`Cấu hình máy chủ dữ liệu bị hỏng (${(error as Error).message}). Hãy nhập lại hoặc ngắt kết nối.`);
  }
}

/**
 * Saves the server connection; the app must be reloaded for the new database to take effect.
 *
 * @param connection Addresses and API token.
 * @throws Error when an address is invalid, the domain address is empty or the token is empty.
 */
export function saveServerConnection(connection: ServerConnection): void {
  const token = connection.token.trim();
  if (!token) throw new Error('Cần nhập mã API của máy chủ.');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    domainUrl: normalizeServerUrl(connection.domainUrl),
    localUrl: normalizeOptionalServerUrl(connection.localUrl),
    token,
  }));
}

/** Removes the saved connection; after a reload the app uses the database in this browser again. */
export function clearServerConnection(): void {
  localStorage.removeItem(STORAGE_KEY);
}
