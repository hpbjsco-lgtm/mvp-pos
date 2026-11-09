/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { InventoryTransaction, Product, Shift, StocktakeKind } from '../types';
import { datedFileName, saveTextFile } from '../utils/downloadFile';
import { STOCKTAKE_KIND_LABELS } from '../utils/stocktake';
import { lineValue, listStocktakes, stocktakesToCsv } from '../utils/stocktakeHistory';

interface StocktakeHistoryProps {
  /** Stock vouchers of this kind of stock (the stocktakes are picked out). */
  transactions: InventoryTransaction[];
  products: Product[];
  shifts: Shift[];
}

type PeriodPreset = 'today' | 'week' | 'month' | 'all';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Hôm nay' }, { id: 'week', label: '7 ngày' }, { id: 'month', label: '30 ngày' }, { id: 'all', label: 'Tất cả' },
];

const money = (value: number) => Math.round(value).toLocaleString('vi-VN');
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const formatTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * History of stocktakes: every count with when, who, which shift, how many items differed and the value of the
 * difference; one row opens the lines (stock before, counted, difference). It can be narrowed and saved as CSV.
 */
export default function StocktakeHistory({ transactions, products, shifts }: StocktakeHistoryProps) {
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [shiftId, setShiftId] = useState('');
  const [kind, setKind] = useState<StocktakeKind | ''>('');
  const [staffName, setStaffName] = useState('');
  const [item, setItem] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (preset === 'all') return {};
    const now = new Date();
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    if (preset === 'week') from.setDate(from.getDate() - 6);
    if (preset === 'month') from.setDate(from.getDate() - 29);
    return { from: from.getTime(), to: to.getTime() };
  }, [preset]);

  const entries = useMemo(
    () => listStocktakes(transactions, shifts, { ...range, shiftId, kind, staffName, item }, products),
    [transactions, shifts, range, shiftId, kind, staffName, item, products],
  );
  const all = useMemo(() => listStocktakes(transactions, shifts), [transactions, shifts]);
  const staffNames = [...new Set(all.map(entry => entry.voucher.staffName).filter(Boolean) as string[])].sort();
  const usedShifts = shifts.filter(shift => all.some(entry => entry.voucher.shiftId === shift.id));
  const productById = new Map(products.map(product => [product.id, product]));

  const download = async () => {
    try {
      await saveTextFile(datedFileName('kho-lich-su-kiem-kho'), stocktakesToCsv(entries, products));
    } catch (error) {
      alert(`Không lưu được file: ${(error as Error).message}`);
    }
  };

  const total = entries.reduce((sum, entry) => sum + entry.netValue, 0);

  return (
    <div className="m3-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-on-surface">Lịch sử kiểm kho ({entries.length})</h3>
        <button type="button" onClick={() => void download()} disabled={entries.length === 0} className="m3-btn-outlined !min-h-10 text-sm disabled:opacity-40">Xuất CSV</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map(option => (
          <button key={option.id} type="button" onClick={() => setPreset(option.id)}
            className={`min-h-10 px-3.5 rounded-full text-sm font-bold cursor-pointer ${preset === option.id ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as StocktakeKind | '')} className="m3-input !min-h-10 text-sm" aria-label="Loại kiểm">
          <option value="">Mọi loại kiểm</option>
          {(Object.keys(STOCKTAKE_KIND_LABELS) as StocktakeKind[]).map(key => <option key={key} value={key}>{STOCKTAKE_KIND_LABELS[key]}</option>)}
        </select>
        <select value={shiftId} onChange={e => setShiftId(e.target.value)} className="m3-input !min-h-10 text-sm" aria-label="Ca">
          <option value="">Mọi ca</option>
          {usedShifts.map(shift => <option key={shift.id} value={shift.id}>{shift.staffName}, {new Date(shift.openedAt).toLocaleDateString('vi-VN')}</option>)}
        </select>
        <select value={staffName} onChange={e => setStaffName(e.target.value)} className="m3-input !min-h-10 text-sm" aria-label="Người kiểm">
          <option value="">Mọi người kiểm</option>
          {staffNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <input value={item} onChange={e => setItem(e.target.value)} placeholder="Tìm hàng theo tên hoặc mã" className="m3-input !min-h-10 text-sm" />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-3">Chưa có lần kiểm kho nào trong bộ lọc này.</p>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">Tổng chênh lệch: <strong className={total < 0 ? 'text-error' : 'text-on-surface'}>{money(total)} đ</strong> (thừa +, thiếu −)</p>
          <div className="divide-y divide-outline-variant/60">
            {entries.map(entry => {
              const { voucher } = entry;
              const open = openId === voucher.id;
              return (
                <div key={voucher.id}>
                  <button type="button" onClick={() => setOpenId(open ? null : voucher.id)} className="w-full text-left py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 cursor-pointer">
                    <span className="font-mono font-bold text-sm">{voucher.transactionNumber}</span>
                    <span className="text-sm text-on-surface-variant">{formatTime(voucher.createdAt)}</span>
                    {voucher.stocktakeKind && <span className="m3-badge m3-badge-neutral">{STOCKTAKE_KIND_LABELS[voucher.stocktakeKind]}</span>}
                    <span className="text-sm text-on-surface-variant">{voucher.staffName || '—'}</span>
                    {entry.shiftName && <span className="text-sm text-on-surface-variant">Ca: {entry.shiftName}</span>}
                    <span className="text-sm">{entry.differentItems} hàng chênh lệch</span>
                    <span className={`ml-auto text-sm font-bold ${entry.netValue < 0 ? 'text-error' : entry.netValue > 0 ? 'text-secondary' : ''}`}>{entry.netValue > 0 ? '+' : ''}{money(entry.netValue)} đ</span>
                  </button>
                  {open && (
                    <div className="pb-3 space-y-2">
                      {voucher.note && <p className="text-sm text-on-surface-variant">{voucher.note}</p>}
                      <div className="overflow-x-auto rounded-xl border border-outline-variant">
                        <table className="w-full text-sm min-w-[520px]">
                          <thead><tr className="text-left bg-surface-container">
                            <th className="px-3 py-2 font-semibold">Hàng</th>
                            <th className="px-3 py-2 font-semibold text-right">Tồn hệ thống</th>
                            <th className="px-3 py-2 font-semibold text-right">Đếm thực tế</th>
                            <th className="px-3 py-2 font-semibold text-right">Chênh lệch</th>
                            <th className="px-3 py-2 font-semibold text-right">Giá trị</th>
                          </tr></thead>
                          <tbody>
                            {voucher.items.map((line, index) => {
                              const product = productById.get(line.productId);
                              const unit = product?.unit ? ` ${product.unit}` : '';
                              return (
                                <tr key={index} className="border-t border-outline-variant/50">
                                  <td className="px-3 py-1.5"><span className="font-semibold">{product?.name ?? 'Hàng đã xóa'}</span> <span className="font-mono text-on-surface-variant">{product?.sku}</span></td>
                                  <td className="px-3 py-1.5 text-right">{line.systemQuantity === undefined ? '—' : `${number(line.systemQuantity)}${unit}`}</td>
                                  <td className="px-3 py-1.5 text-right">{line.countedQuantity === undefined ? '—' : `${number(line.countedQuantity)}${unit}`}</td>
                                  <td className={`px-3 py-1.5 text-right font-bold ${line.quantity < 0 ? 'text-error' : 'text-secondary'}`}>{line.quantity > 0 ? '+' : ''}{number(line.quantity)}</td>
                                  <td className={`px-3 py-1.5 text-right ${lineValue(line) < 0 ? 'text-error' : ''}`}>{money(lineValue(line))} đ</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
