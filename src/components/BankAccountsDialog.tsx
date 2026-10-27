/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { BankAccount } from '../types';
import { BANKS, findBank } from '../utils/banks';

interface BankAccountsDialogProps {
  accounts: BankAccount[];
  setAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  triggerBeep: (success: boolean) => void;
  onClose: () => void;
  /** Mở thẳng form thêm tài khoản. */
  startAdding?: boolean;
  /** Đóng hộp thoại ngay sau khi lưu (khi mở từ màn thanh toán để quay lại thanh toán). */
  closeAfterSave?: boolean;
}

type Form = { id?: string; accountName: string; accountNumber: string; bankCode: string; holder: string; note: string; isDefault: boolean };
const blank = (isFirst: boolean): Form => ({ accountName: '', accountNumber: '', bankCode: 'VCB', holder: '', note: '', isDefault: isFirst });

/** Quản lý tài khoản ngân hàng của cửa hàng (dùng để hiện mã QR chuyển khoản khi thanh toán / in tạm tính). */
export default function BankAccountsDialog({ accounts, setAccounts, triggerBeep, onClose, startAdding, closeAfterSave }: BankAccountsDialogProps) {
  const [form, setForm] = useState<Form | null>(startAdding || accounts.length === 0 ? blank(accounts.length === 0) : null);
  const [error, setError] = useState('');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const number = form.accountNumber.replace(/\s/g, '');
    if (!/^\d{4,20}$/.test(number)) { setError('Số tài khoản chỉ gồm chữ số (4-20 số).'); return; }
    const bank = findBank(form.bankCode);
    if (!bank) { setError('Vui lòng chọn ngân hàng.'); return; }

    const base = {
      accountName: form.accountName.trim() || form.holder.trim() || bank.code,
      accountNumber: number,
      bankCode: bank.code,
      bankName: bank.name,
      holder: form.holder.trim(),
      note: form.note.trim() || undefined,
    };
    const makeDefault = form.isDefault || accounts.length === 0;

    setAccounts(prev => {
      const cleared = makeDefault ? prev.map(a => ({ ...a, isDefault: false })) : prev;
      if (form.id) return cleared.map(a => (a.id === form.id ? { ...a, ...base, isDefault: makeDefault || a.isDefault } : a));
      return [...cleared, { id: `BA-${Date.now()}`, ...base, isDefault: makeDefault, createdAt: new Date().toISOString() }];
    });
    setForm(null);
    setError('');
    triggerBeep(true);
    if (closeAfterSave) onClose();
  };

  const remove = (a: BankAccount) => {
    if (!confirm(`Xóa tài khoản ${a.accountName} (${a.accountNumber})? Các khoản đã ghi sổ trước đó vẫn giữ nguyên.`)) return;
    setAccounts(prev => {
      const rest = prev.filter(x => x.id !== a.id);
      return a.isDefault && rest.length > 0 ? rest.map((x, i) => (i === 0 ? { ...x, isDefault: true } : x)) : rest;
    });
    triggerBeep(true);
  };

  const setDefault = (id: string) => {
    setAccounts(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
    triggerBeep(true);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant shrink-0">
          <h3 className="text-xl font-black text-on-surface">{form ? (form.id ? 'Sửa tài khoản' : 'Thêm tài khoản') : 'Tài khoản ngân hàng'}</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        {form ? (
          <form onSubmit={save} className="p-6 space-y-3 overflow-y-auto">
            <p className="text-base font-bold text-on-surface">Thông tin tài khoản</p>
            {error && <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">{error}</div>}
            {([
              ['Tên tài khoản', 'accountName', 'text', 'Ví dụ: Hộ kinh doanh Đỗ Hoàng Sơn'],
              ['Số tài khoản', 'accountNumber', 'text', '000111222333'],
            ] as const).map(([label, key, type, ph]) => (
              <div key={key} className="grid grid-cols-[8.5rem_1fr] items-center gap-3">
                <label className="text-sm font-semibold text-on-surface-variant">{label}</label>
                <input type={type} value={form[key]} placeholder={ph} inputMode={key === 'accountNumber' ? 'numeric' : undefined}
                  onChange={e => setForm({ ...form, [key]: e.target.value })} className="m3-input" required={key === 'accountNumber'} />
              </div>
            ))}
            <div className="grid grid-cols-[8.5rem_1fr] items-center gap-3">
              <label className="text-sm font-semibold text-on-surface-variant">Ngân hàng</label>
              <select value={form.bankCode} onChange={e => setForm({ ...form, bankCode: e.target.value })} className="m3-input">
                {BANKS.map(b => <option key={b.code} value={b.code}>{b.code} - {b.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] items-center gap-3">
              <label className="text-sm font-semibold text-on-surface-variant">Chủ tài khoản</label>
              <input value={form.holder} onChange={e => setForm({ ...form, holder: e.target.value })} className="m3-input" required />
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] items-center gap-3">
              <label className="text-sm font-semibold text-on-surface-variant">Ghi chú</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="m3-input" />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer pl-[9.5rem] text-base">
              <input type="checkbox" checked={form.isDefault || accounts.length === 0} onChange={e => setForm({ ...form, isDefault: e.target.checked })} className="w-5 h-5 accent-primary" />
              Tài khoản mặc định
            </label>
            <div className="flex justify-end gap-2 pt-3">
              <button type="submit" className="m3-btn-filled !min-h-12">Lưu</button>
              <button type="button" onClick={() => { setForm(accounts.length === 0 ? form : null); if (accounts.length === 0) onClose(); setError(''); }} className="m3-btn-tonal !min-h-12">Bỏ qua</button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-3 overflow-y-auto">
            {accounts.map(a => (
              <div key={a.id} className="rounded-xl border border-outline-variant p-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-on-surface flex items-center gap-2 flex-wrap">
                    {a.accountName}
                    {a.isDefault && <span className="m3-badge m3-badge-success">Mặc định</span>}
                  </p>
                  <p className="text-sm text-on-surface-variant"><strong>{a.bankCode}</strong> · {a.accountNumber}</p>
                  <p className="text-sm text-on-surface-variant truncate">Chủ TK: {a.holder}</p>
                  {a.note && <p className="text-sm text-on-surface-variant truncate">{a.note}</p>}
                  {!a.isDefault && <button onClick={() => setDefault(a.id)} className="mt-1 text-sm font-bold text-primary underline underline-offset-2 cursor-pointer">Đặt làm mặc định</button>}
                </div>
                <button onClick={() => setForm({ id: a.id, accountName: a.accountName, accountNumber: a.accountNumber, bankCode: a.bankCode, holder: a.holder, note: a.note || '', isDefault: a.isDefault })} className="m3-icon-btn" aria-label="Sửa tài khoản"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remove(a)} className="m3-icon-btn hover:text-error" aria-label="Xóa tài khoản"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => setForm(blank(accounts.length === 0))} className="m3-btn-tonal w-full !min-h-12"><Plus className="w-4 h-4" /> Thêm tài khoản</button>
          </div>
        )}
      </div>
    </div>
  );
}
