/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Settings, X } from 'lucide-react';
import { testServerAddress, type AddressTestResult } from '../native/connectionTest';
import { exportDatabaseToShare } from '../native/exportDatabase';
import { getNativeSettings, saveNativeSettings, validateNativeSettings, type NativeDataMode } from '../native/nativeSettings';

/** Result line shown in the dialog. */
interface StatusMessage {
  ok: boolean;
  text: string;
}

interface NativeConfigDialogProps {
  onClose: () => void;
}

/**
 * Dialog where a phone app is configured: either "Không dùng máy chủ" (data only on this device) or a
 * server (domain and local address, API token). It can also export the device database as a SQLite file.
 */
function NativeConfigDialog({ onClose }: NativeConfigDialogProps) {
  const saved = getNativeSettings();
  const [mode, setMode] = useState<Exclude<NativeDataMode, 'unset'>>(saved.mode === 'server' ? 'server' : 'standalone');
  const [domainUrl, setDomainUrl] = useState(saved.domainUrl);
  const [localUrl, setLocalUrl] = useState(saved.localUrl);
  const [token, setToken] = useState(saved.token);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [tests, setTests] = useState<AddressTestResult[]>([]);

  /**
   * Runs an action while the buttons are disabled and shows a failure as a message.
   *
   * @param action Work to run.
   */
  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /** Tests every address that was typed. */
  const testConnection = () => withBusy(async () => {
    const settings = validateNativeSettings({ mode: 'server', domainUrl, localUrl, token });
    const urls = [settings.domainUrl, settings.localUrl].filter(Boolean);
    setTests(await Promise.all(urls.map(url => testServerAddress(url, settings.token))));
  });

  /** Saves the settings. */
  const save = () => withBusy(async () => {
    await saveNativeSettings({ mode, domainUrl, localUrl, token });
    setMessage({
      ok: true,
      text: mode === 'server'
        ? 'Đã lưu cấu hình. Đồng bộ dữ liệu với máy chủ sẽ có ở bản cập nhật tiếp theo, hiện app vẫn dùng dữ liệu trên thiết bị.'
        : 'Đã lưu. App chỉ dùng dữ liệu trên thiết bị này.',
    });
  });

  /** Exports the device database and opens the share sheet. */
  const exportFile = () => withBusy(async () => {
    const fileName = await exportDatabaseToShare();
    setMessage({ ok: true, text: `Đã xuất file ${fileName}.` });
  });

  const radio = (value: Exclude<NativeDataMode, 'unset'>, title: string, detail: string) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="radio" name="data-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 w-5 h-5 accent-primary" />
      <span className="text-sm text-on-surface"><strong className="block text-base">{title}</strong>{detail}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-on-surface">Cấu hình kết nối</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="space-y-3">
            {radio('standalone', 'Không dùng máy chủ', 'Dữ liệu chỉ nằm trong SQLite của thiết bị này.')}
            {radio('server', 'Dùng máy chủ', 'Thử domain trước, không được thì dùng địa chỉ trong mạng nội bộ.')}
          </div>

          {mode === 'server' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant" htmlFor="native-domain">Domain</label>
                <input id="native-domain" value={domainUrl} onChange={e => setDomainUrl(e.target.value)} placeholder="https://pos.hp-backup.com" className="m3-input" autoCapitalize="none" autoCorrect="off" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant" htmlFor="native-local">IP trong mạng nội bộ</label>
                <input id="native-local" value={localUrl} onChange={e => setLocalUrl(e.target.value)} placeholder="http://192.168.1.12:8790" className="m3-input" autoCapitalize="none" autoCorrect="off" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant" htmlFor="native-token">Mã API</label>
                <input id="native-token" type="password" value={token} onChange={e => setToken(e.target.value)} className="m3-input" autoComplete="off" />
              </div>
              <button type="button" disabled={busy} onClick={testConnection} className="m3-btn-tonal w-full !min-h-11 text-sm">Kiểm tra kết nối</button>
              {tests.map(result => (
                <p key={result.url} className={`text-sm rounded-xl p-3 ${result.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
                  <strong className="block break-all">{result.url}</strong>{result.message}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-outline-variant pt-4">
            <h4 className="text-base font-bold text-on-surface">Sao lưu dữ liệu trên thiết bị</h4>
            <p className="text-sm text-on-surface-variant">Xuất toàn bộ dữ liệu thành file SQLite để lưu vào Files, gửi qua AirDrop hoặc mail.</p>
            <button type="button" disabled={busy} onClick={exportFile} className="m3-btn-outlined w-full !min-h-11 text-sm">Xuất file SQLite</button>
          </div>

          {message && (
            <p className={`text-sm font-semibold rounded-xl p-3 ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
              {message.text}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-outline-variant flex gap-3 shrink-0">
          <button type="button" disabled={busy} onClick={save} className="m3-btn-filled flex-1 !min-h-12">Lưu</button>
          <button type="button" onClick={onClose} className="m3-btn-outlined !min-h-12">Đóng</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Button that opens the configuration dialog. It only appears in the Android and iOS apps.
 *
 * @param props `className` for the button.
 */
export default function NativeConfigButton({ className = 'm3-btn-outlined !min-h-11 text-sm' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  if (!Capacitor.isNativePlatform()) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${className} flex items-center justify-center gap-2`}>
        <Settings className="w-4 h-4" /> Cấu hình
      </button>
      {open && <NativeConfigDialog onClose={() => setOpen(false)} />}
    </>
  );
}
