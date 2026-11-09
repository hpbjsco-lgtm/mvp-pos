/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { InventoryBatch, Product, StocktakeKind } from '../types';
import { stockOf } from '../utils/inventoryItems';
import { parseNumberCell } from '../utils/inventoryCsv';
import { STOCKTAKE_KIND_LABELS, type StocktakeCount } from '../utils/stocktake';

interface StocktakeDialogProps {
  /** Items that can be counted. */
  products: Product[];
  /** Batches, to show the stock the system has for each item. */
  batches: InventoryBatch[];
  /** When in the shift the count is made; the person can change it. */
  initialKind: StocktakeKind;
  /** True to start with only the items marked "Kiểm mỗi ca" (when any are marked); false to show every item. */
  shiftItemsFirst: boolean;
  /** Records the count; called with the items that were counted, the note and the kind of stocktake. */
  onConfirm: (counts: StocktakeCount[], note: string, kind: StocktakeKind) => Promise<void> | void;
  onClose: () => void;
}

const ALL = 'Tất cả';

/**
 * Dialog for counting stock: the person types the quantity found for each item they counted, sees how it differs from
 * the system, and confirms. Items left empty are not counted and keep their stock.
 */
export default function StocktakeDialog({ products, batches, initialKind, shiftItemsFirst, onConfirm, onClose }: StocktakeDialogProps) {
  const items = useMemo(() => products.filter(p => p.trackStock !== false && p.isActive !== false && !p.isTopping), [products]);
  const categories = useMemo(() => [ALL, ...new Set(items.map(p => p.category).filter(Boolean))], [items]);
  const flagged = useMemo(() => items.filter(p => p.checkEachShift), [items]);
  const [onlyFlagged, setOnlyFlagged] = useState(shiftItemsFirst && flagged.length > 0);
  const [kind, setKind] = useState<StocktakeKind>(initialKind);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  /** What was typed for each item, as text so "0,5" and half-typed numbers are kept as they are. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const visible = (onlyFlagged ? flagged : items).filter(p => (category === ALL || p.category === category)
    && (!query.trim() || p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase())));

  /** Reads what was typed for an item: the number, null when empty, undefined when it is not a number. */
  const readCount = (productId: string): number | null | undefined => {
    const text = (typed[productId] ?? '').trim();
    if (text === '') return null;
    return parseNumberCell(text) ?? undefined;
  };

  const counted = items.flatMap(p => {
    const value = readCount(p.id);
    return typeof value === 'number' ? [{ product: p, counted: value, system: stockOf(p.id, batches) }] : [];
  });
  const invalid = items.filter(p => readCount(p.id) === undefined);
  const different = counted.filter(row => Math.abs(row.counted - row.system) > 1e-9);
  const surplus = different.filter(row => row.counted > row.system).length;

  /** Records the count after the person confirms. */
  const confirmCount = async () => {
    if (different.length === 0) { setError('Chưa có chênh lệch nào để ghi. Nhập số đếm thực tế của các hàng đã kiểm.'); return; }
    if (!confirm(`Ghi phiếu kiểm kho cho ${different.length} hàng chênh lệch (${surplus} thừa, ${different.length - surplus} thiếu)?\n\nTồn kho sẽ được điều chỉnh theo số đếm.`)) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(counted.map(row => ({ productId: row.product.id, counted: row.counted })), note.trim(), kind);
      onClose();
    } catch (confirmError) {
      setError((confirmError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[94vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-on-surface">Kiểm kho</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-sm text-on-surface-variant">
            Nhập số lượng đếm thực tế (theo đơn vị tính của hàng). Hàng để trống là chưa kiểm và giữ nguyên tồn. Khi xác nhận, tồn kho được điều chỉnh theo số đếm và ghi một phiếu kiểm kho.
          </p>

          <div className="flex flex-wrap gap-2 items-center">
            <select value={kind} onChange={e => setKind(e.target.value as StocktakeKind)} className="m3-input !min-h-11 sm:max-w-[10rem]" aria-label="Loại kiểm kho">
              {(Object.keys(STOCKTAKE_KIND_LABELS) as StocktakeKind[]).map(key => <option key={key} value={key}>{STOCKTAKE_KIND_LABELS[key]}</option>)}
            </select>
            {flagged.length > 0 && (
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer min-h-11">
                <input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} className="w-5 h-5 accent-primary" />
                Chỉ hàng kiểm mỗi ca ({flagged.length})
              </label>
            )}
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc mã hàng" className="m3-input !min-h-11 pl-10" />
            </div>
            <select value={category} onChange={e => setCategory(e.target.value)} className="m3-input !min-h-11 sm:max-w-[12rem]" aria-label="Nhóm hàng">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-outline-variant overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left bg-surface-container">
                  <th className="px-3 py-2 font-semibold">Mã</th>
                  <th className="px-3 py-2 font-semibold">Tên hàng</th>
                  <th className="px-3 py-2 font-semibold text-right">Tồn hệ thống</th>
                  <th className="px-3 py-2 font-semibold text-right w-32">Đếm thực tế</th>
                  <th className="px-3 py-2 font-semibold text-right">Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-on-surface-variant">Không có hàng nào</td></tr>}
                {visible.map(p => {
                  const system = stockOf(p.id, batches);
                  const value = readCount(p.id);
                  const delta = typeof value === 'number' ? value - system : null;
                  return (
                    <tr key={p.id} className="border-t border-outline-variant/50">
                      <td className="px-3 py-1.5 font-mono text-on-surface-variant">{p.sku}</td>
                      <td className="px-3 py-1.5 font-semibold">{p.name}</td>
                      <td className={`px-3 py-1.5 text-right ${system < 0 ? 'text-error font-bold' : ''}`}>{number(system)} {p.unit ?? ''}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text" inputMode="decimal" value={typed[p.id] ?? ''} placeholder="—"
                          onChange={e => setTyped(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className={`m3-input !min-h-9 !px-2 text-right ${value === undefined ? '!border-error' : ''}`} aria-label={`Số đếm ${p.name}`}
                        />
                      </td>
                      <td className={`px-3 py-1.5 text-right font-bold ${delta === null ? 'text-on-surface-variant' : delta > 1e-9 ? 'text-secondary' : delta < -1e-9 ? 'text-error' : ''}`}>
                        {delta === null ? '' : delta > 1e-9 ? `+${number(delta)}` : number(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (tùy chọn), ví dụ: kiểm kho cuối tháng" className="m3-input" />

          {invalid.length > 0 && <p className="text-sm font-semibold text-error">Có {invalid.length} ô chưa phải là số hợp lệ (ví dụ: {invalid[0].name}). Hãy sửa hoặc xóa trắng.</p>}
          {error && <p className="text-sm font-semibold rounded-xl p-3 bg-error-container text-on-error-container">{error}</p>}
        </div>

        <div className="p-4 border-t border-outline-variant flex items-center gap-3 shrink-0">
          <p className="text-sm text-on-surface-variant flex-1">
            Đã đếm {counted.length} hàng, {different.length} hàng chênh lệch
          </p>
          <button type="button" disabled={busy || invalid.length > 0 || counted.length === 0} onClick={() => void confirmCount()} className="m3-btn-filled !min-h-12 disabled:opacity-40">
            {busy ? 'Đang ghi...' : 'Xác nhận kiểm kho'}
          </button>
          <button type="button" onClick={onClose} className="m3-btn-outlined !min-h-12">Đóng</button>
        </div>
      </div>
    </div>
  );
}
