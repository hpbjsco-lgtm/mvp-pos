/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Các thao tác thuần (pure) trên sơ đồ bàn F&B: gộp bàn, bỏ gộp, chuyển bàn, tách/ghép đơn.
 *
 * Mô hình dữ liệu: mỗi "đơn mở" là một giỏ hàng khoá theo id bàn (simCarts[tableId]).
 * Khi gộp bàn, các bàn phụ trỏ về bàn chính qua `mergedIntoId` và chỉ bàn chính giữ giỏ hàng.
 * Ngoài bàn thật còn có hai giỏ ảo: 'takeaway' (Mang về) và 'delivery' (Giao đi).
 */

import { DiningTable, Product, TableStatus } from '../types';
import type { CartLine } from '../components/POSScreen';

export type CartMap = Record<string, CartLine[]>;

export const TAKEAWAY_ID = 'takeaway';
export const DELIVERY_ID = 'delivery';

export const isVirtualCartId = (id: string) => id === TAKEAWAY_ID || id === DELIVERY_ID;

export const virtualCartLabel = (id: string) =>
  id === TAKEAWAY_ID ? 'Mang về' : id === DELIVERY_ID ? 'Giao đi' : '';

/** Khoá định danh 1 dòng giỏ hàng: cùng sản phẩm nhưng khác tuỳ chọn/ghi chú -> là dòng khác nhau. */
export const lineKey = (i: Pick<CartLine, 'productId' | 'note' | 'size' | 'sugarLevel' | 'iceLevel'>) =>
  `${i.productId}|${i.note}|${i.size || ''}|${i.sugarLevel || ''}|${i.iceLevel || ''}`;

/** Bàn chính của nhóm gộp (chính nó nếu không gộp / là bàn ảo). */
export function resolvePrimaryId(tables: DiningTable[], id: string): string {
  const t = tables.find(x => x.id === id);
  if (t?.mergedIntoId && tables.some(x => x.id === t.mergedIntoId)) return t.mergedIntoId;
  return id;
}

/** Các bàn phụ đang gộp vào bàn chính. */
export const getChildTables = (tables: DiningTable[], primaryId: string) =>
  tables.filter(t => t.mergedIntoId === primaryId);

/** Cả nhóm: bàn chính đứng đầu, theo sau là các bàn phụ. */
export function getGroupTables(tables: DiningTable[], id: string): DiningTable[] {
  const primaryId = resolvePrimaryId(tables, id);
  const primary = tables.find(t => t.id === primaryId);
  return primary ? [primary, ...getChildTables(tables, primaryId)] : [];
}

/** Tên hiển thị của nhóm, ví dụ "Bàn 02 + Bàn 03". */
export function getGroupLabel(tables: DiningTable[], id: string): string {
  if (isVirtualCartId(id)) return virtualCartLabel(id);
  const group = getGroupTables(tables, id);
  return group.length > 0 ? group.map(t => t.name).join(' + ') : 'Vãng lai';
}

/** Gộp hai danh sách dòng, cộng dồn số lượng với các dòng trùng khoá. */
export function mergeLines(base: CartLine[], incoming: CartLine[]): CartLine[] {
  const result = base.map(l => ({ ...l }));
  for (const line of incoming) {
    const idx = result.findIndex(l => lineKey(l) === lineKey(line));
    if (idx > -1) {
      const sent = (result[idx].sentQuantity || 0) + (line.sentQuantity || 0);
      result[idx] = { ...result[idx], quantity: result[idx].quantity + line.quantity, sentQuantity: sent || undefined };
    } else result.push({ ...line });
  }
  return result;
}

export interface TableStats {
  primaryId: string;
  isOccupied: boolean;
  isMerged: boolean;
  lines: CartLine[];
  itemCount: number;
  total: number;
  openedAt?: string;
  guests: number;
}

/** Thống kê hiển thị của một bàn (đã quy về bàn chính của nhóm). */
export function getTableStats(
  table: DiningTable,
  tables: DiningTable[],
  carts: CartMap,
  products: Product[],
): TableStats {
  const primaryId = resolvePrimaryId(tables, table.id);
  const primary = tables.find(t => t.id === primaryId) || table;
  const lines = carts[primaryId] || [];
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const total = lines.reduce((s, l) => s + (products.find(p => p.id === l.productId)?.price || 0) * l.quantity, 0);
  const isMerged = getGroupTables(tables, primaryId).length > 1;
  return {
    primaryId,
    isOccupied: lines.length > 0 || primary.status === TableStatus.SERVING || (table.id !== primaryId),
    isMerged,
    lines,
    itemCount,
    total,
    openedAt: primary.openedAt,
    guests: primary.guestCount || 0,
  };
}

/** Thời gian ngồi dạng "1g05p" / "12p". */
export function formatElapsed(openedAt: string | undefined, now: number = Date.now()): string {
  if (!openedAt) return '';
  const ms = now - new Date(openedAt).getTime();
  if (!isFinite(ms) || ms < 0) return '0p';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}g${String(m).padStart(2, '0')}p` : `${m}p`;
}

const FREE_PATCH: Partial<DiningTable> = {
  status: TableStatus.EMPTY,
  mergedIntoId: undefined,
  openedAt: undefined,
  guestCount: undefined,
};

/** Trả toàn bộ nhóm bàn về trạng thái trống và bỏ gộp (sau thanh toán / huỷ đơn). */
export function releaseGroup(tables: DiningTable[], id: string): DiningTable[] {
  const ids = new Set(getGroupTables(tables, id).map(t => t.id));
  return tables.map(t => (ids.has(t.id) ? { ...t, ...FREE_PATCH } : t));
}

export interface MergeResult {
  tables: DiningTable[];
  carts: CartMap;
}

/**
 * Gộp các bàn `otherIds` vào bàn chính của `id`. Món ở bàn phụ được chuyển sang giỏ bàn chính.
 * Bỏ qua bàn ảo, chính bàn chính và bàn đã thuộc nhóm của bàn chính.
 */
export function mergeTables(tables: DiningTable[], carts: CartMap, id: string, otherIds: string[], now = new Date().toISOString()): MergeResult {
  const primaryId = resolvePrimaryId(tables, id);
  const primary = tables.find(t => t.id === primaryId);
  if (!primary) return { tables, carts };

  const group = new Set(getGroupTables(tables, primaryId).map(t => t.id));
  const targets = [...new Set(otherIds)].filter(
    oid => !isVirtualCartId(oid) && !group.has(oid) && tables.some(t => t.id === oid),
  );
  if (targets.length === 0) return { tables, carts };

  const nextCarts: CartMap = { ...carts };
  let mergedLines = nextCarts[primaryId] || [];
  const absorbedIds = new Set<string>();
  let earliest = primary.openedAt;
  let guests = primary.guestCount || 0;

  for (const oid of targets) {
    // Một bàn phụ có thể đang là bàn chính của nhóm khác -> kéo cả nhóm đó sang
    const otherGroup = getGroupTables(tables, oid);
    for (const member of otherGroup) {
      absorbedIds.add(member.id);
    }
    const otherPrimary = otherGroup[0];
    if (otherPrimary) {
      mergedLines = mergeLines(mergedLines, nextCarts[otherPrimary.id] || []);
      delete nextCarts[otherPrimary.id];
      guests += otherPrimary.guestCount || 0;
      if (otherPrimary.openedAt && (!earliest || otherPrimary.openedAt < earliest)) earliest = otherPrimary.openedAt;
    }
  }

  if (mergedLines.length > 0) nextCarts[primaryId] = mergedLines;
  else delete nextCarts[primaryId];

  const nextTables = tables.map(t => {
    if (t.id === primaryId) {
      return { ...t, status: TableStatus.SERVING, openedAt: earliest || now, guestCount: guests || undefined };
    }
    if (absorbedIds.has(t.id)) {
      return { ...t, status: TableStatus.SERVING, mergedIntoId: primaryId, openedAt: undefined, guestCount: undefined };
    }
    return t;
  });

  return { tables: nextTables, carts: nextCarts };
}

/** Bỏ gộp một bàn phụ (trả bàn đó về trống). Món vẫn ở bàn chính. */
export function unmergeTable(tables: DiningTable[], childId: string): DiningTable[] {
  return tables.map(t => (t.id === childId && t.mergedIntoId ? { ...t, ...FREE_PATCH } : t));
}

/** Bỏ gộp toàn bộ các bàn phụ của một nhóm. */
export function unmergeAll(tables: DiningTable[], id: string): DiningTable[] {
  const primaryId = resolvePrimaryId(tables, id);
  return tables.map(t => (t.mergedIntoId === primaryId ? { ...t, ...FREE_PATCH } : t));
}

/** Bàn có thể là đích của "Chuyển bàn": bàn thật, không gộp, không có món và không đang phục vụ. */
export function canTransferTo(tables: DiningTable[], carts: CartMap, fromId: string, toId: string): boolean {
  const to = tables.find(t => t.id === toId);
  if (!to || isVirtualCartId(toId)) return false;
  if (getGroupTables(tables, fromId).some(t => t.id === toId)) return false;
  return !getTableStats(to, tables, carts, []).isOccupied;
}

/** Chuyển nguyên đơn (cả nhóm gộp nếu có) từ bàn `fromId` sang bàn trống `toId`. */
export function transferTable(tables: DiningTable[], carts: CartMap, fromId: string, toId: string, now = new Date().toISOString()): MergeResult {
  if (!canTransferTo(tables, carts, fromId, toId)) return { tables, carts };
  const fromPrimaryId = resolvePrimaryId(tables, fromId);
  const from = tables.find(t => t.id === fromPrimaryId);
  if (!from) return { tables, carts };

  const nextCarts: CartMap = { ...carts };
  if (nextCarts[fromPrimaryId]) {
    nextCarts[toId] = nextCarts[fromPrimaryId];
    delete nextCarts[fromPrimaryId];
  }

  const nextTables = tables.map(t => {
    if (t.id === toId) {
      return { ...t, status: TableStatus.SERVING, mergedIntoId: undefined, openedAt: from.openedAt || now, guestCount: from.guestCount };
    }
    if (t.id === fromPrimaryId) return { ...t, ...FREE_PATCH };
    if (t.mergedIntoId === fromPrimaryId) return { ...t, mergedIntoId: toId };
    return t;
  });
  return { tables: nextTables, carts: nextCarts };
}

/** Số lượng muốn chuyển theo từng dòng: khoá = lineKey(line). */
export type MoveSelection = Record<string, number>;

/**
 * Tách đơn / ghép đơn: chuyển các dòng đã chọn từ đơn của `fromId` sang đơn của `toId`
 * (đích có thể là bàn đang có đơn, bàn trống, hoặc giỏ ảo Mang về / Giao đi).
 * Chuyển hết món => bàn nguồn được trả trống (kèm bỏ gộp).
 */
export function moveItems(
  tables: DiningTable[],
  carts: CartMap,
  fromId: string,
  toId: string,
  selection: MoveSelection,
  now = new Date().toISOString(),
): MergeResult {
  const fromKey = resolvePrimaryId(tables, fromId);
  const toKey = resolvePrimaryId(tables, toId);
  if (fromKey === toKey) return { tables, carts };

  const source = carts[fromKey] || [];
  const moving: CartLine[] = [];
  const remaining: CartLine[] = [];

  for (const line of source) {
    const want = Math.max(0, Math.min(selection[lineKey(line)] || 0, line.quantity));
    // Phần đã báo bếp đi theo phần được chuyển trước; phần còn lại không thể lớn hơn số lượng còn lại
    const sent = line.sentQuantity || 0;
    const movedSent = Math.min(sent, want);
    const keptSent = Math.min(sent - movedSent, line.quantity - want);
    if (want > 0) moving.push({ ...line, quantity: want, sentQuantity: movedSent || undefined });
    if (line.quantity - want > 0) remaining.push({ ...line, quantity: line.quantity - want, sentQuantity: keptSent || undefined });
  }
  if (moving.length === 0) return { tables, carts };

  const nextCarts: CartMap = { ...carts };
  if (remaining.length > 0) nextCarts[fromKey] = remaining;
  else delete nextCarts[fromKey];
  nextCarts[toKey] = mergeLines(nextCarts[toKey] || [], moving);

  let nextTables = tables;
  const fromTable = tables.find(t => t.id === fromKey);

  // Đích là bàn thật: đánh dấu đang phục vụ nếu trước đó trống
  if (!isVirtualCartId(toKey)) {
    nextTables = nextTables.map(t =>
      t.id === toKey && !t.openedAt
        ? { ...t, status: TableStatus.SERVING, openedAt: fromTable?.openedAt || now }
        : t.id === toKey
          ? { ...t, status: TableStatus.SERVING }
          : t,
    );
  }
  // Nguồn là bàn thật và đã hết món: trả bàn
  if (remaining.length === 0 && !isVirtualCartId(fromKey)) {
    nextTables = releaseGroup(nextTables, fromKey);
  }
  return { tables: nextTables, carts: nextCarts };
}
