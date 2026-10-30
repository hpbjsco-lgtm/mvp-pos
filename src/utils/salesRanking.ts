/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Product } from '../types';

/** Number of days of order history used to decide which products are best sellers. */
export const BEST_SELLER_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counts units sold per product over the last `windowDays` days. Voided orders are ignored.
 * @param orders All orders.
 * @param now Current time in epoch milliseconds (a parameter so tests stay deterministic).
 * @param windowDays Length of the window counted back from `now`.
 * @returns Map of product id to units sold.
 */
export function countUnitsSold(orders: Order[], now: number, windowDays: number = BEST_SELLER_WINDOW_DAYS): Map<string, number> {
  const since = now - windowDays * DAY_MS;
  const sold = new Map<string, number>();
  for (const order of orders) {
    if ((order.status || 'completed') === 'void') continue;
    const at = new Date(order.createdAt).getTime();
    if (!(at >= since)) continue;
    for (const item of order.items) {
      sold.set(item.productId, (sold.get(item.productId) || 0) + item.quantity);
    }
  }
  return sold;
}

/**
 * Returns a copy of `products` with the best sellers first. Products with equal sales
 * (including products never sold) keep their original relative order.
 */
export function sortByBestSeller<T extends Pick<Product, 'id'>>(products: T[], orders: Order[], now: number): T[] {
  const sold = countUnitsSold(orders, now);
  return products
    .map((product, index) => ({ product, index, units: sold.get(product.id) || 0 }))
    .sort((a, b) => b.units - a.units || a.index - b.index)
    .map(entry => entry.product);
}
