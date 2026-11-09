/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { COLLECTIONS, COLLECTION_KEYS, type CollectionKey } from './collections';
import { getServerRoute } from './driver';

/** What the server says changed in a store since a log position. */
export interface ChangeSummary {
  /** Current log position of the server. */
  seq: number;
  /** Tables with changes after the position the device sent. */
  tables: string[];
  /** True when the device's position is ahead of the server's log (the database was restored): reload everything. */
  reset: boolean;
}

/** The parts of the app data that must be reloaded after some tables changed. */
export interface ReloadPlan {
  /** Collections to reload. */
  keys: CollectionKey[];
  /** True when the carts must be reloaded. */
  carts: boolean;
  /** True when the store row (its settings) must be reloaded. */
  store: boolean;
}

/** Tables that make up the carts of the tables and of takeaway orders. */
const CART_TABLES = new Set(['carts', 'cart_items']);

/**
 * Works out what to reload after the given tables changed. Tables the app does not keep in memory
 * (for example the change log or the activity log) need no reload. A change of the store row reloads the store settings.
 *
 * @param tables Table names reported by the server.
 * @returns The collections and carts to reload.
 */
export function planReload(tables: string[]): ReloadPlan {
  const changed = new Set(tables);
  const keys = COLLECTION_KEYS.filter((key) => {
    const spec = COLLECTIONS[key];
    return changed.has(spec.table) || (spec.children !== undefined && changed.has(spec.children.table));
  });
  return { keys, carts: tables.some((table) => CART_TABLES.has(table)), store: tables.includes('stores') };
}

/**
 * Asks the server which tables of a store changed after a log position.
 *
 * @param storeId Store to look at.
 * @param after Log position the device already knows; null to ask for the current position.
 * @returns The summary.
 * @throws Error when the server cannot be reached or does not answer in the expected form.
 */
export async function fetchChangeSummary(storeId: string, after: number | null): Promise<ChangeSummary> {
  const route = getServerRoute();
  if (!route) throw new Error('Chưa cấu hình máy chủ dữ liệu.');
  const query = `storeId=${encodeURIComponent(storeId)}${after === null ? '' : `&after=${after}`}`;
  const response = await route.endpoints.request(
    `/api/sync/summary?${query}`,
    { method: 'GET', headers: { Authorization: `Bearer ${route.token}` } },
    { idempotent: true },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Máy chủ trả lỗi ${response.status}.`);
  return body as ChangeSummary;
}
