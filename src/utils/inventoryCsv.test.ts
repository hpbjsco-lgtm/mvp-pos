/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { InventoryBatch, InventoryTransaction, InventoryTransactionType, Product } from '../types';
import { parseCsv, toCsv } from './csv';
import {
  batchesToCsv, batchTemplateCsv, parseBatchImport, parseDateCell, parseNumberCell, parseProductImport, productsToCsv, productTemplateCsv, transactionsToCsv,
} from './inventoryCsv';

const product = (extra: Partial<Product>): Product => ({ id: 'p1', sku: 'NL0001', name: 'Sữa tươi', price: 0, cost: 30000, category: 'Sữa', isAvailable: true, createdAt: '', itemGroup: 'ingredient', unit: 'Chai', ...extra });
const batch = (extra: Partial<InventoryBatch>): InventoryBatch => ({ id: 'b1', productId: 'p1', batchCode: 'L1', expiryDate: '2027-01-31T00:00:00Z', importPrice: 30000, quantity: 10, originalQuantity: 24, createdAt: '', ...extra });
const NOW = new Date('2026-11-09T10:00:00Z');

/** Rows of a CSV text. */
const cells = (csv: string) => parseCsv(csv).map(row => row.cells);

describe('cells', () => {
  it('reads plain numbers, decimals and Vietnamese thousands, and refuses the rest', () => {
    expect(parseNumberCell('25000')).toBe(25000);
    expect(parseNumberCell('0,5')).toBe(0.5);
    expect(parseNumberCell('2.5')).toBe(2.5);
    expect(parseNumberCell('25.000')).toBe(25000);
    expect(parseNumberCell('1.250.000')).toBe(1250000);
    expect(parseNumberCell(' 12 ')).toBe(12);
    expect(parseNumberCell('')).toBeNull();
    expect(parseNumberCell('abc')).toBeNull();
    expect(parseNumberCell('-3')).toBeNull();
    expect(parseNumberCell('1,2,3')).toBeNull();
  });

  it('reads dates in three forms and refuses dates that do not exist', () => {
    expect(parseDateCell('2026-12-31')).toBe('2026-12-31');
    expect(parseDateCell('31/12/2026')).toBe('2026-12-31');
    expect(parseDateCell('1-2-2027')).toBe('2027-02-01');
    expect(parseDateCell('31/02/2026')).toBeNull();
    expect(parseDateCell('2026-13-01')).toBeNull();
    expect(parseDateCell('hôm nay')).toBeNull();
  });
});

describe('export', () => {
  it('lists goods with their stock', () => {
    const rows = cells(productsToCsv([product({ minStock: 5, brand: 'Vinamilk' })], [batch({ quantity: 10 }), batch({ id: 'b2', batchCode: 'L2', quantity: 4.5 }), batch({ id: 'b3', productId: 'other', quantity: 99 })]));
    expect(rows[0]).toContain('Tồn kho');
    expect(rows[1]).toEqual(['NL0001', 'Sữa tươi', 'Nguyên vật liệu', 'Sữa', 'Vinamilk', 'Chai', '30000', '5', '', '14.5', '', '', 'Có']);
  });

  it('lists batches with the code and name of the item and plain dates', () => {
    expect(cells(batchesToCsv([batch({ manufactureDate: '2026-11-01' })], [product({})]))[1]).toEqual(['NL0001', 'Sữa tươi', 'L1', '2026-11-01', '2027-01-31', '30000', '24', '10', 'Chai']);
  });

  it('lists one row per voucher line', () => {
    const voucher: InventoryTransaction = {
      id: 't1', transactionNumber: 'PXK0001', type: InventoryTransactionType.EXPORT, staffId: 's', note: 'Hư hỏng, đổ vỡ', createdAt: '2026-11-01T10:00:00Z',
      items: [{ productId: 'p1', batchCode: 'L1', quantity: 2, price: 30000 }, { productId: 'p1', batchCode: 'L2', quantity: 1 }],
    };
    const rows = cells(transactionsToCsv([voucher], [product({})]));
    expect(rows).toHaveLength(3);
    expect(rows[1].slice(0, 3)).toEqual(['PXK0001', '', 'Xuất']);
    expect(rows[1].slice(4)).toEqual(['NL0001', 'Sữa tươi', 'L1', '2', '30000', 'Hư hỏng, đổ vỡ']);
    expect(rows[2][8]).toBe('');
  });
});

describe('templates', () => {
  it('can be read back: instructions and the example are skipped, only the header remains', () => {
    expect(cells(productTemplateCsv())).toHaveLength(1);
    expect(cells(batchTemplateCsv())).toHaveLength(1);
    expect(parseProductImport(productTemplateCsv(), [], NOW)).toEqual({ items: [], issues: [] });
    expect(parseBatchImport(batchTemplateCsv(), [product({})], [], NOW)).toEqual({ items: [], issues: [] });
  });
});

describe('parseProductImport', () => {
  const header = 'Mã hàng,Tên hàng*,Nhóm quản lý,Nhóm hàng,Thương hiệu,Đơn vị tính,Giá vốn,Tồn tối thiểu,Tồn tối đa,Vị trí,Ghi chú';

  it('creates goods like the "Tạo hàng" dialog: automatic codes, defaults, groups', () => {
    const csv = `${header}\n,Cà phê bột,,Cà phê,Trung Nguyên,Kg,180.000,5,50,Kệ A1,Ghi\n,Ly nhựa,Công cụ dụng cụ,,,Cái,500,,,,\nNL0009,Đường,Nguyên vật liệu,,,Kg,,,,,\n`;
    const { items, issues } = parseProductImport(csv, [product({ sku: 'NL0004' })], NOW);
    expect(issues).toEqual([]);
    expect(items.map(p => [p.sku, p.name, p.itemGroup, p.category, p.cost])).toEqual([
      ['NL0005', 'Cà phê bột', 'ingredient', 'Cà phê', 180000],
      ['CC0001', 'Ly nhựa', 'tool', 'Công cụ', 500],
      ['NL0009', 'Đường', 'ingredient', 'Khác', 0],
    ]);
    expect(items[0]).toMatchObject({ brand: 'Trung Nguyên', unit: 'Kg', minStock: 5, maxStock: 50, location: 'Kệ A1', note: 'Ghi', trackStock: true, isActive: true, isAvailable: true, price: 0 });
    expect(new Set(items.map(p => p.id)).size).toBe(3);
  });

  it('collects every problem with its line instead of stopping at the first', () => {
    const csv = `${header}\n,,,,,,,,,,\n,Không tên mã,,,,,,,,,\n,Sai nhóm,Đồ chơi,,,,,,,,\nNL0001,Trùng mã,,,,,,,,,\n,Giá lỗi,,,,,abc,10,5,,\nA1,Một,,,,,,,,,\nA1,Hai cùng mã,,,,,,,,,\n`;
    const { items, issues } = parseProductImport(csv, [product({})], NOW);
    expect(items.map(p => p.name)).toEqual(['Không tên mã', 'Một']);
    expect(issues.map(i => i.line)).toEqual([4, 5, 6, 8]);
    expect(issues[0].message).toContain('nhóm quản lý "Đồ chơi"');
    expect(issues[1].message).toContain('"NL0001" đã có');
    expect(issues[2].message).toContain('Giá vốn "abc"');
    expect(issues[2].message).toContain('tồn tối thiểu lớn hơn tồn tối đa');
    expect(issues[3].message).toContain('"A1" đã có');
  });

  it('says which columns are missing and refuses a file with no data', () => {
    expect(parseProductImport('Tên,Giá\nA,1\n', [], NOW).issues[0].message).toContain('Thiếu cột: Mã hàng');
    expect(parseProductImport('', [], NOW).issues[0].message).toContain('không có dữ liệu');
    expect(parseProductImport('a,"b\nc', [], NOW).issues[0].message).toContain('ngoặc kép');
  });

  it('matches column names without caring for capitals, accents or the star, and reads a semicolon file', () => {
    const csv = 'ma hang;TEN HANG;nhom quan ly;nhom hang;thuong hieu;don vi tinh;gia von;ton toi thieu;ton toi da;vi tri;ghi chu\n;Trà;;;;;1.000;;;;\n';
    const { items, issues } = parseProductImport(csv, [], NOW);
    expect(issues).toEqual([]);
    expect(items[0]).toMatchObject({ name: 'Trà', cost: 1000 });
  });
});

describe('parseBatchImport', () => {
  const header = 'Mã hàng*,Mã lô*,Ngày sản xuất,Hạn sử dụng*,Giá nhập,Số lượng*,Đơn vị';
  const milk = product({ unitConversions: [{ name: 'Thùng', ratio: 24 }] });

  it('creates batches in the base unit, converting a unit such as Thùng, and takes the cost when the price is empty', () => {
    const csv = `${header}\nnl0001,l1,01/11/2026,31/12/2027,35.000,2,Thùng\nNL0001,L2,,2027-06-30,,10,\n`;
    const { items, issues } = parseBatchImport(csv, [milk], [], NOW);
    expect(issues).toEqual([]);
    expect(items[0].batch).toMatchObject({ productId: 'p1', batchCode: 'L1', manufactureDate: '2026-11-01', expiryDate: '2027-12-31', importPrice: 35000, quantity: 48, originalQuantity: 48 });
    expect(items[0]).toMatchObject({ typedQuantity: 2, typedUnit: 'Thùng' });
    expect(items[1].batch).toMatchObject({ batchCode: 'L2', manufactureDate: undefined, importPrice: 30000, quantity: 10 });
    expect(items[1]).toMatchObject({ typedQuantity: 10, typedUnit: 'Chai' });
  });

  it('collects every problem with its line', () => {
    const csv = `${header}\nXX,L1,,2027-01-01,,1,\nNL0001,,,2027-01-01,,1,\nNL0001,L9,,31/02/2027,,1,\nNL0001,L9,,2027-01-01,,0,\nNL0001,L9,2027-02-01,2027-01-01,,1,\nNL0001,L9,,2027-01-01,abc,1,\nNL0001,L9,,2027-01-01,,1,Bao\nNL0001,L1,,2027-01-01,,1,\nNL0001,OK,,2027-01-01,,1,\nNL0001,OK,,2027-01-01,,1,\n`;
    const { items, issues } = parseBatchImport(csv, [milk], [batch({ batchCode: 'L1' })], NOW);
    expect(items).toHaveLength(1);
    expect(issues.map(i => i.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 11]);
    expect(issues[0].message).toContain('chưa có trong danh mục');
    expect(issues[1].message).toContain('thiếu mã lô');
    expect(issues[2].message).toContain('không phải ngày hợp lệ');
    expect(issues[3].message).toContain('lớn hơn 0');
    expect(issues[4].message).toContain('sau hạn sử dụng');
    expect(issues[5].message).toContain('giá nhập "abc"');
    expect(issues[6].message).toContain('đơn vị "Bao" không có ở hàng này (Chai, Thùng)');
    expect(issues[7].message).toContain('"L1" đã có cho hàng này');
    expect(issues[8].message).toContain('"OK" đã có');
  });

  it('refuses a goods file given as a batch file', () => {
    expect(parseBatchImport(productTemplateCsv(), [milk], [], NOW).issues[0].message).toContain('Thiếu cột');
  });
});

describe('round trip', () => {
  it('a batch file written by the export of goods and batches can be understood by the same quoting rules', () => {
    const text = toCsv([['Mã hàng*', 'Mã lô*', 'Ngày sản xuất', 'Hạn sử dụng*', 'Giá nhập', 'Số lượng*', 'Đơn vị'], ['NL0001', 'L,1', '', '2027-01-01', '', '1', '']]);
    expect(parseBatchImport(text, [product({})], [], NOW).items[0].batch.batchCode).toBe('L,1');
  });
});
