/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Delete, X } from 'lucide-react';
import { BankAccount, Customer, PaymentPart } from '../types';
import { buildVietQRPayload } from '../utils/vietqr';
import { findBank } from '../utils/banks';
import QrCodeImage from './QrCodeImage';
import { applyMixedPayment, PAYMENT_LABELS } from '../utils/payments';

export interface CheckoutLine {
  name: string;
  category: string;
  quantity: number;
  price: number;
  /** Tùy chọn / ghi chú hiển thị dưới tên món. */
  detail: string;
}

interface KiotCheckoutDialogProps {
  title: string;
  dateText: string;
  lines: CheckoutLine[];
  itemCount: number;
  subtotal: number;
  discountInput: number;
  setDiscountInput: (n: number) => void;
  vatPercent: number;
  setVatPercent: (n: number) => void;
  taxAmount: number;
  grandTotal: number;
  customers: Customer[];
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  pointsToEarn: number;
  paymentMethod: 'cash' | 'qr' | 'card';
  setPaymentMethod: (m: 'cash' | 'qr' | 'card') => void;
  cashPadInput: string;
  setCashPadInput: (v: string) => void;
  setCashChangeDue: (v: number) => void;
  processing: boolean;
  onClose: () => void;
  /** method 'mixed' kèm danh sách khoản thanh toán + tiền khách đưa tổng cộng khi thanh toán kết hợp. */
  onPay: (method: 'cash' | 'qr' | 'card' | 'mixed', mixed?: { parts: PaymentPart[]; received: number; change: number }, bankAccountId?: string) => void;
  bankAccounts: BankAccount[];
  /** Mở hộp thoại quản lý / thêm tài khoản ngân hàng. */
  onManageBankAccounts: () => void;
  /** Nội dung chuyển khoản (vd tên bàn / số đơn). */
  qrMemo: string;
  onPrintProvisional: () => void;
  playBeep: (success: boolean) => void;
}

const money = (n: number) => n.toLocaleString('vi-VN');
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

/** Gợi ý mệnh giá khách đưa: đúng số tiền, rồi các mức làm tròn tăng dần. */
function suggestAmounts(total: number): number[] {
  if (total <= 0) return [];
  const set = new Set<number>([total]);
  [10000, 50000, 100000, 200000, 500000, 1000000].forEach(step => {
    const v = ceilTo(total, step);
    set.add(v === total ? total + step : v);
  });
  return [...set].sort((a, b) => a - b).slice(0, 5);
}

/**
 * Hộp thoại Thanh toán trên PC (bố cục KiotViet): trái là chi tiết đơn theo nhóm món, phải là chi tiết giao dịch
 * (giảm giá, khách thanh toán, phương thức, gợi ý mệnh giá, bàn phím ảo, tiền thừa).
 */
export default function KiotCheckoutDialog(props: KiotCheckoutDialogProps) {
  const {
    title, dateText, lines, itemCount, subtotal, discountInput, setDiscountInput, vatPercent, setVatPercent, taxAmount, grandTotal,
    customers, selectedCustomerId, setSelectedCustomerId, pointsToEarn, paymentMethod, setPaymentMethod,
    cashPadInput, setCashPadInput, setCashChangeDue, processing, onClose, onPay, onPrintProvisional, playBeep,
    bankAccounts, onManageBankAccounts, qrMemo
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  // Thanh toán kết hợp
  const [mixedOpen, setMixedOpen] = useState(false);
  const [mixed, setMixed] = useState<{ cash: number; qr: number; card: number } | null>(null);
  const mixedResult = mixed ? applyMixedPayment(grandTotal, mixed) : null;

  // Tài khoản nhận chuyển khoản + mã QR
  const defaultBankId = bankAccounts.find(a => a.isDefault)?.id || bankAccounts[0]?.id || '';
  const [bankId, setBankId] = useState(defaultBankId);
  const [qrBig, setQrBig] = useState(false);
  const bank = bankAccounts.find(a => a.id === bankId) || bankAccounts.find(a => a.id === defaultBankId);
  const bankBin = bank ? findBank(bank.bankCode)?.bin : undefined;

  const usingMixed = !!mixed && !!mixedResult?.valid;
  const paid = usingMixed ? mixedResult!.received : paymentMethod === 'cash' ? (parseInt(cashPadInput) || 0) : grandTotal;
  const change = usingMixed ? mixedResult!.change : Math.max(0, paid - grandTotal);
  const canPay = !processing && grandTotal > 0 && (usingMixed || paid >= grandTotal);

  // Mặc định khách trả đúng số tiền; đổi giảm giá / VAT / phương thức thì đặt lại
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setCashPadInput(String(grandTotal));
      setCashChangeDue(0);
      setTouched(false);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    } else {
      setCashPadInput(String(grandTotal));
      setCashChangeDue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, paymentMethod]);

  // Đổi giảm giá / VAT làm thay đổi số cần trả thì bỏ cấu hình kết hợp cũ
  useEffect(() => { setMixed(null); }, [grandTotal]);

  const setPaid = (digits: string) => {
    const clean = digits.replace(/\D/g, '').slice(0, 11).replace(/^0+(?=\d)/, '');
    setCashPadInput(clean);
    setCashChangeDue(Math.max(0, (parseInt(clean) || 0) - grandTotal));
    setTouched(true);
  };

  const press = (key: string) => {
    playBeep(true);
    if (paymentMethod !== 'cash') return;
    // Lần bấm đầu tiên thay thế số tiền mặc định thay vì nối thêm vào
    const base = touched ? cashPadInput : '';
    if (key === 'C') setPaid('');
    else if (key === 'DEL') setPaid(base.slice(0, -1));
    else setPaid(base + key);
  };

  const pay = () => {
    if (!canPay) return;
    if (usingMixed) onPay('mixed', { parts: mixedResult!.parts, received: mixedResult!.received, change: mixedResult!.change }, bank?.id);
    else onPay(paymentMethod, undefined, bank?.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F8') { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if (e.key === 'Escape' && !mixedOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mixedOpen]);

  // Nhóm món theo danh mục (giữ thứ tự xuất hiện)
  const groups: { category: string; items: { line: CheckoutLine; index: number }[] }[] = [];
  lines.forEach((line, index) => {
    let g = groups.find(x => x.category === line.category);
    if (!g) { g = { category: line.category, items: [] }; groups.push(g); }
    g.items.push({ line, index });
  });

  const methods: { id: 'cash' | 'qr' | 'card'; label: string }[] = [
    { id: 'cash', label: 'Tiền mặt' }, { id: 'qr', label: 'Chuyển khoản' }, { id: 'card', label: 'Thẻ' },
  ];
  const suggestions = paymentMethod === 'cash' ? suggestAmounts(grandTotal) : [];
  const qrAmount = usingMixed ? (mixedResult!.parts.find(p => p.method === 'qr')?.amount || 0) : paymentMethod === 'qr' ? grandTotal : 0;
  const qrPayload = bank && bankBin && qrAmount > 0 ? buildVietQRPayload({ bin: bankBin, accountNumber: bank.accountNumber, amount: qrAmount, memo: qrMemo }) : '';

  // Khối hiển thị QR / chọn tài khoản nhận tiền (dùng cho Chuyển khoản và phần chuyển khoản của thanh toán kết hợp)
  const qrBlock = qrAmount > 0 ? (
    <div className="rounded-xl bg-surface-container p-3 space-y-2">
      {bankAccounts.length === 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">Chưa có tài khoản ngân hàng để hiện mã QR.</p>
          <button onClick={onManageBankAccounts} className="m3-btn-tonal !min-h-10 text-sm shrink-0">+ Thêm tài khoản</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <select value={bank?.id || ''} onChange={e => setBankId(e.target.value)} className="m3-input !min-h-10 text-sm flex-1" aria-label="Tài khoản nhận tiền">
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankCode} - {a.accountNumber} - {a.holder}</option>)}
            </select>
            <button onClick={onManageBankAccounts} className="m3-btn-outlined !min-h-10 !px-3 text-sm shrink-0">Quản lý</button>
          </div>
          {qrPayload ? (
            <div className="flex items-center gap-3">
              <QrCodeImage value={qrPayload} size={132} className="rounded-lg bg-white p-1 shrink-0" />
              <div className="text-sm space-y-0.5 min-w-0">
                <p className="font-bold text-on-surface">{bank!.bankCode} · {bank!.accountNumber}</p>
                <p className="text-on-surface-variant truncate">{bank!.holder}</p>
                <p className="text-on-surface-variant">Số tiền: <strong className="text-primary">{money(qrAmount)} đ</strong></p>
                <button onClick={() => setQrBig(true)} className="mt-1 min-h-9 px-3 rounded-full bg-primary text-on-primary text-sm font-bold cursor-pointer">Hiện mã QR</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-error font-semibold">Không tạo được mã QR cho ngân hàng này.</p>
          )}
        </>
      )}
    </div>
  ) : null;
  const customer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-2 sm:p-3" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden w-full max-w-[1560px] h-[calc(100dvh-1.5rem)] grid grid-cols-[1fr_1fr]"
        onClick={e => e.stopPropagation()}
      >
        {/* ===== Trái: chi tiết đơn ===== */}
        <div className="min-h-0 flex flex-col border-r border-outline-variant">
          <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
            <h3 className="text-xl font-black text-on-surface">{title}</h3>
            <span className="text-sm text-on-surface-variant font-mono whitespace-nowrap pt-1">{dateText}</span>
          </div>

          <div className="px-5 pb-3 flex items-center gap-3 shrink-0">
            <select
              value={selectedCustomerId}
              onChange={e => { setSelectedCustomerId(e.target.value); playBeep(true); }}
              className="min-h-10 rounded-full bg-surface-container px-4 text-base font-bold max-w-[16rem]"
              aria-label="Khách hàng"
            >
              <option value="">Khách lẻ</option>
              {customers.filter(c => c.id !== 'khach-vang-lai' && c.id !== 'walk-in').map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
              ))}
            </select>
            {customer && <span className="text-sm text-on-surface-variant">Điểm hiện có {customer.points} · +{pointsToEarn} điểm đơn này</span>}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5">
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_6.5rem_7rem] gap-2 bg-primary-container/60 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-on-primary-container sticky top-0">
              <span>Món</span><span className="text-center">SL</span><span className="text-right">Đơn giá</span><span className="text-right">Thành tiền</span>
            </div>
            {groups.map(g => (
              <div key={g.category}>
                {groups.length > 1 && (
                  <div className="mt-1 px-3 py-1.5 bg-surface-container rounded-lg text-xs font-bold uppercase tracking-wide text-on-surface-variant">{g.category}</div>
                )}
                {g.items.map(({ line, index }) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_3rem_6.5rem_7rem] gap-2 px-3 py-2.5 border-b border-outline-variant/50 items-start">
                    <div className="min-w-0">
                      <p className="text-base text-on-surface">{index + 1}. {line.name}</p>
                      {line.detail && <p className="text-sm text-on-surface-variant">{line.detail}</p>}
                    </div>
                    <span className="text-center text-base text-on-surface-variant">{line.quantity}</span>
                    <span className="text-right text-base text-on-surface-variant">{money(line.price)}</span>
                    <span className="text-right text-base font-bold text-on-surface">{money(line.price * line.quantity)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="shrink-0 px-5 py-3 border-t border-outline-variant flex items-center justify-between">
            <span className="flex items-center gap-2 text-base font-bold text-on-surface">
              Tổng tiền hàng <span className="min-w-6 h-6 px-1.5 rounded-full bg-primary text-on-primary text-sm flex items-center justify-center">{itemCount}</span>
            </span>
            <span className="text-lg font-bold text-on-surface">{money(subtotal)}</span>
          </div>
        </div>

        {/* ===== Phải: chi tiết giao dịch ===== */}
        <div className="min-h-0 flex flex-col">
          <div className="px-5 pt-3 pb-1 flex items-center justify-between shrink-0">
            <h4 className="text-base font-bold text-on-surface">Chi tiết giao dịch</h4>
            <button onClick={onClose} className="m3-icon-btn !w-9 !h-9" aria-label="Đóng"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3 space-y-2">
            <div className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2 font-bold">Tổng tiền hàng <span className="min-w-6 h-6 px-1.5 rounded-full bg-primary-container text-on-primary-container text-sm flex items-center justify-center">{itemCount}</span></span>
              <span className="font-bold">{money(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-base">
              <span className="text-on-surface-variant">Giảm giá</span>
              <input
                type="number"
                min={0}
                value={discountInput || ''}
                placeholder="0"
                onChange={e => setDiscountInput(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-40 text-right bg-transparent border-b border-outline-variant focus:border-primary outline-none font-bold py-1"
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-base">
              <span className="text-on-surface-variant">Thuế VAT</span>
              <select value={vatPercent} onChange={e => setVatPercent(parseInt(e.target.value) || 0)} className="w-40 text-right bg-transparent border-b border-outline-variant py-1 font-bold">
                {[0, 5, 8, 10].map(v => <option key={v} value={v}>{v === 0 ? 'Không' : `${v}%`}{v > 0 ? ` (${money(taxAmount)})` : ''}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between text-base">
              <span className="font-bold">Khách cần trả</span>
              <span className="text-xl font-black text-primary">{money(grandTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-base">
              <span className="font-bold">Khách thanh toán (F8)</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                readOnly={usingMixed || paymentMethod !== 'cash'}
                value={money(paid)}
                onChange={e => setPaid(e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === 'Enter') pay(); }}
                className="w-48 text-right bg-transparent border-b-2 border-primary outline-none text-xl font-black text-primary py-1"
                aria-label="Khách thanh toán"
              />
            </div>

            <div className="rounded-xl border border-outline-variant p-3 space-y-2.5">
              <div className="flex items-center gap-5">
                {methods.map(m => (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer text-base select-none">
                    <input
                      type="radio"
                      name="pay-method"
                      checked={paymentMethod === m.id}
                      onChange={() => { setMixed(null); setPaymentMethod(m.id); playBeep(true); }}
                      className="w-4.5 h-4.5 accent-primary"
                    />
                    {m.label}
                  </label>
                ))}
                <button
                  onClick={() => { setMixedOpen(true); playBeep(true); }}
                  className={`ml-auto min-h-9 px-3 rounded-full text-sm font-bold cursor-pointer border ${usingMixed ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-primary hover:bg-primary-container/40'}`}
                  title="Thanh toán kết hợp nhiều phương thức"
                >
                  Kết hợp
                </button>
              </div>

              {usingMixed && (
                <div className="rounded-xl bg-primary-container/50 p-3 space-y-1 text-sm">
                  <p className="font-bold text-on-primary-container">Thanh toán kết hợp</p>
                  {mixedResult!.parts.map((p, i) => (
                    <p key={i} className="flex justify-between"><span>{PAYMENT_LABELS[p.method]}</span><strong>{money(p.amount)}</strong></p>
                  ))}
                  <button onClick={() => setMixedOpen(true)} className="text-primary font-bold underline underline-offset-2 cursor-pointer">Sửa</button>
                </div>
              )}

              {!usingMixed && paymentMethod === 'cash' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map(a => (
                      <button
                        key={a}
                        onClick={() => { setPaid(String(a)); playBeep(true); }}
                        className={`min-h-10 px-3.5 rounded-full border text-base font-semibold cursor-pointer transition-colors ${
                          paid === a ? 'bg-primary-container border-primary text-on-primary-container' : 'border-outline-variant hover:bg-surface-container'
                        }`}
                      >
                        {money(a)}
                      </button>
                    ))}
                  </div>

                  {/* Bàn phím ảo: gõ trực tiếp số tiền khách đưa */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {['7', '8', '9', 'DEL', '4', '5', '6', 'C', '1', '2', '3', '000'].map(k => (
                      <button
                        key={k}
                        onClick={() => press(k)}
                        className={`h-[clamp(2.5rem,5.6vh,3.5rem)] rounded-xl text-lg font-bold cursor-pointer border transition-colors active:scale-95 ${
                          k === 'C' ? 'bg-error-container text-on-error-container border-transparent'
                            : k === 'DEL' ? 'bg-surface-container border-outline-variant text-on-surface-variant'
                              : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container'
                        }`}
                        aria-label={k === 'DEL' ? 'Xóa số cuối' : k === 'C' ? 'Xóa hết' : k}
                      >
                        {k === 'DEL' ? <Delete className="w-5 h-5 mx-auto" /> : k}
                      </button>
                    ))}
                    <button onClick={() => press('0')} className="col-span-2 h-[clamp(2.5rem,5.6vh,3.5rem)] rounded-xl text-lg font-bold cursor-pointer border bg-surface-container-lowest border-outline-variant hover:bg-surface-container active:scale-95">0</button>
                    <button onClick={() => { setPaid(String(grandTotal)); playBeep(true); }} className="col-span-2 h-[clamp(2.5rem,5.6vh,3.5rem)] rounded-xl text-base font-bold cursor-pointer border border-primary text-primary hover:bg-primary-container/50 active:scale-95">Vừa đủ</button>
                  </div>
                </>
              )}

              {qrBlock}
              {qrAmount > 0 && <p className="text-sm text-on-surface-variant">Khách quét mã chuyển khoản, thu ngân xác nhận khi đã nhận tiền rồi bấm Thanh toán.</p>}
              {!usingMixed && paymentMethod === 'card' && (
                <p className="text-sm text-on-surface-variant">Quẹt thẻ trên máy POS ngân hàng số tiền <strong>{money(grandTotal)} đ</strong>, rồi xác nhận.</p>
              )}
            </div>

            <div className="flex items-center justify-between text-base">
              <span className="text-on-surface-variant">Tiền thừa trả khách</span>
              <span className="font-bold text-lg">{money(change)}</span>
            </div>
          </div>

          <div className="shrink-0 px-5 py-3 border-t border-outline-variant grid grid-cols-[1fr_1.6fr] gap-3">
            <button onClick={onPrintProvisional} className="h-[clamp(3rem,6.4vh,3.5rem)] rounded-xl border-2 border-primary text-primary text-lg font-bold cursor-pointer hover:bg-primary-container/40">
              In tạm tính
            </button>
            <button onClick={pay} disabled={!canPay} className="h-[clamp(3rem,6.4vh,3.5rem)] rounded-xl bg-primary text-on-primary text-lg font-bold cursor-pointer disabled:opacity-40 hover:brightness-110">
              {processing ? 'Đang xử lý...' : 'Thanh toán'}
            </button>
          </div>
        </div>
      </div>

      {qrBig && qrPayload && bank && (
        <div className="fixed inset-0 z-[75] bg-black/60 flex items-center justify-center p-4" onClick={() => setQrBig(false)}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 text-center space-y-3 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold text-on-surface">Quét mã để chuyển khoản</p>
            <QrCodeImage value={qrPayload} size={320} className="mx-auto" />
            <p className="text-3xl font-black text-primary">{money(qrAmount)} đ</p>
            <p className="text-base font-semibold">{bank.bankName}</p>
            <p className="text-base font-mono">{bank.accountNumber}</p>
            <p className="text-sm text-on-surface-variant">{bank.holder}{qrMemo ? ` · ND: ${qrMemo}` : ''}</p>
            <button onClick={() => setQrBig(false)} className="m3-btn-filled !min-h-12 w-full">Đóng</button>
          </div>
        </div>
      )}

      {mixedOpen && (
        <MixedPaymentDialog
          total={grandTotal}
          initial={mixed}
          onCancel={() => setMixedOpen(false)}
          onConfirm={(v) => { setMixed(v); setMixedOpen(false); playBeep(true); }}
        />
      )}
    </div>
  );
}

/** Hộp thoại "Kết hợp phương thức": mỗi phương thức một ô tiền; tổng phải đủ số khách cần trả. */
function MixedPaymentDialog({ total, initial, onCancel, onConfirm }: {
  total: number;
  initial: { cash: number; qr: number; card: number } | null;
  onCancel: () => void;
  onConfirm: (v: { cash: number; qr: number; card: number }) => void;
}) {
  const [on, setOn] = useState({ cash: initial ? initial.cash > 0 : true, qr: initial ? initial.qr > 0 : true, card: initial ? initial.card > 0 : false });
  const [amt, setAmt] = useState({ cash: initial?.cash ?? 0, qr: initial?.qr ?? 0, card: initial?.card ?? 0 });

  const value = { cash: on.cash ? amt.cash : 0, qr: on.qr ? amt.qr : 0, card: on.card ? amt.card : 0 };
  const result = applyMixedPayment(total, value);
  const remaining = Math.max(0, total - (value.cash + value.qr + value.card));

  const rows: { key: 'cash' | 'qr' | 'card'; label: string }[] = [
    { key: 'cash', label: 'Tiền mặt' }, { key: 'qr', label: 'Chuyển khoản' }, { key: 'card', label: 'Thẻ' },
  ];

  const toggle = (k: 'cash' | 'qr' | 'card') => {
    const nowOn = !on[k];
    setOn({ ...on, [k]: nowOn });
    // Bật thêm phương thức thì điền sẵn phần còn thiếu
    if (nowOn && amt[k] === 0) setAmt({ ...amt, [k]: remaining });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-on-surface">Kết hợp phương thức</h3>
          <button onClick={onCancel} className="m3-icon-btn !w-9 !h-9" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-1 text-base">
          <p className="flex justify-between"><span className="font-bold">Tổng thanh toán</span><strong>{money(total)}</strong></p>
          <p className="flex justify-between"><span className="font-bold">Khách thanh toán</span><strong>{money(value.cash + value.qr + value.card)}</strong></p>
        </div>

        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.key} className="rounded-xl border border-outline-variant p-3 space-y-2">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="text-base font-bold text-on-surface">{r.label}</span>
                <input type="checkbox" checked={on[r.key]} onChange={() => toggle(r.key)} className="w-5 h-5 accent-primary" />
              </label>
              {on[r.key] && (
                <div className="space-y-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amt[r.key] ? money(amt[r.key]) : ''}
                    placeholder="0"
                    onFocus={e => e.target.select()}
                    onChange={e => setAmt({ ...amt, [r.key]: parseInt(e.target.value.replace(/\D/g, '').slice(0, 11)) || 0 })}
                    className="m3-input text-right text-lg font-bold !min-h-11"
                    aria-label={`Số tiền ${r.label}`}
                  />
                  {remaining > 0 && amt[r.key] !== amt[r.key] + remaining && (
                    <button
                      onClick={() => setAmt({ ...amt, [r.key]: amt[r.key] + remaining })}
                      className="min-h-9 px-3 rounded-full border border-outline-variant text-sm font-semibold hover:bg-surface-container cursor-pointer"
                    >
                      Điền phần còn thiếu ({money(remaining)})
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!result.valid && value.cash + value.qr + value.card > 0 && (
          <p className="text-sm font-semibold text-error">{result.error}</p>
        )}
        {result.valid && result.change > 0 && (
          <p className="text-sm font-semibold text-on-surface-variant">Tiền thừa trả khách: <strong>{money(result.change)}</strong></p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="m3-btn-tonal !min-h-12">Quay lại</button>
          <button onClick={() => onConfirm(value)} disabled={!result.valid} className="m3-btn-filled !min-h-12 disabled:opacity-40">Xác nhận</button>
        </div>
      </div>
    </div>
  );
}
