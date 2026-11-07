/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Preferences } from '@capacitor/preferences';
import { normalizeOptionalServerUrl } from '../db/serverConnection';

/**
 * Where a phone app keeps its data:
 *  - `unset`: nothing chosen yet; the app works on the database of the device only.
 *  - `standalone`: "Không dùng máy chủ": the database of the device is the only source.
 *  - `server`: the device database is kept in step with the database server (domain first, then the local address).
 */
export type NativeDataMode = 'unset' | 'standalone' | 'server';

/** Settings of a phone app, entered on the configuration screen. */
export interface NativeSettings {
  mode: NativeDataMode;
  /** Address through the internet, for example "https://pos.hp-backup.com"; empty when unused. */
  domainUrl: string;
  /** Address inside the shop network, for example "http://192.168.1.12:8790"; empty when unused. */
  localUrl: string;
  /** API token of the server. */
  token: string;
  /** Store this device keeps in step with the server; empty until one is chosen. */
  storeId: string;
  /** Name of that store, shown on the configuration screen. */
  storeName: string;
}

/** Preferences key. Preferences survive when the system clears the web view storage, unlike localStorage. */
const STORAGE_KEY = 'smartpos.nativeSettings';

/** What a phone app uses until someone configures it. */
export const DEFAULT_NATIVE_SETTINGS: NativeSettings = { mode: 'unset', domainUrl: '', localUrl: '', token: '', storeId: '', storeName: '' };

/** Settings read at start-up; the app reads them synchronously afterwards. */
let current: NativeSettings = DEFAULT_NATIVE_SETTINGS;

/**
 * Checks and cleans settings typed on the configuration screen.
 *
 * @param input Settings as entered (a saved value from an older app version may lack the store fields).
 * @param requireStore True when saving: server mode then also needs a chosen store. Loading does not require it,
 *   so an app configured before stores could be chosen still starts and asks for the store.
 * @returns Settings with trimmed token and normalised addresses (a trailing "/api" and slashes removed).
 * @throws Error with a readable message when the mode is unknown, an address is not an http(s) address,
 *   or server mode lacks an address, the token or (when `requireStore`) the store.
 */
export function validateNativeSettings(input: Omit<NativeSettings, 'storeId' | 'storeName'> & Partial<Pick<NativeSettings, 'storeId' | 'storeName'>>, requireStore = false): NativeSettings {
  if (input.mode !== 'unset' && input.mode !== 'standalone' && input.mode !== 'server') throw new Error('Cách dùng dữ liệu không hợp lệ.');
  const domainUrl = normalizeOptionalServerUrl(input.domainUrl);
  const localUrl = normalizeOptionalServerUrl(input.localUrl);
  const token = input.token.trim();
  if (input.mode === 'server') {
    if (!domainUrl && !localUrl) throw new Error('Cần nhập ít nhất một địa chỉ máy chủ (domain hoặc IP nội bộ).');
    if (!token) throw new Error('Cần nhập mã API của máy chủ.');
    if (requireStore && !(input.storeId ?? '').trim()) throw new Error('Hãy chọn cửa hàng cần đồng bộ (bấm "Kiểm tra kết nối" để tải danh sách).');
  }
  return { mode: input.mode, domainUrl, localUrl, token, storeId: (input.storeId ?? '').trim(), storeName: (input.storeName ?? '').trim() };
}

/**
 * Reads the saved settings from the device. Call it once before the app starts.
 *
 * @returns The saved settings, or the defaults when nothing was saved.
 * @throws Error when the saved value is damaged, so the app does not silently work on another database.
 */
export async function loadNativeSettings(): Promise<NativeSettings> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) {
    current = DEFAULT_NATIVE_SETTINGS;
    return current;
  }
  try {
    current = validateNativeSettings(JSON.parse(value));
  } catch (error) {
    throw new Error(`Cấu hình kết nối của ứng dụng bị hỏng (${(error as Error).message}). Hãy cài đặt lại ứng dụng hoặc xóa dữ liệu ứng dụng.`);
  }
  return current;
}

/**
 * @returns The settings read at start-up (the defaults before `loadNativeSettings` ran).
 */
export function getNativeSettings(): NativeSettings {
  return current;
}

/**
 * Checks and saves the settings on the device.
 *
 * @param input Settings as entered.
 * @returns The settings as saved.
 * @throws Error when the settings are not valid (see `validateNativeSettings`).
 */
export async function saveNativeSettings(input: NativeSettings): Promise<NativeSettings> {
  const valid = validateNativeSettings(input, true);
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(valid) });
  current = valid;
  return valid;
}
