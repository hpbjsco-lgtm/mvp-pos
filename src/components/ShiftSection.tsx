/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Wallet, PlayCircle, StopCircle, Clock, Banknote, History } from 'lucide-react';
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
  const cashRevenue = shiftOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.totalAmount, 0);
  const cardRevenue = shiftOrders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + o.totalAmount, 0);
  const qrRevenue = shiftOrders.filter(o => o.paymentMethod === 'qr').reduce((s, o) => s + o.totalAmount, 0);
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
          <Wallet className="w-6 h-6 text-teal-500" />
          Sổ quỹ ca làm việc
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Mở ca trước khi bắt đầu bán hàng, đóng ca cuối ngày để đối soát tiền mặt thực tế so với hệ thống.
        </p>
      </div>

      {!openShift ? (
        <form onSubmit={handleOpenShift} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <PlayCircle className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-black uppercase">Mở ca làm việc mới</h3>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Tiền quỹ đầu ca (đ)</label>
            <input
              type="number"
              min="0"
              value={openingCashInput || ''}
              onChange={(e) => setOpeningCashInput(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold font-mono"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-4 h-4" /> Mở ca cho {currentUser.name}
          </button>
        </form>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-black uppercase text-slate-800">Ca đang mở - {openShift.staffName}</h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" /> Mở lúc {new Date(openShift.openedAt).toLocaleString('vi-VN')}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">Quỹ đầu ca</span>
              <span className="text-sm font-black text-slate-900">{openShift.openingCash.toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
              <span className="text-[9px] text-emerald-600 font-bold uppercase block">Thu tiền mặt</span>
              <span className="text-sm font-black text-emerald-700">{cashRevenue.toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 text-center">
              <span className="text-[9px] text-blue-600 font-bold uppercase block">Thu thẻ / QR</span>
              <span className="text-sm font-black text-blue-700">{(cardRevenue + qrRevenue).toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100 text-center">
              <span className="text-[9px] text-amber-600 font-bold uppercase block">Số hóa đơn</span>
              <span className="text-sm font-black text-amber-700">{shiftOrders.length}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl text-center space-y-1">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Tiền mặt kỳ vọng trong két</span>
            <span className="text-2xl font-mono font-black text-white block">{expectedCash.toLocaleString('vi-VN')} đ</span>
          </div>

          {!closeStep ? (
            <button
              onClick={() => { setClosingCashInput(expectedCash); setCloseStep(true); }}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <StopCircle className="w-4 h-4" /> Đóng ca & đối soát tiền mặt
            </button>
          ) : (
            <form onSubmit={handleCloseShift} className="space-y-3 pt-2 border-t border-slate-100">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" /> Tiền mặt đếm thực tế (đ)
                </label>
                <input
                  type="number"
                  min="0"
                  value={closingCashInput || ''}
                  onChange={(e) => setClosingCashInput(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold font-mono"
                  required
                />
              </div>
              <div className={`p-2.5 rounded-xl text-center text-xs font-bold ${
                closingCashInput - expectedCash === 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}>
                Chênh lệch: {closingCashInput - expectedCash >= 0 ? '+' : ''}{(closingCashInput - expectedCash).toLocaleString('vi-VN')} đ
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCloseStep(false)}
                  className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow transition-all cursor-pointer"
                >
                  Xác nhận đóng ca
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {pastShifts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
            <History className="w-4 h-4 text-slate-400" /> Lịch sử ca đã đóng
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-3">Nhân viên</th>
                  <th className="p-3">Mở ca</th>
                  <th className="p-3">Đóng ca</th>
                  <th className="p-3 text-right">Kỳ vọng</th>
                  <th className="p-3 text-right">Thực tế</th>
                  <th className="p-3 text-right">Chênh lệch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {pastShifts.map(s => {
                  const diff = (s.closingCashActual || 0) - (s.closingCashExpected || 0);
                  return (
                    <tr key={s.id}>
                      <td className="p-3 font-bold">{s.staffName}</td>
                      <td className="p-3 text-slate-500">{new Date(s.openedAt).toLocaleString('vi-VN')}</td>
                      <td className="p-3 text-slate-500">{s.closedAt ? new Date(s.closedAt).toLocaleString('vi-VN') : '—'}</td>
                      <td className="p-3 text-right font-mono">{(s.closingCashExpected || 0).toLocaleString('vi-VN')}đ</td>
                      <td className="p-3 text-right font-mono">{(s.closingCashActual || 0).toLocaleString('vi-VN')}đ</td>
                      <td className={`p-3 text-right font-mono font-bold ${diff === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toLocaleString('vi-VN')}đ
                      </td>
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
}
