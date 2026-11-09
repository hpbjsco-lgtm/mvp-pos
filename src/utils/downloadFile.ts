/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Capacitor } from '@capacitor/core';

/**
 * Gives the person a text file: a browser downloads it, a phone app opens the share sheet so it can be saved to
 * Files or sent by mail.
 *
 * @param fileName Name of the file, for example "kho-hang-hoa-20261109.csv".
 * @param content Text of the file.
 * @param mimeType Type of the file.
 * @throws Error when the phone cannot write the file or open the share sheet.
 */
export async function saveTextFile(fileName: string, content: string, mimeType = 'text/csv;charset=utf-8'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({ directory: Directory.Cache, path: fileName, data: content, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: fileName });
    await Share.share({ title: fileName, url: uri, dialogTitle: 'Lưu hoặc gửi file' });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Builds a file name with today's date, for example "kho-hang-hoa-20261109.csv".
 *
 * @param prefix Start of the name.
 * @param now Date to use.
 * @returns The file name.
 */
export function datedFileName(prefix: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
}
