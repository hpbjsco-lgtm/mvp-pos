/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order } from '../types';
import { presetRange } from './cashbook';

/** Period selected on the revenue report: today, this month or this year. */
export type ReportPeriod = 'daily' | 'monthly' | 'yearly';

/** One bar of the revenue chart. */
export interface RevenuePoint {
  /** Short label under the bar, e.g. "T2", "Th5" or "2026". */
  label: string;
  /** Sum of the order totals that fall in this bar. */
  value: number;
}

/** Number of bars drawn for each period. */
const CHART_BAR_COUNT: Record<ReportPeriod, number> = { daily: 7, monthly: 6, yearly: 4 };

/** Weekday labels indexed by `Date.getDay()` (0 = Sunday). */
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * Reads the creation time of an order.
 *
 * @param order Order to read.
 * @returns Creation time as a local `Date`.
 * @throws Error when `createdAt` is not a valid date, so a damaged row is not silently counted as zero.
 */
function orderDate(order: Order): Date {
  const date = new Date(order.createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Đơn ${order.orderNumber || order.id} có ngày tạo không hợp lệ: "${order.createdAt}".`);
  }
  return date;
}

/**
 * Keeps the orders created in the current day, month or year (local time of the device).
 * Voided orders are not removed here; the caller decides which statuses count.
 *
 * @param orders Orders to filter.
 * @param period Selected period.
 * @param now Reference time, defaults to the current time.
 * @returns Orders whose creation time is inside the period.
 * @throws Error when an order has an invalid `createdAt`.
 */
export function filterOrdersInPeriod(orders: Order[], period: ReportPeriod, now: Date = new Date()): Order[] {
  const preset = period === 'daily' ? 'today' : period === 'monthly' ? 'month' : 'year';
  const { from, to } = presetRange(preset, now);
  return orders.filter(order => {
    const time = orderDate(order).getTime();
    return time >= from && time <= to;
  });
}

/**
 * Builds the bars of the revenue chart from real orders, oldest bar first and the current
 * day / month / year last: the last 7 days, 6 months or 4 years.
 *
 * @param orders Orders to add up (voided ones must be removed by the caller).
 * @param period Selected period.
 * @param now Reference time, defaults to the current time.
 * @returns One point per bar, with 0 for bars that have no orders.
 * @throws Error when an order has an invalid `createdAt`.
 */
export function buildRevenueSeries(orders: Order[], period: ReportPeriod, now: Date = new Date()): RevenuePoint[] {
  const count = CHART_BAR_COUNT[period];
  const slots: { key: string; label: string; value: number }[] = [];

  for (let back = count - 1; back >= 0; back--) {
    const slotDate = new Date(now);
    if (period === 'daily') {
      slotDate.setDate(now.getDate() - back);
      slots.push({ key: slotKey(slotDate, period), label: WEEKDAY_LABELS[slotDate.getDay()], value: 0 });
    } else if (period === 'monthly') {
      slotDate.setDate(1);
      slotDate.setMonth(now.getMonth() - back);
      slots.push({ key: slotKey(slotDate, period), label: `Th${slotDate.getMonth() + 1}`, value: 0 });
    } else {
      slotDate.setDate(1);
      slotDate.setFullYear(now.getFullYear() - back);
      slots.push({ key: slotKey(slotDate, period), label: String(slotDate.getFullYear()), value: 0 });
    }
  }

  const slotByKey = new Map(slots.map(slot => [slot.key, slot]));
  for (const order of orders) {
    const slot = slotByKey.get(slotKey(orderDate(order), period));
    if (slot) slot.value += order.totalAmount;
  }
  return slots.map(({ label, value }) => ({ label, value }));
}

/**
 * Identifies the bar a date belongs to.
 *
 * @param date Local date.
 * @param period Selected period.
 * @returns "YYYY-M-D", "YYYY-M" or "YYYY" depending on the period.
 */
function slotKey(date: Date, period: ReportPeriod): string {
  if (period === 'daily') return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (period === 'monthly') return `${date.getFullYear()}-${date.getMonth()}`;
  return String(date.getFullYear());
}
