/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getDriver } from '../db/driver';

/**
 * Builds the file name of an export, for example "mvp-pos-20261105-0930.db".
 *
 * @param now Time of the export.
 * @returns The file name.
 */
export function exportFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `mvp-pos-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.db`;
}

/**
 * Converts bytes to base64, the form the Filesystem plugin writes.
 *
 * @param bytes Data to convert.
 * @returns Base64 text.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/**
 * Exports the database of this device as a SQLite file and opens the share sheet, so it can be saved to
 * Files, sent by AirDrop or mail, and later restored or uploaded to the server.
 *
 * @param now Time used in the file name.
 * @returns The name of the exported file.
 * @throws Error when the device cannot produce the file or the share sheet cannot open.
 */
export async function exportDatabaseToShare(now: Date = new Date()): Promise<string> {
  const driver = await getDriver();
  const bytes = await driver.exportRawBytes();
  if (!bytes) throw new Error('Thiết bị này không xuất được file dữ liệu.');
  const fileName = exportFileName(now);
  await Filesystem.writeFile({ directory: Directory.Cache, path: fileName, data: bytesToBase64(bytes) });
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: fileName });
  await Share.share({ title: 'Sao lưu dữ liệu MVP POS', text: fileName, url: uri, dialogTitle: 'Lưu hoặc gửi file dữ liệu' });
  return fileName;
}
