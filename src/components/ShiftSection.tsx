/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOrderPayments } from '../utils/payments';
import React, { useState } from 'react';
import { PlayCircle, Wallet } from 'lucide-react';
import { Shift, Order } from '../types';

interface ShiftSectionProps {
  simShifts: Shift[];
  setSimShifts: React.Dispatch<React.SetStateAction<Shift[]>>;
  simOrders: Order[];
  triggerBeep: (success: boolean) => void;
  currentUser: { uid: string; name: string };
}

export default function ShiftSection({
  simShifts,
  setSimShifts,
  simOrders,
  triggerBeep,
  currentUser
}: ShiftSectionProps) {
  const [openingCashInput, setOpeningCashInput] = useState<number>(0);
  const [closingCashInput, setClosingCashInput] = useState<number>(0);
  const [closeStep, setCloseStep] = useState(false);

  const openShift = simShifts.find(s => s.staffId === currentUser.uid && s.status === 'open');

  const shiftOrders = openShift
    ? simOrders.filter(o => (
      o.staffId === openShift.staffId
      && (o.status || 'completed') !== 'void'
      && new Date(o.createdAt).getTime() >= new Date(openShift.openedAt).getTime()
    ))
    : [];
  // Doanh thu theo phương thức: tính theo từng khoản thanh toán (đơn thanh toán kết hợp được tách ra)
  const revenueBy = (method: 'cash' | 'card' | 'qr') =>
    shiftOrders.reduce((sum, o) => sum + getOrderPayments(o).filter(p => p.method === method).reduce((s, p) => s + p.amount, 0), 0);
  const cashRevenue = revenueBy('cash');
  const cardRevenue = revenueBy('card');
  const qrRevenue = revenueBy('qr');
  const totalRevenue = cashRevenue + cardRevenue + qrRevenue;
  const expectedCash = (openShift?.openingCash || 0) + cashRevenue;

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const ts = new Date().toISOString();
    const shift: Shift = {
      id: `shift-${Date.now()}`,
      staffId: currentUser.uid,
      staffName: currentUser.name,
      openingCash: Math.max(0, openingCashInput || 0),
      status: 'open',
      openedAt: ts,
      createdAt: ts
    };
    setSimShifts(prev => [shift, ...prev]);
    setOpeningCashInput(0);
    triggerBeep(true);
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openShift) return;
    const diff = closingCashInput - expectedCash;
    if (!confirm(
      `Xác nhận đóng ca?\n\nTiền mặt kỳ vọng: ${expectedCash.toLocaleString('vi-VN')} đ\nTiền mặt đếm thực tế: ${closingCashInput.toLocaleString('vi-VN')} đ\nChênh lệch: ${diff >= 0 ? '+' : ''}${diff.toLocaleString('vi-VN')} đ`
    )) return;

    setSimShifts(prev => prev.map(s => (s.id === openShift.id ? {
      ...s,
      status: 'closed',
      closingCashExpected: expectedCash,
      closingCashActual: closingCashInput,
      closedAt: new Date().toISOString()
    } : s)));
    setCloseStep(false);
    setClosingCashInput(0);
    triggerBeep(true);
  };

  const pastShifts = simShifts.filter(s => s.status === 'closed').slice(0, 20);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-on-surface">Sổ quỹ ca làm việc</h2>
      </div>

      {!openShift ? (
        <form onSubmit={handleOpenShift} className="m3-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-on-surface">
            <PlayCircle className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold">Mở ca làm việc mới</h3>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-on-surface-variant">Tiền quỹ đầu ca (đ)</label>
            <input
              type="number"
              min="0"
              value={openingCashInput || ''}
              onChange={(e) => setOpeningCashInput(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="m3-input font-mono"
              required
            />
          </div>
          <button type="submit" className="m3-btn-filled w-full !min-h-12">
             Mở ca cho {currentUser.name}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Trạng thái ca hiện tại */}
          <div className="rounded-3xl bg-primary text-on-primary p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-semibold opacity-80 block">Trạng thái</span>
                <span className="text-base font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Đang mở ca
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold opacity-80 block">Thu ngân</span>
                <span className="text-base font-bold">{openShift.staffName}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-on-primary/20 flex items-center gap-1.5 text-sm font-semibold opacity-90">
               Bắt đầu: {new Date(openShift.openedAt).toLocaleString('vi-VN')}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-on-surface">Tổng kết doanh thu</h3>
            <div className="m3-card p-4 border-l-4 border-l-primary">
              <span className="text-sm font-semibold text-on-surface-variant block">Tổng doanh thu tạm tính</span>
              <span className="text-2xl font-bold text-primary">{totalRevenue.toLocaleString('vi-VN')} đ</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="m3-card p-3.5 space-y-1">
                <span className="text-sm text-on-surface-variant flex items-center gap-1.5"> Tiền mặt</span>
                <span className="text-base font-bold text-on-surface">{cashRevenue.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="m3-card p-3.5 space-y-1">
                <span className="text-sm text-on-surface-variant flex items-center gap-1.5"> Chuyển khoản / QR</span>
                <span className="text-base font-bold text-on-surface">{qrRevenue.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="m3-card p-3.5 space-y-1">
                <span className="text-sm text-on-surface-variant flex items-center gap-1.5"> Thẻ tín dụng</span>
                <span className="text-base font-bold text-on-surface">{cardRevenue.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="m3-card p-3.5 space-y-1">
                <span className="text-sm text-on-surface-variant flex items-center gap-1.5"> Quỹ đầu ca</span>
                <span className="text-base font-bold text-on-surface">{openShift.openingCash.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>

            <div className="rounded-2xl bg-tertiary-container p-4 flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-on-tertiary-container block">Tiền mặt trong két (Dự kiến)</span>
                <span className="text-sm text-on-tertiary-container/80">Tiền mặt + Quỹ đầu ca</span>
              </div>
              <span className="text-xl font-bold text-on-tertiary-container shrink-0">{expectedCash.toLocaleString('vi-VN')} đ</span>
            </div>
          </div>

          {!closeStep ? (
            <button
              onClick={() => { setClosingCashInput(expectedCash); setCloseStep(true); }}
              className="m3-btn-danger w-full !min-h-12"
            >
               Đóng ca làm việc
            </button>
          ) : (
            <form onSubmit={handleCloseShift} className="m3-card p-5 space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                   Tiền mặt đếm thực tế (đ)
                </label>
                <input
                  type="number"
                  min="0"
                  value={closingCashInput || ''}
                  onChange={(e) => setClosingCashInput(Math.max(0, parseInt(e.target.value) || 0))}
                  className="m3-input font-mono"
                  required
                />
              </div>
              <div className={`p-3 rounded-xl text-center text-sm font-bold ${
                closingCashInput - expectedCash === 0 ? 'm3-badge-success' : 'm3-badge-error'
              }`}>
                Chênh lệch: {closingCashInput - expectedCash >= 0 ? '+' : ''}{(closingCashInput - expectedCash).toLocaleString('vi-VN')} đ
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCloseStep(false)} className="m3-btn-tonal flex-1 !min-h-11">
                  Hủy
                </button>
                <button type="submit" className="m3-btn-danger flex-1 !min-h-11">
                  Xác nhận đóng ca
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {pastShifts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
             Lịch sử ca đã đóng
          </h3>
          <div className="space-y-2">
            {pastShifts.map(s => {
              const diff = (s.closingCashActual || 0) - (s.closingCashExpected || 0);
              return (
                <div key={s.id} className={`m3-card p-3.5 border-l-4 ${diff === 0 ? 'border-l-secondary' : 'border-l-error'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-on-surface">{s.staffName}</span>
                    <span className={`text-sm font-bold ${diff === 0 ? 'text-secondary' : 'text-error'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {new Date(s.openedAt).toLocaleString('vi-VN')} → {s.closedAt ? new Date(s.closedAt).toLocaleString('vi-VN') : '—'}
                  </p>
                  <div className="flex justify-between text-sm text-on-surface-variant pt-1">
                    <span>Kỳ vọng: {(s.closingCashExpected || 0).toLocaleString('vi-VN')}đ</span>
                    <span>Thực tế: {(s.closingCashActual || 0).toLocaleString('vi-VN')}đ</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
