/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { fileToResizedDataUrl } from '../utils/imageUpload';

/** Longest side of the stored logo in pixels; the receipt printer prints it about 200 dots wide, so this leaves room to scale down. */
const LOGO_MAX_SIZE = 400;

interface StoreLogoSettingsProps {
  /** Current logo as a data URL; empty when the store has none. */
  logoUrl: string;
  /** Saves the logo; an empty string removes it. */
  onSave: (logoUrl: string) => Promise<void>;
}

/**
 * Block to choose, preview and remove the logo printed at the top of receipts.
 */
export default function StoreLogoSettings({ logoUrl, onSave }: StoreLogoSettingsProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * Runs a save while the buttons are disabled and shows the outcome.
   *
   * @param work Produces the logo to save, or null to leave it unchanged.
   * @param successText Message shown after a successful save.
   */
  const save = async (work: () => Promise<string | null>, successText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await work();
      if (next === null) return;
      await onSave(next);
      setMessage({ ok: true, text: successText });
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Reads the chosen picture, shrinks it and saves it as the logo.
   *
   * @param event Change event of the file input.
   */
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await save(() => fileToResizedDataUrl(file, LOGO_MAX_SIZE, 0.9), 'Đã lưu logo. Hóa đơn in từ máy in nhiệt sẽ có logo ở đầu phiếu.');
  };

  return (
    <div className="space-y-3 pt-4 border-t border-slate-100">
      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Logo in trên hóa đơn</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-32 h-20 border border-slate-200 rounded-xl bg-white flex items-center justify-center overflow-hidden">
          {logoUrl
            ? <img src={logoUrl} alt="Logo cửa hàng" className="max-w-full max-h-full object-contain" />
            : <span className="text-xs text-slate-400">Chưa có logo</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="m3-btn-tonal !min-h-11 text-sm">
            {logoUrl ? 'Đổi logo' : 'Chọn logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save(async () => (window.confirm('Bỏ logo khỏi hóa đơn?') ? '' : null), 'Đã bỏ logo.')}
              className="m3-btn-outlined !min-h-11 text-sm"
            >
              Bỏ logo
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Máy in nhiệt chỉ in đen trắng, nên dùng logo đơn giản, nét đậm trên nền trắng. Ảnh nhiều màu sẽ in thành các chấm nhỏ.
      </p>
      {message && (
        <p className={`text-sm font-semibold rounded-xl p-3 ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
