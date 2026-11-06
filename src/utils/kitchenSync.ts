/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KitchenItem, KitchenStatus } from '../types';

/** Kitchen tickets still being worked on; served or cancelled tickets are never changed. */
export const isKitchenTicketOpen = (item: KitchenItem): boolean =>
  item.status === KitchenStatus.PENDING || item.status === KitchenStatus.PREPARING || item.status === KitchenStatus.COMPLETED;

/** Fields of a kitchen ticket that a cashier can edit on a line already sent to the kitchen. */
export type KitchenEditableField = 'size' | 'sugarLevel' | 'iceLevel' | 'note';

/**
 * Applies a new size, sugar level, ice level or note to the open tickets of one cart line, so the kitchen
 * screen shows what the cashier screen shows.
 *
 * @param items All kitchen tickets.
 * @param belongsToLine True for a ticket that was sent for the line before the edit.
 * @param field Ticket field to change.
 * @param value New value.
 * @returns A new list; tickets of other lines are returned as they are.
 */
export function applyLineEditToKitchen(
  items: KitchenItem[],
  belongsToLine: (item: KitchenItem) => boolean,
  field: KitchenEditableField,
  value: string,
): KitchenItem[] {
  return items.map(item => (isKitchenTicketOpen(item) && belongsToLine(item) ? { ...item, [field]: value } : item));
}

/**
 * Takes portions off the open tickets of one cart line, newest ticket first. A ticket that reaches zero is
 * marked cancelled; a ticket with portions left keeps its status and the smaller quantity.
 *
 * @param items All kitchen tickets.
 * @param belongsToLine True for a ticket sent for the line.
 * @param portions Number of portions that left the line (removed, moved to another line or given up).
 * @param cancelledBy Name of the staff member, stored on tickets that get cancelled.
 * @param now Time stored on tickets that get cancelled.
 * @returns A new list; tickets of other lines are returned as they are.
 */
export function removePortionsFromKitchen(
  items: KitchenItem[],
  belongsToLine: (item: KitchenItem) => boolean,
  portions: number,
  cancelledBy: string,
  now: string,
): KitchenItem[] {
  if (portions <= 0) return items;
  const newestFirst = items
    .filter(item => isKitchenTicketOpen(item) && belongsToLine(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const changes = new Map<string, KitchenItem>();
  let left = portions;
  for (const ticket of newestFirst) {
    if (left <= 0) break;
    const taken = Math.min(ticket.quantity, left);
    left -= taken;
    changes.set(
      ticket.id,
      taken >= ticket.quantity
        ? { ...ticket, status: KitchenStatus.CANCELLED, cancelledAt: now, cancelledBy }
        : { ...ticket, quantity: ticket.quantity - taken },
    );
  }
  return items.map(item => changes.get(item.id) ?? item);
}
