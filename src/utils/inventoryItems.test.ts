import { describe, it, expect } from 'vitest';
import { nextItemCode, stockOf, stockStatus, toBaseQuantity, unitChoices } from './inventoryItems';
import { InventoryBatch } from '../types';

const batch = (productId: string, quantity: number): InventoryBatch => ({ id: `${productId}${quantity}`, productId, batchCode: 'L', expiryDate: '2099-01-01', quantity, originalQuantity: quantity, createdAt: '' });

describe('inventory items', () => {
  it('stock is the sum of the batches of that item', () => {
    expect(stockOf('a', [batch('a', 5), batch('a', 7), batch('b', 100)])).toBe(12);
    expect(stockOf('z', [])).toBe(0);
  });
  it('stock status against min / max levels', () => {
    expect(stockStatus({ trackStock: false }, 0)).toBe('untracked');
    expect(stockStatus({ trackStock: true, minStock: 10 }, 0)).toBe('out');
    expect(stockStatus({ trackStock: true, minStock: 10 }, 5)).toBe('low');
    expect(stockStatus({ trackStock: true, minStock: 10, maxStock: 50 }, 60)).toBe('high');
    expect(stockStatus({ trackStock: true, minStock: 10, maxStock: 50 }, 20)).toBe('ok');
    expect(stockStatus({ trackStock: true }, 3)).toBe('ok');
  });
  it('converts quantities in alternative units to the base unit', () => {
    const p = { unit: 'Chai', unitConversions: [{ name: 'Thùng', ratio: 24 }] };
    expect(toBaseQuantity(p, 'Thùng', 2)).toBe(48);
    expect(toBaseQuantity(p, 'Chai', 5)).toBe(5);
    expect(toBaseQuantity(p, 'Khác', 3)).toBe(3);
    expect(unitChoices(p).map(u => u.name)).toEqual(['Chai', 'Thùng']);
  });
  it('item codes increment per prefix', () => {
    expect(nextItemCode([], 'NL')).toBe('NL0001');
    expect(nextItemCode([{ sku: 'NL0007' }, { sku: 'CC0002' }, { sku: 'RAW-001' }], 'NL')).toBe('NL0008');
  });
});
