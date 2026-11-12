/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiningTable, KitchenItem, KitchenStatus, Product, SelectedOption } from '../types';
import { splitTicketStock } from './kitchenStock';
import { DELIVERY_ID, resolvePrimaryId, TAKEAWAY_ID, virtualCartLabel } from './tableOps';
import { optionsSignature } from './productOptions';
import { toppingsText } from './toppings';

/** Kitchen tickets still being worked on; served or cancelled tickets are never changed. */
export const isKitchenTicketOpen = (item: KitchenItem): boolean =>
  item.status === KitchenStatus.PENDING || item.status === KitchenStatus.PREPARING || item.status === KitchenStatus.COMPLETED;

/** Fields of a kitchen ticket that a cashier can edit on a line already sent to the kitchen. */
export type KitchenEditableField = 'size' | 'options' | 'note';

/**
 * Applies a new size, options or note to the open tickets of one cart line, so the kitchen
 * screen shows what the cashier screen shows.
 *
 * @param items All kitchen tickets.
 * @param belongsToLine True for a ticket that was sent for the line before the edit.
 * @param field Ticket field to change.
 * @param value New value.
 * @returns A new list; tickets of other lines are returned as they are.
 */
export function applyLineEditToKitchen<F extends KitchenEditableField>(
  items: KitchenItem[],
  belongsToLine: (item: KitchenItem) => boolean,
  field: F,
  value: KitchenItem[F],
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

/**
 * Gives the tickets of one order a new table label, so the kitchen screen shows the merged table or the
 * table the order was moved to.
 *
 * @param items All kitchen tickets.
 * @param belongsToOrder True for a ticket of the order that changes its label.
 * @param label New label, for example "Bàn 01 + Bàn 02" or "Mang về".
 * @returns A new list; tickets of other orders are returned as they are.
 */
export function relabelKitchenTickets(
  items: KitchenItem[],
  belongsToOrder: (item: KitchenItem) => boolean,
  label: string,
): KitchenItem[] {
  return items.map(item => (belongsToOrder(item) ? { ...item, tableNumber: label } : item));
}

/**
 * Moves portions of a line from one order to another on the kitchen screen (split or join orders). Open
 * tickets are taken newest first; a ticket that moves completely only changes its label, a ticket that
 * moves in part is reduced and a copy with the same status and the new label is added. The stock the ticket took
 * is split in the same proportion.
 *
 * @param items All kitchen tickets.
 * @param belongsToLine True for a ticket sent for the line in the source order.
 * @param portions Number of sent portions that move.
 * @param toLabel Table label of the order the portions go to.
 * @param newTicketId Creates the id of a ticket copy.
 * @returns A new list.
 */
export function moveKitchenPortions(
  items: KitchenItem[],
  belongsToLine: (item: KitchenItem) => boolean,
  portions: number,
  toLabel: string,
  newTicketId: () => string,
): KitchenItem[] {
  if (portions <= 0) return items;
  const newestFirst = items
    .filter(item => isKitchenTicketOpen(item) && belongsToLine(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const changes = new Map<string, KitchenItem>();
  const copies: KitchenItem[] = [];
  let left = portions;
  for (const ticket of newestFirst) {
    if (left <= 0) break;
    const taken = Math.min(ticket.quantity, left);
    left -= taken;
    if (taken >= ticket.quantity) {
      changes.set(ticket.id, { ...ticket, tableNumber: toLabel });
    } else {
      // The stock taken for the portions that move goes with them; the rest stays on the original ticket
      const { kept, moved } = splitTicketStock(ticket, taken);
      changes.set(ticket.id, { ...ticket, quantity: ticket.quantity - taken, ...kept });
      copies.push({ ...ticket, id: newTicketId(), quantity: taken, tableNumber: toLabel, ...moved });
    }
  }
  return [...copies, ...items.map(item => changes.get(item.id) ?? item)];
}

/** A line of a cart as far as matching a kitchen ticket is concerned. */
export interface TicketLine {
  productId: string;
  quantity: number;
  note: string;
  size?: string;
  options?: SelectedOption[];
  sentQuantity?: number;
  toppings?: { productId: string; quantity: number }[];
}

/**
 * True when a kitchen ticket was sent for exactly this cart line: the same dish with the same note, size, options and toppings.
 *
 * @param ticket Kitchen ticket.
 * @param line Cart line.
 * @param products Dishes and toppings, to turn the toppings of the line into the text the ticket holds.
 * @returns Whether they match.
 */
export function ticketMatchesLine(ticket: KitchenItem, line: TicketLine, products: Product[]): boolean {
  return ticket.productId === line.productId && (ticket.note || '') === (line.note || '')
    && (ticket.size || '') === (line.size || '') && optionsSignature(ticket.options) === optionsSignature(line.options)
    && (ticket.toppings || '') === toppingsText(line, products);
}

/** True while the kitchen can still cancel a dish: it has not been made yet (waiting or being cooked). */
export const canCancelFromKitchen = (status: KitchenStatus): boolean => status === KitchenStatus.PENDING || status === KitchenStatus.PREPARING;

/**
 * Marks one kitchen ticket as cancelled.
 *
 * @param items All kitchen tickets.
 * @param ticketId Ticket to cancel.
 * @param cancelledBy Name of the person who cancelled.
 * @param now Time of the cancellation.
 * @returns A new list; the ticket is left as it is when it cannot be cancelled any more (made, served or already cancelled).
 */
export function cancelKitchenTicket(items: KitchenItem[], ticketId: string, cancelledBy: string, now: string): KitchenItem[] {
  return items.map(item => (item.id === ticketId && canCancelFromKitchen(item.status)
    ? { ...item, status: KitchenStatus.CANCELLED, cancelledAt: now, cancelledBy }
    : item));
}

/**
 * Finds the cart that holds the order a ticket belongs to, from the table label printed on the ticket.
 *
 * @param tables Dining tables.
 * @param label Table label of the ticket: "Bàn 01", "Bàn 01 + Bàn 02" for merged tables, "Mang về" or "Giao đi".
 * @returns The id of the cart (the main table of a merged group), or null when no table has that name.
 */
export function cartIdForTicketLabel(tables: DiningTable[], label: string): string | null {
  if (label === virtualCartLabel(TAKEAWAY_ID)) return TAKEAWAY_ID;
  if (label === virtualCartLabel(DELIVERY_ID)) return DELIVERY_ID;
  const first = label.split(' + ')[0];
  const table = tables.find(candidate => candidate.name === first);
  return table ? resolvePrimaryId(tables, table.id) : null;
}

/**
 * Takes the portions of a cancelled ticket off the cart: the matching line gets fewer portions (and fewer counted as
 * sent) and disappears when none are left. Other lines are returned as they are.
 *
 * @param lines Lines of the cart.
 * @param ticket The cancelled ticket.
 * @param products Dishes and toppings, to match the line.
 * @returns The new lines.
 */
export function removeCancelledTicketFromCart<L extends TicketLine>(lines: L[], ticket: KitchenItem, products: Product[]): L[] {
  const index = lines.findIndex(line => ticketMatchesLine(ticket, line, products));
  if (index === -1) return lines;
  const line = lines[index];
  const quantity = line.quantity - ticket.quantity;
  if (quantity <= 0) return lines.filter((_, i) => i !== index);
  const sent = Math.max(0, (line.sentQuantity || 0) - ticket.quantity);
  return lines.map((candidate, i) => (i === index ? { ...candidate, quantity, sentQuantity: Math.min(sent, quantity) || undefined } : candidate));
}
