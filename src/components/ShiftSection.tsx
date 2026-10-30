/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOrderPayments } from '../utils/payments';
import React, { useState } from 'react';
import { Shift, Order } from '../types';
import PageCard from './ui/PageCard';
import DataTable from './ui/DataTable';

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

  const tile = 'rounded-xl border border-primary/60 p-4 space-y-1';
  const closeDiff = closingCashInput - expectedCash;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(20rem,26rem)_1fr] gap-4 items-start">
      <PageCard title="Ca làm việc">
        {!openShift ? (
          <form onSubmit={handleOpenShift} className="space-y-3">
            <h3 className="text-base font-bold text-on-surface">Mở ca làm việc mới</h3>
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
            <button type="submit" className="m3-btn-filled w-full !rounded-xl !min-h-11">Mở ca cho {currentUser.name}</button>
          </form>
        ) : !closeStep ? (
          <button onClick={() => { setClosingCashInput(expectedCash); setCloseStep(true); }} className="m3-btn-filled w-full !rounded-xl !min-h-11">
            Đóng ca làm việc
          </button>
        ) : (
          <form onSubmit={handleCloseShift} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Tiền mặt đếm thực tế (đ)</label>
              <input
                type="number"
                min="0"
                value={closingCashInput || ''}
                onChange={(e) => setClosingCashInput(Math.max(0, parseInt(e.target.value) || 0))}
                className="m3-input font-mono"
                required
              />
            </div>
            <div className={`p-3 rounded-xl text-center text-sm font-bold ${closeDiff === 0 ? 'm3-badge-success' : 'm3-badge-error'}`}>
              Chênh lệch: {closeDiff >= 0 ? '+' : ''}{closeDiff.toLocaleString('vi-VN')}đ
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCloseStep(false)} className="m3-btn-tonal flex-1 !rounded-xl !min-h-11">Hủy</button>
              <button type="submit" className="m3-btn-filled flex-1 !rounded-xl !min-h-11">Xác nhận đóng ca</button>
            </div>
          </form>
        )}
      </PageCard>

      <PageCard title="Sổ quỹ ca làm việc">
        {openShift ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-primary-container/60 p-4">
              <div><p className="text-sm font-bold text-on-surface">Trạng thái</p><p className="text-sm text-on-surface-variant">Đang mở ca</p></div>
              <div><p className="text-sm font-bold text-on-surface">Thu ngân</p><p className="text-sm text-on-surface-variant">{openShift.staffName}</p></div>
              <div><p className="text-sm font-bold text-on-surface">Bắt đầu</p><p className="text-sm text-on-surface-variant">{new Date(openShift.openedAt).toLocaleString('vi-VN')}</p></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={tile}><p className="text-lg text-on-surface">Tiền mặt</p><p className="text-xl font-bold">{cashRevenue.toLocaleString('vi-VN')}đ</p></div>
              <div className={tile}><p className="text-lg text-on-surface">Chuyển khoản / QR</p><p className="text-xl font-bold">{qrRevenue.toLocaleString('vi-VN')}đ</p></div>
              <div className={tile}><p className="text-lg text-on-surface">Thẻ tín dụng</p><p className="text-xl font-bold">{cardRevenue.toLocaleString('vi-VN')}đ</p></div>
              <div className={tile}><p className="text-lg text-on-surface">Quỹ đầu ca</p><p className="text-xl font-bold">{openShift.openingCash.toLocaleString('vi-VN')}đ</p></div>
              <div className="rounded-xl bg-primary-container p-4 space-y-1">
                <p className="text-lg text-on-primary-container">Tổng doanh thu tạm tính</p>
                <p className="text-xl font-bold text-on-primary-container">{totalRevenue.toLocaleString('vi-VN')}đ</p>
              </div>
              <div className="rounded-xl bg-secondary-container p-4 space-y-1">
                <p className="text-lg text-on-secondary-container">Tiền mặt trong két (Dự kiến)</p>
                <p className="text-sm italic text-on-secondary-container/80">Tiền mặt + Quỹ đầu ca</p>
                <p className="text-xl font-bold text-on-secondary-container">{expectedCash.toLocaleString('vi-VN')}đ</p>
              </div>
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">Chưa mở ca. Nhập tiền quỹ đầu ca ở khung bên trái để bắt đầu.</p>
        )}

        <h3 className="text-lg font-bold text-on-surface pt-2">Lịch sử đóng ca</h3>
        <DataTable
          rows={pastShifts}
          rowKey={s => s.id}
          emptyMessage="Chưa có ca nào được đóng"
          columns={[
            { key: 'staff', header: 'Thu ngân', render: s => s.staffName },
            { key: 'open', header: 'Thời gian mở ca', render: s => new Date(s.openedAt).toLocaleString('vi-VN') },
            { key: 'close', header: 'Thời gian đóng ca', render: s => (s.closedAt ? new Date(s.closedAt).toLocaleString('vi-VN') : '—') },
            { key: 'expected', header: 'Kỳ vọng', className: 'text-right', render: s => (s.closingCashExpected || 0).toLocaleString('vi-VN') },
            { key: 'actual', header: 'Thực tế', className: 'text-right', render: s => (s.closingCashActual || 0).toLocaleString('vi-VN') },
            { key: 'diff', header: 'Chênh lệch', className: 'text-right', render: s => {
              const diff = (s.closingCashActual || 0) - (s.closingCashExpected || 0);
              return <span className={`font-bold ${diff === 0 ? 'text-secondary' : 'text-error'}`}>{diff >= 0 ? '+' : ''}{diff.toLocaleString('vi-VN')}</span>;
            } },
          ]}
        />
      </PageCard>
    </div>
  );
}
