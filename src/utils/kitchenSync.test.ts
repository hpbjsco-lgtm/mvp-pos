/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { KitchenItem, KitchenStatus } from '../types';
import { applyLineEditToKitchen, removePortionsFromKitchen } from './kitchenSync';

const ticket = (id: string, quantity: number, extra: Partial<KitchenItem> = {}): KitchenItem => ({
  id, orderId: 'NB-1', productId: 'p1', productName: 'Bun bo', quantity, status: KitchenStatus.PENDING,
  size: 'Nho', createdAt: `2026-11-05T10:0${id.length}:00.000Z`, ...extra,
});
const isBunBoNho = (k: KitchenItem) => k.productId === 'p1' && k.size === 'Nho';

describe('removePortionsFromKitchen', () => {
  it('takes one portion off a ticket of three when one portion gets a topping', () => {
    const result = removePortionsFromKitchen([ticket('a', 3)], isBunBoNho, 1, 'Lan', 'now');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ quantity: 2, status: KitchenStatus.PENDING });
  });

  it('cancels a ticket that reaches zero and continues with the next one, newest first', () => {
    const older = ticket('a', 2, { createdAt: '2026-11-05T10:00:00.000Z' });
    const newer = ticket('b', 1, { createdAt: '2026-11-05T10:05:00.000Z' });
    const result = removePortionsFromKitchen([older, newer], isBunBoNho, 2, 'Lan', 'now');
    expect(result.find(k => k.id === 'b')).toMatchObject({ status: KitchenStatus.CANCELLED, cancelledBy: 'Lan', cancelledAt: 'now' });
    expect(result.find(k => k.id === 'a')).toMatchObject({ quantity: 1, status: KitchenStatus.PENDING });
  });

  it('leaves served, cancelled and other tickets alone', () => {
    const served = ticket('s', 2, { status: KitchenStatus.SERVED });
    const other = ticket('o', 2, { productId: 'p2' });
    expect(removePortionsFromKitchen([served, other], isBunBoNho, 1, 'Lan', 'now')).toEqual([served, other]);
  });

  it('does nothing for zero portions', () => {
    const items = [ticket('a', 3)];
    expect(removePortionsFromKitchen(items, isBunBoNho, 0, 'Lan', 'now')).toBe(items);
  });
});

describe('applyLineEditToKitchen', () => {
  it('moves open tickets of the line to the new size', () => {
    const result = applyLineEditToKitchen([ticket('a', 1), ticket('b', 1, { status: KitchenStatus.SERVED })], isBunBoNho, 'size', 'Lon');
    expect(result[0].size).toBe('Lon');
    expect(result[1].size).toBe('Nho');
  });
});
