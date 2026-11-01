import { describe, expect, it } from 'vitest';
import { buildReceiptJob, EscPosBuilder, packMonochrome, RASTER_BAND_HEIGHT } from './escpos';
import { buildReceiptDocument, formatMoney, ReceiptBlock, ReceiptInput } from './receiptDocument';
import { wrapText } from './wrapText';
import { Order, PaymentMethod } from '../types';

/** Pixel buffer where every pixel has the given RGBA value. */
const solid = (width: number, height: number, rgba: [number, number, number, number]) =>
  Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]);

describe('packMonochrome', () => {
  it('packs dots most significant bit first and pads the last byte', () => {
    // 10 dots wide, 1 row: black on dots 0, 7, 9.
    const pixels = solid(10, 1, [255, 255, 255, 255]);
    for (const x of [0, 7, 9]) pixels.set([0, 0, 0, 255], x * 4);
    const bitmap = packMonochrome(pixels, 10, 1);
    expect(Array.from(bitmap.data)).toEqual([0b10000001, 0b01000000]);
  });
  it('treats transparent pixels as white and mid-grey by the threshold', () => {
    expect(Array.from(packMonochrome(solid(8, 1, [0, 0, 0, 0]), 8, 1).data)).toEqual([0]);
    expect(Array.from(packMonochrome(solid(8, 1, [100, 100, 100, 255]), 8, 1).data)).toEqual([0xff]);
    expect(Array.from(packMonochrome(solid(8, 1, [200, 200, 200, 255]), 8, 1).data)).toEqual([0]);
  });
  it('rejects a buffer of the wrong size', () => {
    expect(() => packMonochrome(new Uint8ClampedArray(3), 2, 1)).toThrow('2x1');
  });
});

describe('EscPosBuilder', () => {
  it('writes reset, feed and cut commands', () => {
    expect(Array.from(new EscPosBuilder().initialize().feed(3).cut().build()))
      .toEqual([0x1b, 0x40, 0x1b, 0x64, 3, 0x1d, 0x56, 0x42, 0x00]);
  });
  it('rejects a feed outside 0-255', () => {
    expect(() => new EscPosBuilder().feed(256)).toThrow('255');
  });
  it('sends a raster image as one GS v 0 command with width in bytes and height in rows', () => {
    const bitmap = packMonochrome(solid(16, 2, [0, 0, 0, 255]), 16, 2);
    const bytes = Array.from(new EscPosBuilder().rasterImage(bitmap).build());
    expect(bytes.slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
    expect(bytes.slice(8)).toEqual([0xff, 0xff, 0xff, 0xff]);
  });
  it('splits a tall image into bands', () => {
    const height = RASTER_BAND_HEIGHT * 2 + 5;
    const bytes = new EscPosBuilder().rasterImage(packMonochrome(solid(8, height, [0, 0, 0, 255]), 8, height)).build();
    // Three commands, each 8 header bytes, plus one data byte per row.
    expect(bytes.length).toBe(3 * 8 + height);
    expect(bytes[6]).toBe(RASTER_BAND_HEIGHT);
    expect(bytes[8 + RASTER_BAND_HEIGHT + 6]).toBe(RASTER_BAND_HEIGHT);
    expect(bytes[2 * (8 + RASTER_BAND_HEIGHT) + 6]).toBe(5);
  });
  it('rejects an empty bitmap or one whose data length is wrong', () => {
    expect(() => new EscPosBuilder().rasterImage({ width: 8, height: 0, data: new Uint8Array(0) })).toThrow('empty');
    expect(() => new EscPosBuilder().rasterImage({ width: 8, height: 2, data: new Uint8Array(1) })).toThrow('2 are needed');
  });
  it('builds a job: reset, image, feed, optional cut', () => {
    const bitmap = packMonochrome(solid(8, 1, [0, 0, 0, 255]), 8, 1);
    const job = Array.from(buildReceiptJob(bitmap));
    expect(job.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(job.slice(-3)).toEqual([0x1b, 0x64, 4]);
    expect(Array.from(buildReceiptJob(bitmap, { feedLines: 2, cut: true })).slice(-7)).toEqual([0x1b, 0x64, 2, 0x1d, 0x56, 0x42, 0x00]);
  });
});

describe('wrapText', () => {
  const measure = (value: string) => value.length;
  it('breaks at spaces', () => expect(wrapText('aaa bbb ccc', 7, measure)).toEqual(['aaa bbb', 'ccc']));
  it('breaks a word wider than the line', () => expect(wrapText('abcdefgh', 3, measure)).toEqual(['abc', 'def', 'gh']));
  it('keeps explicit new lines and returns one empty line for empty text', () => {
    expect(wrapText('a\nb', 10, measure)).toEqual(['a', 'b']);
    expect(wrapText('', 10, measure)).toEqual(['']);
  });
  it('rejects a non-positive width', () => expect(() => wrapText('a', 0, measure)).toThrow('positive'));
});

const order = (extra: Partial<Order> = {}): Order => ({
  id: 'o1', orderNumber: 'HD00001', totalAmount: 159000, paymentMethod: PaymentMethod.CASH,
  paidAmount: 200000, changeAmount: 41000, staffId: 's', createdAt: '2026-10-31T03:00:00.000Z',
  items: [{ productId: 'p1', name: 'Cà phê sữa', quantity: 2, price: 29000, size: 'Lớn', toppings: [{ name: 'Trân châu', price: 5000, quantity: 1 }] }],
  ...extra,
});
const input = (extra: Partial<ReceiptInput> = {}): ReceiptInput => ({
  order: order(), storeInfo: { name: 'Quán Mộc', address: '1 Lê Lợi', phone: '0900000000', storeType: 'fnb' },
  staffName: 'Alan', variant: 'final', ...extra,
});
const texts = (blocks: ReceiptBlock[]) => blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.kind === 'row' ? [b.left, b.right] : []));

describe('buildReceiptDocument', () => {
  it('formats money like the on-screen receipt', () => expect(formatMoney(159000)).toBe(`${(159000).toLocaleString('vi-VN')} đ`));
  it('lays out a final receipt with items, total, tendered amount and change', () => {
    const all = texts(buildReceiptDocument(input()).blocks);
    expect(all).toContain('QUÁN MỘC');
    expect(all).toContain('HÓA ĐƠN THANH TOÁN');
    expect(all).toContain('Cà phê sữa');
    expect(all).toContain('+ 1 Trân châu');
    expect(all).toContain('Tùy chọn: Lớn');
    expect(all).toContain(formatMoney(58000));
    expect(all).toContain('TỔNG CỘNG:');
    expect(all).toContain('Tiền trả lại:');
    expect(all).toContain('Cảm ơn Quý Khách đã ủng hộ!');
  });
  it('leaves out payment lines on a provisional bill and adds the transfer QR', () => {
    const doc = buildReceiptDocument(input({
      variant: 'provisional',
      transfer: { bankName: 'VCB', accountNumber: '0011', holder: 'NGUYEN A', amount: 159000, qrDataUrl: 'data:image/png;base64,AAAA' },
    }));
    const all = texts(doc.blocks);
    expect(all).toContain('PHIẾU TẠM TÍNH');
    expect(all).not.toContain('Tiền trả lại:');
    expect(all).toContain('QUÉT MÃ ĐỂ CHUYỂN KHOẢN');
    expect(doc.blocks.filter(b => b.kind === 'image')).toHaveLength(1);
  });
  it('lists each payment of a mixed payment', () => {
    const all = texts(buildReceiptDocument(input({
      order: order({ payments: [{ method: 'cash', amount: 100000 }, { method: 'qr', amount: 59000 }] }),
    })).blocks);
    expect(all).toContain('Tiền mặt:');
    expect(all).toContain('Chuyển khoản:');
    expect(all).toContain('Khách đưa (kết hợp):');
  });
  it('shows subtotal, discount and tax only when the order has them', () => {
    expect(texts(buildReceiptDocument(input()).blocks)).not.toContain('Tạm tính:');
    const all = texts(buildReceiptDocument(input({ order: order({ subtotal: 170000, discountAmount: 11000 }) })).blocks);
    expect(all).toContain('Tạm tính:');
    expect(all).toContain(`-${formatMoney(11000)}`);
  });
  it('puts the logo first when the store has one', () => {
    const doc = buildReceiptDocument(input({ logoDataUrl: 'data:image/png;base64,BBBB' }));
    expect(doc.blocks[0]).toMatchObject({ kind: 'image', align: 'center' });
  });
});
