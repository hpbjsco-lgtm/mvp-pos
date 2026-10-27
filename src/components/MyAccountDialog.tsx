/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Attendance } from '../types';

interface MyAccountDialogProps {
  user: { uid: string; name: string; username?: string; email?: string };
  roleLabel: string;
  /** Có hiển thị chấm công hay không (sysadmin không chấm công). */
  canCheckIn: boolean;
  /** Có cho đổi mật khẩu không (tài khoản sysadmin cứng đổi trong authConfig.ts). */
  canChangePassword?: boolean;
  attendance: Attendance[];
  onCheckIn: (userId: string, userName: string) => Promise<void>;
  onCheckOut: (userId: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  triggerBeep: (success: boolean) => void;
  onClose: () => void;
}

/** Hộp thoại "Tài khoản của tôi": chấm công vào/ra ca và đổi mật khẩu — dùng được cho mọi vai trò. */
export default function MyAccountDialog({
  user, roleLabel, canCheckIn, canChangePassword = true, attendance, onCheckIn, onCheckOut, onChangePassword, triggerBeep, onClose
}: MyAccountDialogProps) {
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const todayLog = attendance.find(a => a.userId === user.uid && a.date === todayStr);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (next !== confirm) {
      setMessage({ ok: false, text: 'Mật khẩu nhập lại không khớp.' });
      return;
    }
    setBusy(true);
    try {
      await onChangePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMessage({ ok: true, text: 'Đã đổi mật khẩu thành công.' });
      triggerBeep(true);
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Không đổi được mật khẩu.' });
      triggerBeep(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-on-surface truncate">{user.name}</h3>
            <p className="text-sm text-on-surface-variant truncate">{roleLabel}{user.username ? ` · @${user.username}` : ''}</p>
          </div>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {canCheckIn && (
            <section className="space-y-3">
              <h4 className="text-base font-bold text-on-surface">Chấm công hôm nay</h4>
              {!todayLog ? (
                <button onClick={() => onCheckIn(user.uid, user.name)} className="m3-btn-filled w-full !min-h-12">Bắt đầu ca (Check-in)</button>
              ) : todayLog.status === 'working' ? (
                <>
                  <p className="text-sm text-on-surface-variant">Vào ca lúc <strong className="text-on-surface">{new Date(todayLog.checkIn).toLocaleTimeString('vi-VN')}</strong></p>
                  <button onClick={() => onCheckOut(user.uid)} className="m3-btn-danger w-full !min-h-12">Kết thúc ca (Check-out)</button>
                </>
              ) : (
                <div className="p-3 rounded-2xl bg-secondary-container text-on-secondary-container text-sm font-semibold">
                  Đã hoàn thành ca hôm nay: {todayLog.hoursWorked.toFixed(1)} giờ · {todayLog.dailyWage.toLocaleString('vi-VN')} đ
                </div>
              )}
            </section>
          )}

          {canChangePassword ? (
          <section className="space-y-3">
            <h4 className="text-base font-bold text-on-surface">Đổi mật khẩu</h4>
            <form onSubmit={submit} className="space-y-3">
              {message && (
                <div className={`p-3 rounded-xl text-sm font-semibold ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
                  {message.text}
                </div>
              )}
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Mật khẩu hiện tại" autoComplete="current-password" className="m3-input" required />
              <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" autoComplete="new-password" className="m3-input" required />
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" className="m3-input" required />
              <button type="submit" disabled={busy} className="m3-btn-tonal w-full !min-h-12 disabled:opacity-50">Đổi mật khẩu</button>
            </form>
          </section>
          ) : (
            <p className="text-sm text-on-surface-variant">Tài khoản quản trị hệ thống được cấu hình cứng trong mã nguồn (src/authConfig.ts), không đổi mật khẩu tại đây.</p>
          )}
        </div>
      </div>
    </div>
  );
}
