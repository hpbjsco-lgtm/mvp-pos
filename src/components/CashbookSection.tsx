/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { BankAccount, CashVoucher, FundType, Order } from '../types';
import {
  FUND_LABELS, PAYMENT_CATEGORIES, RECEIPT_CATEGORIES, breakdownByCategory, buildLedger, entriesInRange,
  nextVoucherCode, presetRange, summarize, type RangePreset,
} from '../utils/cashbook';
import BankAccountsDialog from './BankAccountsDialog';
import PageCard from './ui/PageCard';
import FilterPills from './ui/FilterPills';
import ListToolbar from './ui/ListToolbar';
import DataTable from './ui/DataTable';

interface CashbookSectionProps {
  simOrders: Order[];
  bankAccounts: BankAccount[];
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  vouchers: CashVoucher[];
  setVouchers: React.Dispatch<React.SetStateAction<CashVoucher[]>>;
  staffName: string;
  triggerBeep: (success: boolean) => void;
}

const money = (n: number) => n.toLocaleString('vi-VN');
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const toDateInput = (ms: number) => toLocalInput(new Date(ms)).slice(0, 10);

type VoucherForm = {
  type: 'receipt' | 'payment'; fund: FundType; bankAccountId: string; amount: number; category: string;
  counterparty: string; phone: string; note: string; time: string;
};

/**
 * Sổ quỹ & Dòng tiền: theo dõi thu / chi theo từng loại quỹ (tiền mặt, ngân hàng, ví điện tử) và từng loại thu chi.
 * Khoản thu từ bán hàng được lấy tự động từ hóa đơn; phiếu thu / chi khác lập tay.
 */
export default function CashbookSection({ simOrders, bankAccounts, setBankAccounts, vouchers, setVouchers, staffName, triggerBeep }: CashbookSectionProps) {
  const [fund, setFund] = useState<FundType | 'all'>('all');
  const [accountId, setAccountId] = useState('');
  const [preset, setPreset] = useState<RangePreset>('month');
  const [customFrom, setCustomFrom] = useState(toDateInput(Date.now()));
  const [customTo, setCustomTo] = useState(toDateInput(Date.now()));
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'receipt' | 'payment'>('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [form, setForm] = useState<VoucherForm | null>(null);
  const [formError, setFormError] = useState('');
  const [bankOpen, setBankOpen] = useState(false);

  const range = useMemo(() => {
    if (preset === 'custom') {
      return { from: new Date(`${customFrom}T00:00:00`).getTime(), to: new Date(`${customTo}T23:59:59.999`).getTime() };
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const ledger = useMemo(() => buildLedger(simOrders, vouchers, bankAccounts), [simOrders, vouchers, bankAccounts]);
  const filter = { fund, bankAccountId: fund === 'bank' && accountId ? accountId : undefined, from: range.from, to: range.to };
  const summary = summarize(ledger, filter);
  const inRange = entriesInRange(ledger, filter);
  const breakdown = breakdownByCategory(inRange);
  const maxBreak = Math.max(1, ...breakdown.map(b => b.total));

  const rows = inRange.filter(e => {
    if (!showCancelled && e.status === 'cancelled') return false;
    if (kind !== 'all' && e.kind !== kind) return false;
    const q = search.trim().toLowerCase();
    return !q || e.code.toLowerCase().includes(q) || e.counterparty.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q);
  });

  const accountName = (id?: string) => bankAccounts.find(a => a.id === id)?.accountName;

  const openForm = (type: 'receipt' | 'payment') => {
    setForm({
      type, fund: 'cash', bankAccountId: bankAccounts.find(a => a.isDefault)?.id || bankAccounts[0]?.id || '', amount: 0,
      category: '', counterparty: '', phone: '', note: '', time: toLocalInput(new Date()),
    });
    setFormError('');
    triggerBeep(true);
  };

  const saveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.amount <= 0) { setFormError('Vui lòng nhập số tiền lớn hơn 0.'); return; }
    if (form.fund === 'bank' && !form.bankAccountId) { setFormError('Chưa có tài khoản ngân hàng. Hãy thêm tài khoản trước.'); return; }
    const voucher: CashVoucher = {
      id: `CV-${Date.now()}`,
      code: nextVoucherCode(vouchers, form.type),
      type: form.type,
      fund: form.fund,
      bankAccountId: form.fund === 'bank' ? form.bankAccountId : undefined,
      amount: form.amount,
      category: form.category.trim() || (form.type === 'receipt' ? 'Thu khác' : 'Chi khác'),
      counterparty: form.counterparty.trim() || undefined,
      phone: form.phone.trim() || undefined,
      note: form.note.trim() || undefined,
      status: 'paid',
      createdBy: staffName,
      createdAt: new Date(form.time).toISOString(),
    };
    setVouchers(prev => [voucher, ...prev]);
    setForm(null);
    triggerBeep(true);
  };

  const cancelVoucher = (voucherEntryId: string) => {
    const id = voucherEntryId.replace(/^voucher-/, '');
    if (!confirm('Hủy phiếu này? Phiếu hủy không còn được tính vào sổ quỹ.')) return;
    setVouchers(prev => prev.map(v => (v.id === id ? { ...v, status: 'cancelled' } : v)));
    triggerBeep(true);
  };

  const funds: { id: FundType | 'all'; label: string }[] = [
    { id: 'all', label: 'Tổng quỹ' }, { id: 'cash', label: 'Tiền mặt' }, { id: 'bank', label: 'Ngân hàng' }, { id: 'wallet', label: 'Ví điện tử' },
  ];
  const presets: { id: RangePreset; label: string }[] = [
    { id: 'today', label: 'Hôm nay' }, { id: 'week', label: 'Tuần này' }, { id: 'month', label: 'Tháng này' }, { id: 'year', label: 'Năm nay' }, { id: 'custom', label: 'Tùy chọn' },
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageCard
        title="Sổ quỹ & Dòng tiền"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => openForm('receipt')} className="m3-btn-filled !min-h-11 !rounded-xl text-sm"><Plus className="w-4 h-4" /> Lập phiếu thu</button>
            <button onClick={() => openForm('payment')} className="m3-btn-tonal !min-h-11 !rounded-xl text-sm"><Plus className="w-4 h-4" /> Lập phiếu chi</button>
            <button onClick={() => setBankOpen(true)} className="m3-btn-outlined !min-h-11 !rounded-xl text-sm">Tài khoản ngân hàng ({bankAccounts.length})</button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant -mt-2">Theo dõi thu / chi theo từng quỹ và từng loại thu chi</p>

        <FilterPills
          options={funds.map(f => ({ value: f.id, label: f.label }))}
          value={fund}
          onChange={fundId => { setFund(fundId); if (fundId !== 'bank') setAccountId(''); }}
        />

        <div className="flex flex-wrap items-center gap-2">
          {fund === 'bank' && (
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="m3-input !min-h-10 max-w-xs" aria-label="Tài khoản ngân hàng">
              <option value="">Tất cả tài khoản</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.accountName} ({a.bankCode})</option>)}
            </select>
          )}
          <FilterPills options={presets.map(p => ({ value: p.id, label: p.label }))} value={preset} onChange={setPreset} />
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="m3-input !min-h-10 !w-40" />
              <span>–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="m3-input !min-h-10 !w-40" />
            </div>
          )}
        </div>

        <ListToolbar
          filters={
            <div className="flex flex-wrap items-center gap-3">
              <select value={kind} onChange={e => setKind(e.target.value as any)} className="m3-input !min-h-10 !w-36" aria-label="Loại phiếu">
                <option value="all">Thu &amp; chi</option><option value="receipt">Chỉ thu</option><option value="payment">Chỉ chi</option>
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="w-4.5 h-4.5 accent-primary" /> Hiện phiếu đã hủy
              </label>
            </div>
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Tìm mã phiếu, người nộp/nhận, loại thu chi..."
        />

        {/* Tổng hợp */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Quỹ đầu kỳ', summary.opening, 'text-on-surface'],
            ['Tổng thu', summary.totalIn, 'text-secondary'],
            ['Tổng chi', summary.totalOut, 'text-error'],
            ['Tồn quỹ', summary.closing, 'text-primary'],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="border border-outline-variant rounded-2xl p-4">
              <p className="text-sm font-semibold text-on-surface-variant">{label}</p>
              <p className={`text-2xl font-black ${tone}`}>{money(value as number)}</p>
            </div>
          ))}
        </div>

        {/* Dòng tiền theo loại */}
        <div className="border border-outline-variant rounded-2xl p-4 space-y-3">
          <h3 className="text-lg font-bold text-on-surface">Dòng tiền theo loại thu chi</h3>
          {breakdown.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Chưa có khoản thu chi nào trong kỳ này.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-2.5">
              {breakdown.map(b => (
                <div key={`${b.kind}-${b.category}`} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold text-on-surface truncate">{b.kind === 'receipt' ? 'Thu' : 'Chi'} · {b.category} <span className="text-on-surface-variant font-normal">({b.count})</span></span>
                    <span className={`font-bold shrink-0 ${b.kind === 'receipt' ? 'text-secondary' : 'text-error'}`}>{b.kind === 'receipt' ? '+' : '-'}{money(b.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div className={`h-full rounded-full ${b.kind === 'receipt' ? 'bg-secondary' : 'bg-error'}`} style={{ width: `${(b.total / maxBreak) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danh sách */}
        <DataTable
          rows={rows}
          rowKey={e => e.id}
          emptyMessage="Không có khoản nào phù hợp"
          columns={[
            { key: 'code', header: 'Mã phiếu', render: e => <span className={`font-mono font-bold ${e.status === 'cancelled' ? 'opacity-50' : ''}`}>{e.code}{e.status === 'cancelled' && <span className="m3-badge m3-badge-error ml-2">Đã hủy</span>}</span> },
            { key: 'time', header: 'Thời gian', className: 'whitespace-nowrap', render: e => new Date(e.time).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) },
            { key: 'category', header: 'Loại thu chi', render: e => <>{e.category}{e.note ? <span className="block text-sm text-on-surface-variant">{e.note}</span> : null}</> },
            { key: 'counterparty', header: 'Người nộp / nhận', render: e => e.counterparty || '—' },
            { key: 'fund', header: 'Quỹ', render: e => <>{FUND_LABELS[e.fund]}{e.fund === 'bank' && accountName(e.bankAccountId) ? <span className="block text-sm text-on-surface-variant">{accountName(e.bankAccountId)}</span> : null}</> },
            { key: 'amount', header: 'Giá trị', className: 'text-right whitespace-nowrap', render: e => <span className={`font-bold ${e.kind === 'receipt' ? 'text-secondary' : 'text-error'}`}>{e.kind === 'receipt' ? '+' : '-'}{money(e.amount)}</span> },
            { key: 'action', header: '', className: 'text-right', render: e => (
              <>
                {e.source === 'voucher' && e.status === 'paid' && (
                  <button onClick={() => cancelVoucher(e.id)} className="text-sm font-bold text-error hover:underline cursor-pointer">Hủy phiếu</button>
                )}
                {e.source === 'sale' && <span className="text-sm text-on-surface-variant">Bán hàng</span>}
              </>
            ) },
          ]}
        />
      </PageCard>

      {form && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setForm(null)}>
          <form onSubmit={saveVoucher} onClick={e => e.stopPropagation()} className="bg-surface w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-3 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{form.type === 'receipt' ? 'Lập phiếu thu' : 'Lập phiếu chi'}</h3>
              <button type="button" onClick={() => setForm(null)} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
            </div>
            {formError && <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">{formError}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Quỹ</label>
                <select value={form.fund} onChange={e => setForm({ ...form, fund: e.target.value as FundType })} className="m3-input">
                  <option value="cash">Tiền mặt</option><option value="bank">Ngân hàng</option><option value="wallet">Ví điện tử</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Thời gian</label>
                <input type="datetime-local" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="m3-input" required />
              </div>
            </div>
            {form.fund === 'bank' && (
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Tài khoản ngân hàng</label>
                {bankAccounts.length === 0 ? (
                  <button type="button" onClick={() => setBankOpen(true)} className="m3-btn-tonal w-full !min-h-11">+ Thêm tài khoản ngân hàng</button>
                ) : (
                  <select value={form.bankAccountId} onChange={e => setForm({ ...form, bankAccountId: e.target.value })} className="m3-input">
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.accountName} ({a.bankCode} · {a.accountNumber})</option>)}
                  </select>
                )}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Giá trị (đ)</label>
              <input type="text" inputMode="numeric" value={form.amount ? money(form.amount) : ''} placeholder="0" autoFocus
                onChange={e => setForm({ ...form, amount: parseInt(e.target.value.replace(/\D/g, '').slice(0, 12)) || 0 })} className="m3-input text-right text-lg font-bold" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Loại {form.type === 'receipt' ? 'thu' : 'chi'}</label>
              <input list="cash-categories" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Chọn hoặc nhập loại mới" className="m3-input" />
              <datalist id="cash-categories">{(form.type === 'receipt' ? RECEIPT_CATEGORIES : PAYMENT_CATEGORIES).map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Người {form.type === 'receipt' ? 'nộp' : 'nhận'}</label>
                <input value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} className="m3-input" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Điện thoại</label>
                <input value={form.phone} inputMode="tel" onChange={e => setForm({ ...form, phone: e.target.value })} className="m3-input font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Ghi chú</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="m3-input" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setForm(null)} className="m3-btn-tonal !min-h-12">Bỏ qua</button>
              <button type="submit" className="m3-btn-filled !min-h-12">Lưu phiếu</button>
            </div>
          </form>
        </div>
      )}

      {bankOpen && (
        <BankAccountsDialog accounts={bankAccounts} setAccounts={setBankAccounts} triggerBeep={triggerBeep} onClose={() => setBankOpen(false)} />
      )}
    </div>
  );
}
