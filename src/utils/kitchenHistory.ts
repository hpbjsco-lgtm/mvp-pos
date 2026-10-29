/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KitchenItem, KitchenStatus } from '../types';

export interface HistoryLine {
  sign: '+' | '-';
  quantity: number;
  name: string;
  /** Các dòng phụ: size, đường / đá, topping, ghi chú. */
  details: string[];
}

export interface HistoryEvent {
  id: string;
  time: string; // ISO
  staff: string;
  lines: HistoryLine[];
}

/** "Trân châu đen x2, Thạch dừa x1" -> ["+ 2 Trân châu đen", "+ 1 Thạch dừa"] */
export function formatToppingLines(text?: string): string[] {
  if (!text) return [];
  return text.split(', ').map(part => {
    const m = part.match(/^(.*) x(\d+)$/);
    return m ? `+ ${m[2]} ${m[1]}` : `+ ${part}`;
  });
}

function detailsOf(k: KitchenItem): string[] {
  const out: string[] = [];
  if (k.size) out.push(k.size);
  out.push(...formatToppingLines(k.toppings));
  const mods = [k.sugarLevel && `${k.sugarLevel} đường`, k.iceLevel && `${k.iceLevel} đá`].filter(Boolean).join(', ');
  if (mods) out.push(mods);
  if (k.note) out.push(`"${k.note}"`);
  return out;
}

/**
 * Lịch sử báo bếp của một đơn: mỗi lần bấm "Thông báo" là một mục (+ các món gửi bếp);
 * món bị hủy sau đó là một mục riêng (− món). Mới nhất trước.
 */
export function buildKitchenHistory(items: KitchenItem[]): HistoryEvent[] {
  const events = new Map<string, HistoryEvent>();

  for (const k of items) {
    // Các món cùng một lần báo bếp có chung orderId; phiếu cũ không có thì mỗi phiếu là một lần
    const addKey = `add|${k.orderId || k.id}|${k.createdAt.slice(0, 19)}`;
    const add = events.get(addKey) || { id: addKey, time: k.createdAt, staff: k.staffName || '', lines: [] };
    add.lines.push({ sign: '+', quantity: k.quantity, name: k.productName, details: detailsOf(k) });
    events.set(addKey, add);

    if (k.status === KitchenStatus.CANCELLED && k.cancelledAt) {
      const delKey = `del|${k.cancelledAt.slice(0, 19)}|${k.cancelledBy || ''}`;
      const del = events.get(delKey) || { id: delKey, time: k.cancelledAt, staff: k.cancelledBy || '', lines: [] };
      del.lines.push({ sign: '-', quantity: k.quantity, name: k.productName, details: [] });
      events.set(delKey, del);
    }
  }

  return [...events.values()].sort((a, b) => b.time.localeCompare(a.time));
}
