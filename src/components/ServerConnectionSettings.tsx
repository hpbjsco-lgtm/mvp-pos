/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { readBrowserDatabaseBytes } from '../db/driver';
import {
  clearServerConnection, getServerConnection, normalizeServerUrl, saveServerConnection,
} from '../db/serverConnection';

/** Result line shown under the buttons. */
interface StatusMessage {
  ok: boolean;
  text: string;
}

/**
 * Reads the saved connection for the form without throwing when it is damaged
 * (the form is the place where the person fixes it).
 *
 * @returns The saved connection, or null when none is saved or the saved value is damaged.
 */
function readSavedConnection() {
  try {
    return getServerConnection();
  } catch {
    return null;
  }
}

/**
 * Settings block for the database server: address and API token, a connection test, switching back to the
 * database in this browser, and moving the data of this browser to the server.
 * Hidden on iOS / Android, where the app always uses the database on the device.
 */
export default function ServerConnectionSettings() {
  const saved = readSavedConnection();
  const [url, setUrl] = useState(saved?.url ?? window.location.origin);
  const [token, setToken] = useState(saved?.token ?? '');
  const [adminToken, setAdminToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  if (Capacitor.isNativePlatform()) return null;

  /**
   * Runs an action while the buttons are disabled and shows its failure as a message.
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

  /** Checks that the server answers and accepts the API token. */
  const testConnection = () => withBusy(async () => {
    const baseUrl = normalizeServerUrl(url);
    const health = await fetch(`${baseUrl}/api/health`).catch((error: Error) => {
      throw new Error(`Không kết nối được ${baseUrl}: ${error.message}`);
    });
    if (!health.ok) throw new Error(`Máy chủ trả lỗi ${health.status} ở /api/health. Kiểm tra cấu hình Apache (ProxyPass /api).`);
    const probe = await fetch(`${baseUrl}/api/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
      body: JSON.stringify({ action: 'all', sql: 'SELECT 1 AS ok' }),
    });
    if (probe.status === 401) throw new Error('Máy chủ có phản hồi nhưng mã API không đúng.');
    if (!probe.ok) throw new Error(`Máy chủ trả lỗi ${probe.status} khi thử truy vấn.`);
    setMessage({ ok: true, text: 'Kết nối thành công, mã API hợp lệ.' });
  });

  /** Saves the connection and reloads so the app starts on the server database. */
  const saveAndReload = () => withBusy(async () => {
    saveServerConnection({ url, token });
    window.location.reload();
  });

  /** Forgets the connection and reloads so the app starts on the database of this browser. */
  const disconnect = () => withBusy(async () => {
    if (!window.confirm('Ngắt kết nối máy chủ và quay lại dùng dữ liệu lưu trong trình duyệt này?')) return;
    clearServerConnection();
    window.location.reload();
  });

  /** Uploads the database of this browser to the server, replacing the data stored there. */
  const moveBrowserDataToServer = () => withBusy(async () => {
    const baseUrl = normalizeServerUrl(url);
    if (!adminToken.trim()) throw new Error('Cần nhập mã quản trị (ADMIN_TOKEN) của máy chủ.');
    const bytes = await readBrowserDatabaseBytes();
    if (!bytes) throw new Error('Trình duyệt này chưa có dữ liệu nào để chuyển.');
    const confirmed = window.confirm(
      'Dữ liệu trong trình duyệt này sẽ THAY TOÀN BỘ dữ liệu đang có trên máy chủ.\n'
      + 'Máy chủ tự lưu bản sao dữ liệu cũ vào thư mục backups trước khi thay.\n\nTiếp tục?');
    if (!confirmed) return;
    const response = await fetch(`${baseUrl}/admin/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${adminToken.trim()}` },
      body: bytes,
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Mã quản trị không đúng.');
    if (!response.ok) throw new Error(body.error || `Máy chủ trả lỗi ${response.status}.`);
    setAdminToken('');
    setMessage({
      ok: true,
      text: `Đã chuyển dữ liệu lên máy chủ. Bản sao dữ liệu cũ của máy chủ: backups/${body.previousDataSavedAs}. `
        + (saved ? 'Hãy tải lại trang để dùng dữ liệu mới.' : 'Bấm "Lưu và kết nối" để bắt đầu dùng máy chủ.'),
    });
  });

  return (
    <section className="space-y-3 border border-outline-variant rounded-2xl p-4 bg-surface-container-lowest">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-on-surface">Máy chủ dữ liệu</h3>
        <span className={`m3-badge ${saved ? 'm3-badge-success' : 'm3-badge-neutral'}`}>
          {saved ? `Đang dùng máy chủ: ${saved.url}` : 'Đang dùng dữ liệu trong trình duyệt'}
        </span>
      </div>
      <p className="text-sm text-on-surface-variant">
        Khi kết nối máy chủ, dữ liệu nằm trong file SQLite trên máy chủ và dùng chung cho mọi máy. Cần có mạng để bán hàng.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-on-surface-variant" htmlFor="server-url">Địa chỉ máy chủ</label>
          <input id="server-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://pos.hp-backup.com" className="m3-input" autoCapitalize="none" autoCorrect="off" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-on-surface-variant" htmlFor="server-token">Mã API</label>
          <input id="server-token" type="password" value={token} onChange={e => setToken(e.target.value)} className="m3-input" autoComplete="off" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={testConnection} className="m3-btn-tonal !min-h-11 !rounded-xl text-sm">Kiểm tra kết nối</button>
        <button type="button" disabled={busy || !token.trim()} onClick={saveAndReload} className="m3-btn-filled !min-h-11 !rounded-xl text-sm">Lưu và kết nối</button>
        {saved && (
          <button type="button" disabled={busy} onClick={disconnect} className="m3-btn-outlined !min-h-11 !rounded-xl text-sm">Ngắt kết nối</button>
        )}
      </div>

      <div className="space-y-2 border-t border-outline-variant pt-3">
        <h4 className="text-sm font-bold text-on-surface">Chuyển dữ liệu trong trình duyệt này lên máy chủ</h4>
        <p className="text-sm text-on-surface-variant">
          Dùng một lần khi bắt đầu chuyển sang máy chủ. Mã quản trị chỉ dùng cho lần chuyển này và không được lưu lại.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 flex-1 min-w-[14rem]">
            <label className="text-sm font-semibold text-on-surface-variant" htmlFor="server-admin-token">Mã quản trị (ADMIN_TOKEN)</label>
            <input id="server-admin-token" type="password" value={adminToken} onChange={e => setAdminToken(e.target.value)} className="m3-input" autoComplete="off" />
          </div>
          <button type="button" disabled={busy} onClick={moveBrowserDataToServer} className="m3-btn-danger !min-h-12 !rounded-xl text-sm">Chuyển dữ liệu lên máy chủ</button>
        </div>
      </div>

      {message && (
        <p className={`text-sm font-semibold rounded-xl p-3 ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
