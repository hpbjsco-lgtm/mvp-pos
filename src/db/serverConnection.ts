/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Address and secret of the database server (server/pos-db-server) the web app talks to. */
export interface ServerConnection {
  /** Base address without a trailing slash, for example "https://pos.hp-backup.com". */
  url: string;
  /** API token the server expects as a Bearer token. */
  token: string;
}

/** localStorage key. The setting cannot live inside the database because it decides where the database is. */
const STORAGE_KEY = 'smartpos.serverConnection';

/**
 * Cleans a server address typed by a person.
 *
 * @param input Text typed in the settings form.
 * @returns The address without surrounding spaces and without trailing slashes.
 * @throws Error when the text is not an http(s) address.
 */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) {
    throw new Error('Địa chỉ máy chủ phải bắt đầu bằng http:// hoặc https://');
  }
  return trimmed;
}

/**
 * Reads the connection fixed at build time through `VITE_SERVER_API_TOKEN` (and `VITE_SERVER_URL`, which
 * defaults to the address the app is served from).
 *
 * @returns The fixed connection, or null when no API token is configured.
 * @throws Error when `VITE_SERVER_URL` is not an http(s) address.
 */
function getConfiguredConnection(): ServerConnection | null {
  const token = ((import.meta.env.VITE_SERVER_API_TOKEN as string | undefined) ?? '').trim();
  if (!token) return null;
  const url = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').trim() || window.location.origin;
  return { url: normalizeServerUrl(url), token };
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
    if (typeof parsed?.url !== 'string' || typeof parsed?.token !== 'string') throw new Error('missing fields');
    return { url: normalizeServerUrl(parsed.url), token: parsed.token };
  } catch (error) {
    throw new Error(`Cấu hình máy chủ dữ liệu bị hỏng (${(error as Error).message}). Hãy nhập lại hoặc ngắt kết nối.`);
  }
}

/**
 * Saves the server connection; the app must be reloaded for the new database to take effect.
 *
 * @param connection Address and API token.
 * @throws Error when the address is invalid or the token is empty.
 */
export function saveServerConnection(connection: ServerConnection): void {
  const token = connection.token.trim();
  if (!token) throw new Error('Cần nhập mã API của máy chủ.');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: normalizeServerUrl(connection.url), token }));
}

/** Removes the saved connection; after a reload the app uses the database in this browser again. */
export function clearServerConnection(): void {
  localStorage.removeItem(STORAGE_KEY);
}
