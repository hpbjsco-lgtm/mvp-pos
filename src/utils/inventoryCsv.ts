/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryBatch, InventoryTransaction, InventoryTransactionType, Product } from '../types';
import { parseCsv, toCsv, type CsvRow } from './csv';
import { nextItemCode, stockOf, toBaseQuantity, unitChoices } from './inventoryItems';

/** A problem found in an import file; `line` is the line of the file (the header is line 1). */
export interface ImportIssue {
  line: number;
  message: string;
}

/** Result of reading an import file: the records that can be added and the problems found. */
export interface ImportResult<T> {
  items: T[];
  issues: ImportIssue[];
}

/** One line of a batch import file, ready to become a batch. */
export interface BatchImportItem {
  batch: InventoryBatch;
  /** Quantity the person typed and its unit, for the voucher note. */
  typedQuantity: number;
  typedUnit: string;
}

/** Marks a line of the template as instructions or an example: the reader skips lines that start with it. */
const COMMENT = '#';

const yesNo = (value: boolean) => (value ? 'Có' : 'Không');
const GROUP_LABELS = { ingredient: 'Nguyên vật liệu', tool: 'Công cụ dụng cụ' } as const;
const TYPE_LABELS: Record<InventoryTransactionType, string> = {
  [InventoryTransactionType.IMPORT]: 'Nhập', [InventoryTransactionType.EXPORT]: 'Xuất', [InventoryTransactionType.ADJUSTMENT]: 'Điều chỉnh',
};

/**
 * Formats a date as yyyy-mm-dd for a file, whatever the input form.
 *
 * @param iso ISO date or date-time.
 * @returns The date part, or empty text for an empty input.
 */
const dateOnly = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '');

/**
 * Formats a time as "yyyy-mm-dd HH:mm" in the local time of the computer.
 *
 * @param iso ISO date-time.
 * @returns The local date and time.
 */
function localDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/**
 * The list of goods (code, name, group, unit, cost, stock limits, stock) as CSV.
 *
 * @param products Goods to list.
 * @param batches Batches, to sum the stock of each item.
 * @returns CSV text.
 */
export function productsToCsv(products: Product[], batches: InventoryBatch[]): string {
  return toCsv([
    ['Mã hàng', 'Tên hàng', 'Nhóm quản lý', 'Nhóm hàng', 'Thương hiệu', 'Đơn vị tính', 'Giá vốn', 'Tồn tối thiểu', 'Tồn tối đa', 'Tồn kho', 'Vị trí', 'Ghi chú', 'Đang kinh doanh'],
    ...products.map(p => [
      p.sku, p.name, GROUP_LABELS[p.itemGroup ?? 'ingredient'], p.category, p.brand ?? '', p.unit ?? '', p.cost, p.minStock ?? '', p.maxStock ?? '',
      +stockOf(p.id, batches).toFixed(6), p.location ?? '', p.note ?? '', yesNo(p.isActive !== false),
    ]),
  ]);
}

/**
 * The batches in stock (item, batch code, dates, price, quantities) as CSV.
 *
 * @param batches Batches to list.
 * @param products Goods, to give each batch its item code and name.
 * @returns CSV text.
 */
export function batchesToCsv(batches: InventoryBatch[], products: Product[]): string {
  const byId = new Map(products.map(p => [p.id, p]));
  return toCsv([
    ['Mã hàng', 'Tên hàng', 'Mã lô', 'Ngày sản xuất', 'Hạn sử dụng', 'Giá nhập', 'Số lượng nhập', 'Tồn hiện tại', 'Đơn vị tính'],
    ...batches.map(b => {
      const p = byId.get(b.productId);
      return [p?.sku ?? '', p?.name ?? '', b.batchCode, dateOnly(b.manufactureDate), dateOnly(b.expiryDate), b.importPrice ?? '', b.originalQuantity, b.quantity, p?.unit ?? ''];
    }),
  ]);
}

/**
 * The stock vouchers, one row per line of a voucher, as CSV.
 *
 * @param transactions Vouchers to list.
 * @param products Goods, to give each line its item code and name.
 * @returns CSV text.
 */
export function transactionsToCsv(transactions: InventoryTransaction[], products: Product[]): string {
  const byId = new Map(products.map(p => [p.id, p]));
  return toCsv([
    ['Số phiếu', 'Mã tạm', 'Loại phiếu', 'Thời gian', 'Mã hàng', 'Tên hàng', 'Mã lô', 'Số lượng', 'Đơn giá', 'Ghi chú'],
    ...transactions.flatMap(t => t.items.map(item => {
      const p = byId.get(item.productId);
      return [t.transactionNumber, t.tempCode ?? '', TYPE_LABELS[t.type] ?? t.type, localDateTime(t.createdAt), p?.sku ?? '', p?.name ?? '', item.batchCode, item.quantity, item.price ?? '', t.note ?? ''];
    })),
  ]);
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** Columns of the goods import file, in order; `*` marks a required column. */
const PRODUCT_HEADERS = ['Mã hàng', 'Tên hàng*', 'Nhóm quản lý', 'Nhóm hàng', 'Thương hiệu', 'Đơn vị tính', 'Giá vốn', 'Tồn tối thiểu', 'Tồn tối đa', 'Vị trí', 'Ghi chú'] as const;

/** Columns of the batch import file, in order; `*` marks a required column. */
const BATCH_HEADERS = ['Mã hàng*', 'Mã lô*', 'Ngày sản xuất', 'Hạn sử dụng*', 'Giá nhập', 'Số lượng*', 'Đơn vị'] as const;

/**
 * Template of the goods import file: the header, instruction lines and an example row (lines that start with # are
 * skipped when the file is read).
 *
 * @returns CSV text.
 */
export function productTemplateCsv(): string {
  return toCsv([
    ['# Hướng dẫn: điền từ dòng dưới tiêu đề. Dòng bắt đầu bằng # là ghi chú và sẽ được bỏ qua. Lưu file dạng CSV UTF-8.'],
    ['# Mã hàng: để trống thì tự đặt (NL0001, CC0001). Nhóm quản lý: Nguyên vật liệu hoặc Công cụ dụng cụ (để trống = Nguyên vật liệu). Chỉ thêm hàng mới, mã đã có sẽ báo lỗi.'],
    [...PRODUCT_HEADERS],
    ['#VD', 'Cà phê bột Robusta', 'Nguyên vật liệu', 'Cà phê', 'Trung Nguyên', 'Kg', 180000, 5, 50, 'Kệ A1', 'Ví dụ, xóa dòng này'],
  ]);
}

/**
 * Template of the batch import file.
 *
 * @returns CSV text.
 */
export function batchTemplateCsv(): string {
  return toCsv([
    ['# Hướng dẫn: mỗi dòng là một lô hàng nhập kho. Mã hàng phải đã có trong danh mục. Ngày dạng 31/12/2026 hoặc 2026-12-31.'],
    ['# Đơn vị: để trống = đơn vị tính của hàng, hoặc tên đơn vị quy đổi (ví dụ Thùng). Giá nhập để trống = giá vốn của hàng. Dòng bắt đầu bằng # sẽ được bỏ qua.'],
    [...BATCH_HEADERS],
    ['#VD', 'LOT-2026-01', '01/11/2026', '31/12/2027', 180000, 20, 'Kg'],
  ]);
}

/* ------------------------------------------------------------------ */
/* Reading cells                                                       */
/* ------------------------------------------------------------------ */

/**
 * Reads a number typed in a cell: plain digits with a decimal point or comma, or Vietnamese thousands with dots
 * (25.000). Anything else is not a number.
 *
 * @param text Cell text.
 * @returns The number, or null when the text is not a number.
 */
export function parseNumberCell(text: string): number | null {
  const value = text.replace(/\s/g, '');
  if (value === '') return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) return Number(value.replace(/\./g, ''));
  if (/^\d+([.,]\d+)?$/.test(value)) return Number(value.replace(',', '.'));
  return null;
}

/**
 * Reads a date typed in a cell as yyyy-mm-dd, dd/mm/yyyy or dd-mm-yyyy and checks that it exists.
 *
 * @param text Cell text.
 * @returns The date as yyyy-mm-dd, or null when the text is not a real date.
 */
export function parseDateCell(text: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const vn = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  const parts = iso ? { y: +iso[1], m: +iso[2], d: +iso[3] } : vn ? { y: +vn[3], m: +vn[2], d: +vn[1] } : null;
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (date.getUTCFullYear() !== parts.y || date.getUTCMonth() !== parts.m - 1 || date.getUTCDate() !== parts.d) return null;
  return `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
}

/**
 * @param text Text to compare.
 * @returns The text without accents, spaces at the ends or a trailing `*`, in lower case: header names match whatever the capitals.
 */
const normalizeName = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\*/g, '').trim().toLowerCase();

/**
 * Maps the header row to column positions.
 *
 * @param headerRow The first row of the file.
 * @param expected The columns the file must have, in the template's wording.
 * @returns Position of each expected column by its name without `*`, or the list of missing columns.
 */
function mapHeaders(headerRow: CsvRow, expected: readonly string[]): { columns: Map<string, number>; missing: string[] } {
  const present = new Map(headerRow.cells.map((cell, index) => [normalizeName(cell), index]));
  const columns = new Map<string, number>();
  const missing: string[] = [];
  for (const header of expected) {
    const index = present.get(normalizeName(header));
    if (index === undefined) missing.push(header.replace('*', ''));
    else columns.set(header.replace('*', ''), index);
  }
  return { columns, missing };
}

/**
 * Reads CSV text into rows, turning a damaged file into an issue.
 *
 * @param text File content.
 * @returns The rows, or the issue that stopped reading.
 */
function readRows(text: string): { rows: CsvRow[]; issue?: ImportIssue } {
  try {
    return { rows: parseCsv(text) };
  } catch (error) {
    return { rows: [], issue: { line: 1, message: (error as Error).message } };
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reads a goods import file. Every row must be valid for any to be imported: the caller shows the issues and adds
 * nothing while there are some.
 *
 * @param text File content.
 * @param existing Goods already in the list (their codes cannot be used again).
 * @param now Time stamped on the new goods.
 * @returns The new goods and the issues found.
 */
export function parseProductImport(text: string, existing: Product[], now: Date = new Date()): ImportResult<Product> {
  const { rows, issue } = readRows(text);
  if (issue) return { items: [], issues: [issue] };
  if (rows.length === 0) return { items: [], issues: [{ line: 1, message: 'File không có dữ liệu. Hãy dùng file mẫu.' }] };
  const { columns, missing } = mapHeaders(rows[0], PRODUCT_HEADERS);
  if (missing.length > 0) return { items: [], issues: [{ line: rows[0].line, message: `Thiếu cột: ${missing.join(', ')}. Hãy dùng đúng file mẫu.` }] };

  const issues: ImportIssue[] = [];
  const items: Product[] = [];
  const usedSkus = new Set(existing.map(p => p.sku.toLowerCase()));
  const all: Pick<Product, 'sku'>[] = [...existing];
  const cell = (row: CsvRow, name: string) => row.cells[columns.get(name)!] ?? '';

  rows.slice(1).forEach((row, index) => {
    const problems: string[] = [];
    const name = cell(row, 'Tên hàng');
    if (!name) problems.push('thiếu tên hàng');

    const groupText = normalizeName(cell(row, 'Nhóm quản lý'));
    const group = groupText === '' || groupText === 'nguyen vat lieu' ? 'ingredient' : groupText === 'cong cu dung cu' ? 'tool' : null;
    if (!group) problems.push(`nhóm quản lý "${cell(row, 'Nhóm quản lý')}" không đúng (chọn Nguyên vật liệu hoặc Công cụ dụng cụ)`);

    const number = (column: string): number | undefined => {
      const text = cell(row, column);
      if (text === '') return undefined;
      const value = parseNumberCell(text);
      if (value === null) problems.push(`${column} "${text}" không phải số`);
      return value ?? undefined;
    };
    const cost = number('Giá vốn');
    const minStock = number('Tồn tối thiểu');
    const maxStock = number('Tồn tối đa');
    if (minStock !== undefined && maxStock !== undefined && maxStock > 0 && minStock > maxStock) problems.push('tồn tối thiểu lớn hơn tồn tối đa');

    let sku = cell(row, 'Mã hàng');
    if (sku && usedSkus.has(sku.toLowerCase())) problems.push(`mã hàng "${sku}" đã có`);
    if (problems.length > 0) {
      issues.push({ line: row.line, message: `${problems.join('; ')}.` });
      return;
    }
    if (!sku) sku = nextItemCode(all, group === 'tool' ? 'CC' : 'NL');
    usedSkus.add(sku.toLowerCase());
    all.push({ sku });
    items.push({
      id: `ING-${now.getTime()}-${index}`,
      sku,
      name,
      price: 0,
      cost: cost ?? 0,
      category: cell(row, 'Nhóm hàng') || (group === 'tool' ? 'Công cụ' : 'Khác'),
      brand: cell(row, 'Thương hiệu') || undefined,
      unit: cell(row, 'Đơn vị tính') || undefined,
      itemGroup: group!,
      trackStock: true,
      minStock: minStock || undefined,
      maxStock: maxStock || undefined,
      location: cell(row, 'Vị trí') || undefined,
      note: cell(row, 'Ghi chú') || undefined,
      isActive: true,
      isAvailable: true,
      createdAt: now.toISOString(),
    });
  });
  return { items, issues };
}

/**
 * Reads a batch import file. Every row must be valid for any to be imported.
 *
 * @param text File content.
 * @param products Goods a batch can belong to (matched by code).
 * @param batches Batches already in stock (a batch code cannot be used twice for the same item).
 * @param now Time stamped on the new batches.
 * @returns The new batches and the issues found.
 */
export function parseBatchImport(text: string, products: Product[], batches: InventoryBatch[], now: Date = new Date()): ImportResult<BatchImportItem> {
  const { rows, issue } = readRows(text);
  if (issue) return { items: [], issues: [issue] };
  if (rows.length === 0) return { items: [], issues: [{ line: 1, message: 'File không có dữ liệu. Hãy dùng file mẫu.' }] };
  const { columns, missing } = mapHeaders(rows[0], BATCH_HEADERS);
  if (missing.length > 0) return { items: [], issues: [{ line: rows[0].line, message: `Thiếu cột: ${missing.join(', ')}. Hãy dùng đúng file mẫu.` }] };

  const bySku = new Map(products.map(p => [p.sku.toLowerCase(), p]));
  const usedCodes = new Set(batches.map(b => `${b.productId}|${b.batchCode.toUpperCase()}`));
  const issues: ImportIssue[] = [];
  const items: BatchImportItem[] = [];
  const cell = (row: CsvRow, name: string) => row.cells[columns.get(name)!] ?? '';

  rows.slice(1).forEach((row, index) => {
    const problems: string[] = [];
    const product = bySku.get(cell(row, 'Mã hàng').toLowerCase());
    if (!product) problems.push(`mã hàng "${cell(row, 'Mã hàng')}" chưa có trong danh mục`);

    const batchCode = cell(row, 'Mã lô').toUpperCase();
    if (!batchCode) problems.push('thiếu mã lô');
    else if (product && usedCodes.has(`${product.id}|${batchCode}`)) problems.push(`mã lô "${batchCode}" đã có cho hàng này`);

    const expiryText = cell(row, 'Hạn sử dụng');
    const expiryDate = expiryText ? parseDateCell(expiryText) : null;
    if (!expiryDate) problems.push(expiryText ? `hạn sử dụng "${expiryText}" không phải ngày hợp lệ` : 'thiếu hạn sử dụng');

    const manufactureText = cell(row, 'Ngày sản xuất');
    const manufactureDate = manufactureText ? parseDateCell(manufactureText) : null;
    if (manufactureText && !manufactureDate) problems.push(`ngày sản xuất "${manufactureText}" không phải ngày hợp lệ`);
    if (manufactureDate && expiryDate && manufactureDate > expiryDate) problems.push('ngày sản xuất sau hạn sử dụng');

    const quantityText = cell(row, 'Số lượng');
    const typedQuantity = parseNumberCell(quantityText);
    if (typedQuantity === null || typedQuantity <= 0) problems.push(quantityText ? `số lượng "${quantityText}" phải là số lớn hơn 0` : 'thiếu số lượng');

    const priceText = cell(row, 'Giá nhập');
    const price = priceText ? parseNumberCell(priceText) : undefined;
    if (price === null) problems.push(`giá nhập "${priceText}" không phải số`);

    const unitText = cell(row, 'Đơn vị');
    if (product && unitText && !unitChoices(product).some(u => u.name.toLowerCase() === unitText.toLowerCase())) {
      problems.push(`đơn vị "${unitText}" không có ở hàng này (${unitChoices(product).map(u => u.name).join(', ') || 'chưa khai báo đơn vị'})`);
    }
    if (product && problems.length === 0) usedCodes.add(`${product.id}|${batchCode}`);
    if (problems.length > 0) {
      issues.push({ line: row.line, message: `${problems.join('; ')}.` });
      return;
    }
    const unit = unitText ? unitChoices(product!).find(u => u.name.toLowerCase() === unitText.toLowerCase())!.name : product!.unit ?? '';
    const baseQuantity = toBaseQuantity(product!, unit, typedQuantity!);
    items.push({
      typedQuantity: typedQuantity!,
      typedUnit: unit,
      batch: {
        id: `B-${now.getTime()}-${index}`,
        productId: product!.id,
        batchCode,
        expiryDate: expiryDate!,
        manufactureDate: manufactureDate || undefined,
        importPrice: price ?? product!.cost,
        quantity: baseQuantity,
        originalQuantity: baseQuantity,
        createdAt: now.toISOString(),
      },
    });
  });
  return { items, issues };
}
