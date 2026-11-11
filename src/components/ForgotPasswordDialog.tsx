/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { SyncClient } from '../sync/syncClient';

/** Fewest characters of a new password; the same rule as when an account is created. */
const MIN_PASSWORD_LENGTH = 6;

interface ForgotPasswordDialogProps {
  /** Client of the server that holds the accounts. */
  client: SyncClient;
  onClose: () => void;
}

/**
 * Dialog to choose a new password with a code mailed to the account: first the user name or email, then the code
 * and the new password.
 */
export default function ForgotPasswordDialog({ client, onClose }: ForgotPasswordDialogProps) {
  const [step, setStep] = useState<'login' | 'code' | 'done'>('login');
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * Runs an action while the buttons are disabled and shows a failure as a message.
   *
   * @param action Work to run.
   */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Asks the server to mail the code. */
  const sendCode = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      if (!login.trim()) throw new Error('Hãy nhập tên tài khoản hoặc email.');
      await client.requestPasswordReset(login.trim());
      setStep('code');
    });
  };

  /** Checks the new password and sets it with the code. */
  const reset = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      if (password !== again) throw new Error('Hai lần nhập mật khẩu mới chưa giống nhau.');
      await client.resetPassword(login.trim(), code.trim(), password);
      setStep('done');
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">Quên mật khẩu</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'login' && (
            <form onSubmit={sendCode} className="space-y-3">
              <p className="text-sm text-on-surface-variant">Nhập tên tài khoản hoặc email. Nếu tài khoản có email, mã đặt lại mật khẩu sẽ được gửi đến đó.</p>
              <input value={login} onChange={e => setLogin(e.target.value)} placeholder="Tên tài khoản hoặc email" autoCapitalize="none" autoCorrect="off" className="m3-input" autoFocus />
              <button type="submit" disabled={busy} className="m3-btn-filled w-full !min-h-12 disabled:opacity-50">{busy ? 'Đang gửi...' : 'Gửi mã'}</button>
              <p className="text-xs text-on-surface-variant">Tài khoản chưa có email thì nhờ chủ cửa hàng hoặc quản lý đặt lại mật khẩu.</p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={reset} className="space-y-3">
              <p className="text-sm text-on-surface-variant">Nếu tài khoản có email, mã 6 số đã được gửi và có hiệu lực 15 phút. Nhập mã cùng mật khẩu mới.</p>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Mã 6 số" className="m3-input font-mono tracking-widest" autoFocus />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu mới" autoComplete="new-password" className="m3-input" />
              <input type="password" value={again} onChange={e => setAgain(e.target.value)} placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" className="m3-input" />
              <button type="submit" disabled={busy || code.length !== 6} className="m3-btn-filled w-full !min-h-12 disabled:opacity-50">{busy ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
              <button type="button" onClick={() => { setStep('login'); setError(''); }} className="text-sm text-primary font-semibold underline cursor-pointer">Gửi lại mã hoặc đổi tài khoản</button>
            </form>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold rounded-xl p-3 bg-secondary-container text-on-secondary-container">Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.</p>
              <button type="button" onClick={onClose} className="m3-btn-filled w-full !min-h-12">Về màn đăng nhập</button>
            </div>
          )}

          {error && <p className="text-sm font-semibold rounded-xl p-3 bg-error-container text-on-error-container">{error}</p>}
        </div>
      </div>
    </div>
  );
}
