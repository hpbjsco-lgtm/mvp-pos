/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KitchenItem } from '../types';
import { optionsText } from '../utils/productOptions';
import { ReceiptBlock, ReceiptDocument } from './receiptDocument';

/** Everything printed on a kitchen ticket. */
export interface KitchenTicketInput {
  /** Table the dishes are for, shown large; empty for takeaway. */
  tableName: string;
  /** Person who sent the dishes to the kitchen. */
  staffName: string;
  /** Items of one "send to kitchen" action. */
  items: KitchenItem[];
  /** Time the dishes were sent. */
  sentAt: Date;
}

/**
 * Lays out a kitchen ticket: the table in large letters, then one entry per dish with its quantity,
 * options and notes. Prices are left out because the kitchen does not need them.
 *
 * @param input Table, sender, items and time.
 * @returns The ticket as receipt blocks.
 * @throws Error when there are no items, since an empty ticket is a bug in the caller.
 */
export function buildKitchenTicketDocument(input: KitchenTicketInput): ReceiptDocument {
  if (input.items.length === 0) throw new Error('Phiếu bếp không có món nào để in.');
  const blocks: ReceiptBlock[] = [];
  const text = (value: string, options: { size?: 'small' | 'normal' | 'large'; bold?: boolean; align?: 'left' | 'center' } = {}) => {
    blocks.push({ kind: 'text', text: value, align: options.align ?? 'left', size: options.size ?? 'normal', bold: options.bold });
  };

  text('PHIẾU BẾP', { size: 'large', bold: true, align: 'center' });
  text(input.tableName || 'Mang về', { size: 'large', bold: true, align: 'center' });
  text(`${input.sentAt.toLocaleTimeString('vi-VN')} ${input.sentAt.toLocaleDateString('vi-VN')}`, { size: 'small', align: 'center' });
  if (input.staffName) text(`Nhân viên: ${input.staffName}`, { size: 'small', align: 'center' });
  blocks.push({ kind: 'divider' });

  for (const item of input.items) {
    text(`${item.quantity} x ${item.productName}`, { size: 'large', bold: true });
    const options = [item.size, optionsText(item.options)].filter(Boolean).join(' - ');
    if (options) text(options);
    if (item.toppings) text(`+ ${item.toppings}`);
    if (item.note) text(`Ghi chú: ${item.note}`, { bold: true });
    blocks.push({ kind: 'spacer', dots: 6 });
  }
  blocks.push({ kind: 'divider' });
  text(`Tổng: ${input.items.reduce((sum, item) => sum + item.quantity, 0)} phần`, { size: 'small', align: 'center' });
  return { blocks };
}
