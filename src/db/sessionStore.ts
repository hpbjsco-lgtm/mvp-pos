/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * localStorage key of the signed-in user. The session is kept per browser and not in the database,
 * because devices that share one database server must each have their own signed-in user.
 */
const STORAGE_KEY = 'smartpos.sessionUid';

/**
 * Reads the user signed in on this device.
 *
 * @returns The user id, or an empty string when nobody is signed in.
 */
export function getSessionUid(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

/**
 * Remembers the user signed in on this device.
 *
 * @param uid User id.
 */
export function setSessionUid(uid: string): void {
  localStorage.setItem(STORAGE_KEY, uid);
}

/** Forgets the signed-in user of this device. */
export function clearSessionUid(): void {
  localStorage.removeItem(STORAGE_KEY);
}
