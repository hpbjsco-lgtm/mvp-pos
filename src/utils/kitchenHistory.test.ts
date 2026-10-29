import { describe, it, expect } from 'vitest';
import { buildKitchenHistory, formatToppingLines } from './kitchenHistory';
import { KitchenItem, KitchenStatus } from '../types';

const k = (id: string, extra: Partial<KitchenItem>): KitchenItem => ({
  id, orderId: 'B1', productId: 'p', productName: 'Trà sữa', quantity: 1, status: KitchenStatus.PENDING,
  createdAt: '2026-10-10T10:00:00.000Z', staffName: 'Sơn', ...extra,
});

describe('kitchen history', () => {
  it('groups items sent together and lists modifiers, toppings and notes', () => {
    const h = buildKitchenHistory([
      k('1', { size: 'L', toppings: 'Trân châu đen x1', sugarLevel: '50%', iceLevel: '70%', note: 'ít ngọt' }),
      k('2', { productName: 'Bò né', note: 'Chín vừa' }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].staff).toBe('Sơn');
    expect(h[0].lines.map(l => l.name)).toEqual(['Trà sữa', 'Bò né']);
    expect(h[0].lines[0].details).toEqual(['L', '+ 1 Trân châu đen', '50% đường, 70% đá', '"ít ngọt"']);
  });
  it('separate sends are separate entries, newest first', () => {
    const h = buildKitchenHistory([k('1', {}), k('2', { orderId: 'B2', createdAt: '2026-10-10T10:05:00.000Z' })]);
    expect(h.map(e => e.time)).toEqual(['2026-10-10T10:05:00.000Z', '2026-10-10T10:00:00.000Z']);
  });
  it('cancelled items add a "-" entry at the cancel time', () => {
    const h = buildKitchenHistory([k('1', { status: KitchenStatus.CANCELLED, cancelledAt: '2026-10-10T10:03:00.000Z', cancelledBy: 'Hà' })]);
    expect(h).toHaveLength(2);
    expect(h[0].lines[0]).toMatchObject({ sign: '-', quantity: 1, name: 'Trà sữa' });
    expect(h[0].staff).toBe('Hà');
    expect(h[1].lines[0].sign).toBe('+');
  });
  it('formats topping text', () => {
    expect(formatToppingLines('Trân châu đen x2, Thạch dừa x1')).toEqual(['+ 2 Trân châu đen', '+ 1 Thạch dừa']);
    expect(formatToppingLines(undefined)).toEqual([]);
  });
});
