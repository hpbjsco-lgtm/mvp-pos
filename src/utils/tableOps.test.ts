import { describe, it, expect } from 'vitest';
import { DiningTable, TableStatus, Product } from '../types';
import {
  CartMap, lineKey, mergeTables, unmergeTable, unmergeAll, transferTable, canTransferTo, moveItems,
  releaseGroup, getGroupLabel, getTableStats, formatElapsed, TAKEAWAY_ID, resolvePrimaryId,
} from './tableOps';

const mk = (id: string, extra: Partial<DiningTable> = {}): DiningTable => ({
  id, name: `Bàn ${id}`, status: TableStatus.EMPTY, capacity: 4, createdAt: '2026-01-01T00:00:00Z', ...extra,
});
const line = (productId: string, quantity: number, note = '') => ({ productId, quantity, note });
const products = [
  { id: 'p1', price: 10000 }, { id: 'p2', price: 5000 },
] as unknown as Product[];

const base = () => ({
  tables: [mk('1', { status: TableStatus.SERVING, openedAt: '2026-01-01T10:00:00Z', guestCount: 2 }), mk('2'), mk('3')],
  carts: { '1': [line('p1', 2), line('p2', 1)] } as CartMap,
});

describe('mergeTables', () => {
  it('moves cart lines of absorbed table to primary and links children', () => {
    const { tables, carts } = base();
    carts['2'] = [line('p1', 1)];
    const r = mergeTables(tables, carts, '1', ['2']);
    expect(r.carts['2']).toBeUndefined();
    expect(r.carts['1'].find(l => l.productId === 'p1')?.quantity).toBe(3);
    expect(r.tables.find(t => t.id === '2')?.mergedIntoId).toBe('1');
    expect(getGroupLabel(r.tables, '2')).toBe('Bàn 1 + Bàn 2');
    expect(resolvePrimaryId(r.tables, '2')).toBe('1');
  });
  it('merging two empty tables marks both serving', () => {
    const r = mergeTables([mk('2'), mk('3')], {}, '2', ['3']);
    expect(r.tables.every(t => t.status === TableStatus.SERVING)).toBe(true);
    expect(r.carts).toEqual({});
  });
  it('ignores self, virtual ids and tables already in the group', () => {
    const { tables, carts } = base();
    const r1 = mergeTables(tables, carts, '1', ['1', TAKEAWAY_ID]);
    expect(r1.tables).toBe(tables);
    const r2 = mergeTables(r1.tables, carts, '1', ['2']);
    const r3 = mergeTables(r2.tables, r2.carts, '1', ['2']);
    expect(r3.tables).toBe(r2.tables);
  });
  it('absorbing a primary pulls its whole group', () => {
    let s = mergeTables([mk('1'), mk('2'), mk('3')], { '2': [line('p1', 1)] }, '2', ['3']);
    s = mergeTables(s.tables, s.carts, '1', ['2']);
    expect(s.tables.filter(t => t.mergedIntoId === '1').map(t => t.id).sort()).toEqual(['2', '3']);
    expect(s.carts['1']).toEqual([line('p1', 1)]);
  });
});

describe('unmerge / release', () => {
  it('unmergeTable frees only the child', () => {
    const { tables, carts } = base();
    const m = mergeTables(tables, carts, '1', ['2', '3']);
    const t = unmergeTable(m.tables, '2');
    expect(t.find(x => x.id === '2')?.mergedIntoId).toBeUndefined();
    expect(t.find(x => x.id === '2')?.status).toBe(TableStatus.EMPTY);
    expect(t.find(x => x.id === '3')?.mergedIntoId).toBe('1');
  });
  it('unmergeAll and releaseGroup', () => {
    const { tables, carts } = base();
    const m = mergeTables(tables, carts, '1', ['2', '3']);
    expect(unmergeAll(m.tables, '3').some(t => t.mergedIntoId)).toBe(false);
    const rel = releaseGroup(m.tables, '2');
    expect(rel.every(t => t.status === TableStatus.EMPTY && !t.mergedIntoId && !t.openedAt)).toBe(true);
  });
});

describe('transferTable', () => {
  it('moves cart, openedAt, guests; keeps merged children attached', () => {
    const { tables, carts } = base();
    const m = mergeTables(tables, carts, '1', ['2']);
    const r = transferTable(m.tables, m.carts, '1', '3');
    expect(r.carts['1']).toBeUndefined();
    expect(r.carts['3']).toHaveLength(2);
    const t3 = r.tables.find(t => t.id === '3')!;
    expect(t3.status).toBe(TableStatus.SERVING);
    expect(t3.openedAt).toBe('2026-01-01T10:00:00Z');
    expect(t3.guestCount).toBe(2);
    expect(r.tables.find(t => t.id === '2')?.mergedIntoId).toBe('3');
    expect(r.tables.find(t => t.id === '1')?.status).toBe(TableStatus.EMPTY);
  });
  it('refuses occupied or same-group targets', () => {
    const { tables, carts } = base();
    carts['2'] = [line('p2', 1)];
    expect(canTransferTo(tables, carts, '1', '2')).toBe(false);
    expect(canTransferTo(tables, carts, '1', '1')).toBe(false);
    expect(transferTable(tables, carts, '1', '2').tables).toBe(tables);
  });
});

describe('moveItems (split / combine)', () => {
  it('partial split leaves remainder and opens target', () => {
    const { tables, carts } = base();
    const r = moveItems(tables, carts, '1', '2', { [lineKey(line('p1', 2))]: 1 });
    expect(r.carts['1'].find(l => l.productId === 'p1')?.quantity).toBe(1);
    expect(r.carts['2']).toEqual([line('p1', 1)]);
    expect(r.tables.find(t => t.id === '2')?.status).toBe(TableStatus.SERVING);
    expect(r.tables.find(t => t.id === '1')?.status).toBe(TableStatus.SERVING);
  });
  it('moving everything releases the source and merges into target lines', () => {
    const { tables, carts } = base();
    carts['2'] = [line('p1', 5)];
    const sel = { [lineKey(line('p1', 2))]: 2, [lineKey(line('p2', 1))]: 1 };
    const r = moveItems(tables, carts, '1', '2', sel);
    expect(r.carts['1']).toBeUndefined();
    expect(r.carts['2'].find(l => l.productId === 'p1')?.quantity).toBe(7);
    expect(r.tables.find(t => t.id === '1')?.status).toBe(TableStatus.EMPTY);
  });
  it('clamps quantity and supports takeaway target', () => {
    const { tables, carts } = base();
    const r = moveItems(tables, carts, '1', TAKEAWAY_ID, { [lineKey(line('p2', 1))]: 99 });
    expect(r.carts[TAKEAWAY_ID]).toEqual([line('p2', 1)]);
    expect(r.carts['1']).toHaveLength(1);
  });
  it('no-op when nothing selected or same cart', () => {
    const { tables, carts } = base();
    expect(moveItems(tables, carts, '1', '2', {}).carts).toBe(carts);
    expect(moveItems(tables, carts, '1', '1', { x: 1 }).carts).toBe(carts);
  });
});

describe('stats helpers', () => {
  it('computes total / occupancy through group', () => {
    const { tables, carts } = base();
    const m = mergeTables(tables, carts, '1', ['2']);
    const s2 = getTableStats(m.tables.find(t => t.id === '2')!, m.tables, m.carts, products);
    expect(s2.isOccupied).toBe(true);
    expect(s2.isMerged).toBe(true);
    expect(s2.total).toBe(25000);
    expect(getTableStats(m.tables.find(t => t.id === '3')!, m.tables, m.carts, products).isOccupied).toBe(false);
  });
  it('formats elapsed time', () => {
    const now = new Date('2026-01-01T12:05:00Z').getTime();
    expect(formatElapsed('2026-01-01T10:00:00Z', now)).toBe('2g05p');
    expect(formatElapsed('2026-01-01T12:00:00Z', now)).toBe('5p');
    expect(formatElapsed(undefined, now)).toBe('');
  });
});
