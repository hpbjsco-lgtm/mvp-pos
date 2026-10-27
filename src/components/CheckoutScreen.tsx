/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowLeft, Award, Banknote, QrCode, CreditCard } from 'lucide-react';
import { BankAccount, Customer } from '../types';
import { buildVietQRPayload } from '../utils/vietqr';
import { findBank } from '../utils/banks';
import QrCodeImage from './QrCodeImage';

interface CheckoutScreenProps {
  storeType: 'fnb' | 'retail';
  contextLabel: string;
  itemCount: number;
  cartSubtotal: number;
  discountInput: number;
  setDiscountInput: (n: number) => void;
  vatPercent: number;
  setVatPercent: (n: number) => void;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  customers: Customer[];
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  showAddCustomer: boolean;
  setShowAddCustomer: (b: boolean) => void;
  newCustName: string;
  setNewCustName: (v: string) => void;
  newCustPhone: string;
  setNewCustPhone: (v: string) => void;
  handleAddNewCustomer: (e: React.FormEvent) => void;
  pointsToEarn: number;
  paymentMethod: 'cash' | 'qr' | 'card';
  setPaymentMethod: (m: 'cash' | 'qr' | 'card') => void;
  cashPadInput: string;
  cashChangeDue: number;
  handleCashPadPress: (v: string) => void;
  setCashPadInput: (v: string) => void;
  setCashChangeDue: (v: number) => void;
  processing: boolean;
  onBack: () => void;
  onComplete: (method: 'cash' | 'qr' | 'card') => void;
  playBeep: (success: boolean) => void;
  /** Tài khoản ngân hàng nhận tiền (dùng tài khoản mặc định để hiện QR chuyển khoản). */
  bankAccounts?: BankAccount[];
  qrMemo?: string;
}

const paymentMethods: { id: 'cash' | 'qr' | 'card'; label: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: 'Tiền mặt', icon: Banknote },
  { id: 'qr', label: 'Quét mã QR', icon: QrCode },
  { id: 'card', label: 'Thẻ ngân hàng', icon: CreditCard }
];

/** Màn hình Thanh toán độc lập — tách khỏi màn hình chọn món, theo đúng luồng thao tác trong bộ thiết kế F&B. */
export default function CheckoutScreen({
  storeType,
  contextLabel,
  itemCount,
  cartSubtotal,
  discountInput,
  setDiscountInput,
  vatPercent,
  setVatPercent,
  discountAmount,
  taxAmount,
  grandTotal,
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  showAddCustomer,
  setShowAddCustomer,
  newCustName,
  setNewCustName,
  newCustPhone,
  setNewCustPhone,
  handleAddNewCustomer,
  pointsToEarn,
  paymentMethod,
  setPaymentMethod,
  cashPadInput,
  cashChangeDue,
  handleCashPadPress,
  setCashPadInput,
  setCashChangeDue,
  processing,
  onBack,
  onComplete,
  playBeep,
  bankAccounts = [],
  qrMemo = ''
}: CheckoutScreenProps) {
  const bank = bankAccounts.find(a => a.isDefault) || bankAccounts[0];
  const bankBin = bank ? findBank(bank.bankCode)?.bin : undefined;
  const qrPayload = bank && bankBin ? buildVietQRPayload({ bin: bankBin, accountNumber: bank.accountNumber, amount: grandTotal, memo: qrMemo }) : '';

  const [showDiscountVat, setShowDiscountVat] = React.useState(discountInput > 0 || vatPercent > 0);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const handlePickPaymentMethod = (id: 'cash' | 'qr' | 'card') => {
    setPaymentMethod(id);
    if (id !== 'cash') {
      setCashPadInput(grandTotal.toString());
      setCashChangeDue(0);
    } else {
      setCashPadInput('');
      setCashChangeDue(0);
    }
    playBeep(true);
  };

  return (
    <div className="max-w-2xl mx-auto pb-36 lg:pb-8">
      {/* Header màn Checkout */}
      <div className="flex items-center gap-2 pb-4">
        <button onClick={onBack} className="m3-icon-btn" aria-label="Quay lại chọn món">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-on-surface truncate">Thanh toán</h2>
          <p className="text-sm text-on-surface-variant truncate">{contextLabel}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Tổng thanh toán */}
        <div className="m3-card p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-on-surface-variant">Tổng thanh toán</span>
            <span className="m3-badge m3-badge-neutral">
               {itemCount} món
            </span>
          </div>
          <span className="text-4xl font-black text-on-surface block">{grandTotal.toLocaleString('vi-VN')} đ</span>

          <button
            type="button"
            onClick={() => setShowDiscountVat(v => !v)}
            className="text-sm font-bold text-primary flex items-center gap-1 pt-1"
          >
             {showDiscountVat ? 'Ẩn giảm giá / thuế' : 'Áp dụng giảm giá / thuế'}
          </button>

          {showDiscountVat && (
            <div className="pt-2 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Giảm giá (đ)</label>
                  <input
                    type="number"
                    min="0"
                    value={discountInput || ''}
                    onChange={(e) => setDiscountInput(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="m3-input !min-h-10 !px-2.5 text-base"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Thuế VAT (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={vatPercent || ''}
                    onChange={(e) => setVatPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    placeholder="0"
                    className="m3-input !min-h-10 !px-2.5 text-base"
                  />
                </div>
              </div>
              <div className="space-y-1 text-sm text-on-surface-variant">
                <div className="flex justify-between"><span>Tạm tính</span><span className="font-bold text-on-surface">{cartSubtotal.toLocaleString('vi-VN')} đ</span></div>
                {discountAmount > 0 && (
                  <div className="flex justify-between"><span>Giảm giá</span><span className="text-error font-semibold">-{discountAmount.toLocaleString('vi-VN')} đ</span></div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between"><span>Thuế VAT</span><span className="font-semibold">+{taxAmount.toLocaleString('vi-VN')} đ</span></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Khách hàng tích điểm */}
        <div className="m3-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-on-surface flex items-center gap-1.5">
               Khách hàng tích điểm
            </span>
            <button
              type="button"
              onClick={() => { setShowAddCustomer(!showAddCustomer); playBeep(true); }}
              className="m3-btn-text !min-h-8 !px-2 text-sm"
            >
               {showAddCustomer ? 'Hủy' : 'Thêm mới'}
            </button>
          </div>

          {showAddCustomer ? (
            <form onSubmit={handleAddNewCustomer} className="p-3 bg-surface-container rounded-2xl space-y-2">
              <input
                type="text"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Tên khách hàng"
                className="m3-input !min-h-9 text-base"
                required
              />
              <input
                type="text"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="Số điện thoại"
                className="m3-input !min-h-9 text-base"
                required
              />
              <button type="submit" className="m3-btn-tonal w-full !min-h-9 text-sm">
                Lưu khách hàng
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => { setSelectedCustomerId(e.target.value); playBeep(true); }}
                className="m3-input"
              >
                <option value="">Khách vãng lai (không tích điểm)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone}) — {c.points} điểm</option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="p-3 bg-secondary-container rounded-xl flex justify-between items-center text-sm text-on-secondary-container">
                  <div className="flex items-center gap-1 font-semibold">
                    <Award className="w-3.5 h-3.5" />
                    <span>Điểm hiện có: {selectedCustomer.points}</span>
                  </div>
                  <span className="font-bold">+{pointsToEarn} điểm</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Phương thức thanh toán */}
        <div className="m3-card p-5 space-y-3">
          <span className="text-sm font-bold text-on-surface block">Phương thức thanh toán</span>
          <div className="grid grid-cols-3 gap-2.5">
            {paymentMethods.map(p => {
              const active = paymentMethod === p.id;
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePickPaymentMethod(p.id)}
                  className={`min-h-20 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    active ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-bold leading-tight px-1">{p.label}</span>
                </button>
              );
            })}
          </div>

          {paymentMethod === 'cash' && (
            <div className="pt-2 space-y-3 border-t border-outline-variant">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-on-surface-variant">Khách đưa</label>
                  <button
                    onClick={() => { setCashPadInput(''); setCashChangeDue(0); playBeep(true); }}
                    className="text-sm font-bold text-primary"
                  >
                    Xóa nhập lại
                  </button>
                </div>
                {/* Gõ trực tiếp bằng bàn phím máy tính / bàn phím điện thoại, hoặc bấm bàn phím số bên dưới */}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={cashPadInput ? (parseInt(cashPadInput) || 0).toLocaleString('vi-VN') : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11).replace(/^0+(?=\d)/, '');
                      setCashPadInput(digits);
                      setCashChangeDue(Math.max(0, (parseInt(digits) || 0) - grandTotal));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setCashPadInput(''); setCashChangeDue(0); } }}
                    aria-label="Số tiền khách đưa"
                    className="m3-input text-right font-bold text-primary !min-h-12 text-lg pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-primary pointer-events-none">đ</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => { setCashPadInput(grandTotal.toString()); setCashChangeDue(0); playBeep(true); }}
                  className="min-h-9 px-1 bg-surface-container border border-outline-variant text-on-surface-variant text-sm font-bold rounded-lg cursor-pointer"
                >
                  Vừa đủ
                </button>
                {[50000, 100000, 200000, 500000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setCashPadInput(amt.toString());
                      setCashChangeDue(Math.max(0, amt - grandTotal));
                      playBeep(true);
                    }}
                    className="min-h-9 px-1 bg-surface-container border border-outline-variant text-on-surface-variant text-sm font-bold rounded-lg cursor-pointer"
                  >
                    {(amt / 1000).toLocaleString('vi-VN')}k
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '000', 'C'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleCashPadPress(val)}
                    className={`min-h-11 text-base font-bold rounded-xl border cursor-pointer transition-colors ${
                      val === 'C'
                        ? 'bg-error-container text-on-error-container border-transparent'
                        : 'bg-surface-container-lowest border-outline-variant text-on-surface'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>

              <div className="bg-tertiary-container rounded-2xl p-4 text-center space-y-0.5">
                <span className="text-sm font-semibold text-on-tertiary-container block">Tiền thừa trả khách</span>
                <span className="text-2xl font-bold text-on-tertiary-container block">{cashChangeDue.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>
          )}

          {paymentMethod === 'qr' && (
            <div className="pt-2 border-t border-outline-variant text-center space-y-2">
              {qrPayload ? (
                <>
                  <QrCodeImage value={qrPayload} size={200} className="mx-auto rounded-xl bg-white p-1" />
                  <p className="text-sm font-bold text-on-surface">{bank!.bankCode} · {bank!.accountNumber}</p>
                  <p className="text-sm text-on-surface-variant">{bank!.holder}</p>
                </>
              ) : (
                <div className="w-40 h-40 mx-auto rounded-2xl bg-surface-container flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-on-surface-variant" />
                </div>
              )}
              <p className="text-sm text-on-surface-variant">
                {qrPayload ? 'Khách quét mã để chuyển khoản' : 'Chưa có tài khoản ngân hàng — thêm ở Sổ quỹ & Dòng tiền để hiện mã QR.'} {grandTotal.toLocaleString('vi-VN')} đ
              </p>
            </div>
          )}

          {paymentMethod === 'card' && (
            <div className="pt-2 border-t border-outline-variant text-center space-y-2">
              <div className="w-full min-h-16 rounded-2xl bg-surface-container flex items-center justify-center gap-2 text-on-surface-variant">
                 Chờ quẹt / chạm thẻ trên máy POS
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nút hoàn tất — cố định dưới cùng */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] lg:static z-30 p-3 lg:p-0 lg:mt-4 bg-surface lg:bg-transparent border-t border-outline-variant lg:border-0">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => onComplete(paymentMethod)}
            disabled={processing}
            className="m3-btn-filled w-full !min-h-14 !bg-secondary !text-on-secondary text-lg"
          >
            {processing ? (
              <>
                 Đang ghi nhận giao dịch...
              </>
            ) : (
              <>
                 Hoàn tất thanh toán
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
