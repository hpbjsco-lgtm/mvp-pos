/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SalesChannel } from '../types';

/**
 * Keeps a discount typed for a line between nothing and the value of the line.
 *
 * @param amount Discount typed for the whole line, in money.
 * @param lineValue Price of the line (unit price x portions).
 * @returns A whole number of 0 or more that is not more than the value of the line.
 */
export function clampLineDiscount(amount: number, lineValue: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(Math.round(amount), Math.max(0, Math.round(lineValue)));
}

/**
 * Commission a sales channel keeps from an order.
 *
 * @param orderTotal What the customer pays for the order.
 * @param percent Commission of the channel, 0 to 100.
 * @returns The commission, rounded to a whole amount of money.
 */
export function commissionOf(orderTotal: number, percent: number): number {
  if (!(percent > 0) || !(orderTotal > 0)) return 0;
  return Math.round((orderTotal * Math.min(percent, 100)) / 100);
}

/**
 * Reads the list of sales channels saved with a store.
 *
 * @param json Text saved in the store row; empty for a store without channels.
 * @returns The channels; an empty list when nothing is saved or the text is damaged.
 */
export function parseSalesChannels(json: string | null | undefined): SalesChannel[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is { name: unknown; commissionPercent: unknown } => !!entry && typeof entry === 'object')
      .map(entry => ({ name: String(entry.name ?? '').trim(), commissionPercent: Number(entry.commissionPercent) || 0 }))
      .filter(channel => channel.name !== '');
  } catch {
    return [];
  }
}

/**
 * Checks a list of channels before it is saved.
 *
 * @param channels Channels typed on the settings screen.
 * @returns The channels with trimmed names.
 * @throws {Error} With a readable message when a name is empty or used twice, or a commission is not between 0 and 100.
 */
export function validateSalesChannels(channels: SalesChannel[]): SalesChannel[] {
  const seen = new Set<string>();
  return channels.map(channel => {
    const name = channel.name.trim();
    if (!name) throw new Error('Tên kênh bán không được để trống.');
    if (seen.has(name.toLowerCase())) throw new Error(`Kênh "${name}" bị trùng tên.`);
    seen.add(name.toLowerCase());
    if (!Number.isFinite(channel.commissionPercent) || channel.commissionPercent < 0 || channel.commissionPercent > 100) {
      throw new Error(`Chiết khấu của kênh "${name}" phải từ 0 đến 100%.`);
    }
    return { name, commissionPercent: channel.commissionPercent };
  });
}
