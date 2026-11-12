import { describe, expect, it } from 'vitest';
import { KitchenItem, KitchenStatus } from '../types';
import { buildKitchenTicketDocument } from './kitchenTicketDocument';
import { ReceiptBlock } from './receiptDocument';

const item = (extra: Partial<KitchenItem> = {}): KitchenItem => ({
  id: 'k1', orderId: 'NB-1', productId: 'p1', productName: 'Cà phê sữa đá', quantity: 2, status: KitchenStatus.PENDING,
  createdAt: '2026-11-01T10:00:00.000Z', ...extra,
});
const texts = (blocks: ReceiptBlock[]) => blocks.flatMap(b => (b.kind === 'text' ? [b.text] : []));
const sentAt = new Date(2026, 10, 1, 20, 30, 0);

describe('buildKitchenTicketDocument', () => {
  it('shows the table, each dish with quantity, options, toppings and notes, and the total', () => {
    const all = texts(buildKitchenTicketDocument({
      tableName: 'Bàn 05', staffName: 'Alan', sentAt,
      items: [item({ size: 'Lớn', options: [{ group: 'Đường', choice: '50%' }, { group: 'Đá', choice: '100%' }, { group: 'Ghi chú nhanh', choice: 'Ít cay', multiple: true }], toppings: 'Trân châu x1', note: 'Không cay' }), item({ id: 'k2', productName: 'Phở bò', quantity: 1 })],
    }).blocks);
    expect(all).toContain('PHIẾU BẾP');
    expect(all).toContain('Bàn 05');
    expect(all).toContain('2 x Cà phê sữa đá');
    expect(all).toContain('Lớn - Đường 50%, Đá 100%, Ít cay');
    expect(all).toContain('+ Trân châu x1');
    expect(all).toContain('Ghi chú: Không cay');
    expect(all).toContain('1 x Phở bò');
    expect(all).toContain('Tổng: 3 phần');
  });
  it('has no prices and labels an empty table as takeaway', () => {
    const all = texts(buildKitchenTicketDocument({ tableName: '', staffName: '', sentAt, items: [item()] }).blocks);
    expect(all).toContain('Mang về');
    expect(all.some(line => /\d\s?đ$/.test(line))).toBe(false);
  });
  it('rejects a ticket without items', () => {
    expect(() => buildKitchenTicketDocument({ tableName: 'Bàn 1', staffName: '', sentAt, items: [] })).toThrow('không có món');
  });
});
