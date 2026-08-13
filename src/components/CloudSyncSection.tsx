/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MÀN HÌNH ĐỒNG BỘ CLOUD & SAO LƯU
 * Cho phép: cấu hình máy chủ, tải lên / tải xuống dữ liệu, sao lưu ra tệp,
 * phục hồi từ tệp, và xem tình trạng cơ sở dữ liệu SQLite trên máy.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud, CloudUpload, CloudDownload, Database, HardDriveDownload, HardDriveUpload,
  Link2, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, Server, Smartphone, Clock,
} from 'lucide-react';
import {
  countPendingChanges, exportSnapshotToFile, getSyncConfig, importSnapshotFromText,
  pruneOutbox, pullSnapshot, pushSnapshot, saveSyncConfig, testConnection, type SyncConfig,
} from '../cloud/cloudSync';
import { getDatabaseStats, type DatabaseStats } from '../db/stats';
import { logOperation } from '../utils/logger';

interface CloudSyncSectionProps {
  storeId: string;
  storeName: string;
  triggerBeep: (success: boolean) => void;
  onDataChanged: () => Promise<void> | void;
}

export default function CloudSyncSection({
  storeId,
  storeName,
  triggerBeep,
  onDataChanged,
}: CloudSyncSectionProps) {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [pending, setPending] = useState(0);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pullMode, setPullMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    if (!storeId) return;
    const cfg = await getSyncConfig(storeId);
    setConfig(cfg);
    setEndpoint(cfg.endpoint);
    setToken(cfg.token);
    setAutoSync(cfg.autoSync);
    setPending(await countPendingChanges(storeId));
    setStats(await getDatabaseStats(storeId));
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const runTask = async (label: string, task: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(label);
    setMessage(null);
    try {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      triggerBeep(result.ok);
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message ?? 'Lỗi không xác định' });
      triggerBeep(false);
    } finally {
      setBusy('');
    }
  };

  const handleSaveConfig = () =>
    runTask('save', async () => {
      await saveSyncConfig(storeId, { endpoint, token, autoSync });
      logOperation('Đồng bộ Cloud', 'Lưu cấu hình máy chủ', { endpoint, autoSync });
      return { ok: true, message: 'Đã lưu cấu hình máy chủ Cloud.' };
    });

  const handlePush = () =>
    runTask('push', async () => {
      const res = await pushSnapshot(storeId);
      await pruneOutbox();
      logOperation('Đồng bộ Cloud', 'Tải dữ liệu lên Cloud', { ok: res.ok });
      return res;
    });

  const handlePull = () =>
    runTask('pull', async () => {
      const res = await pullSnapshot(storeId, pullMode);
      if (res.ok) await onDataChanged();
      logOperation('Đồng bộ Cloud', 'Tải dữ liệu từ Cloud về', { ok: res.ok, mode: pullMode });
      return res;
    });

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    await runTask('import', async () => {
      const res = await importSnapshotFromText(text, storeId, pullMode);
      if (res.ok) await onDataChanged();
      return res;
    });
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN') : 'Chưa từng thực hiện';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Banner trạng thái */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950 rounded-3xl p-6 text-white shadow-xl border border-emerald-900/30">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="space-y-2">
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-[10px] font-black tracking-widest uppercase font-mono">
              LOCAL-FIRST · SQLITE
            </span>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Cloud className="w-6 h-6 text-emerald-400" />
              Đồng bộ dữ liệu lên Cloud
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Toàn bộ dữ liệu bán hàng được lưu trong SQLite ngay trên thiết bị nên app hoạt động
              bình thường khi mất mạng. Khi có mạng, bạn tải dữ liệu lên Cloud để sao lưu hoặc tải
              về để lấy dữ liệu từ máy khác (thu ngân, bếp, quản lý).
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-700">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Thiết bị:</span>
              <span className="text-slate-200 truncate max-w-[160px]">{config?.deviceId ?? '...'}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-700">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Cửa hàng:</span>
              <span className="text-emerald-400 truncate max-w-[160px]">{storeId || 'chưa chọn'}</span>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold flex items-start gap-2 border ${
            message.ok
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.ok ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <span className="leading-relaxed">{message.text}</span>
        </div>
      )}

      {/* Cấu hình máy chủ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Server className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-extrabold text-slate-900 uppercase">Cấu hình máy chủ Cloud</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Địa chỉ máy chủ (endpoint)
            </label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://sync.cuahangcuaban.vn"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:border-emerald-400 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Token bảo mật
            </label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Bearer token do máy chủ cấp"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:border-emerald-400 outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-bold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
          Tự động đẩy thay đổi lên Cloud mỗi 5 phút khi có mạng
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleSaveConfig}
            disabled={!!busy || !storeId}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <ShieldCheck className="w-4 h-4" /> Lưu cấu hình
          </button>
          <button
            onClick={() => runTask('test', () => testConnection(storeId))}
            disabled={!!busy || !endpoint}
            className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <Link2 className={`w-4 h-4 ${busy === 'test' ? 'animate-spin' : ''}`} /> Kiểm tra kết nối
          </button>
        </div>
      </div>

      {/* Tải lên / tải xuống */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase">Tải lên Cloud</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Đẩy toàn bộ dữ liệu SQLite của cửa hàng <strong>{storeName || storeId}</strong> lên máy chủ.
            Máy chủ hợp nhất theo nguyên tắc bản ghi mới nhất được giữ lại.
          </p>
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <span className="text-slate-500 font-medium">Thay đổi chờ đồng bộ</span>
            <span className={`font-black ${pending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {pending.toLocaleString('vi-VN')}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Lần tải lên gần nhất
            </span>
            <span className="font-bold text-slate-700">{fmt(config?.lastPushAt ?? null)}</span>
          </div>
          <button
            onClick={handlePush}
            disabled={!!busy || !endpoint || !storeId}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <CloudUpload className={`w-4 h-4 ${busy === 'push' ? 'animate-bounce' : ''}`} />
            {busy === 'push' ? 'Đang tải lên...' : 'TẢI DỮ LIỆU LÊN CLOUD'}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <CloudDownload className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase">Tải xuống từ Cloud</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Lấy dữ liệu trực tuyến về thiết bị này. Chọn cách xử lý khi dữ liệu hai bên khác nhau:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPullMode('merge')}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer transition-all ${
                pullMode === 'merge'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}
            >
              Hợp nhất (an toàn)
            </button>
            <button
              onClick={() => setPullMode('replace')}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer transition-all ${
                pullMode === 'replace'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
              }`}
            >
              Ghi đè toàn bộ
            </button>
          </div>
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Lần tải xuống gần nhất
            </span>
            <span className="font-bold text-slate-700">{fmt(config?.lastPullAt ?? null)}</span>
          </div>
          <button
            onClick={handlePull}
            disabled={!!busy || !endpoint || !storeId}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <CloudDownload className={`w-4 h-4 ${busy === 'pull' ? 'animate-bounce' : ''}`} />
            {busy === 'pull' ? 'Đang tải xuống...' : 'TẢI DỮ LIỆU TỪ CLOUD VỀ'}
          </button>
        </div>
      </div>

      {/* Sao lưu tệp */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <HardDriveDownload className="w-5 h-5 text-violet-600" />
          <h3 className="text-sm font-extrabold text-slate-900 uppercase">
            Sao lưu / phục hồi bằng tệp (không cần máy chủ)
          </h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Xuất toàn bộ dữ liệu ra một tệp JSON để lưu vào Google Drive / iCloud / USB, và phục hồi
          lại khi đổi máy. Đây cũng là cách chuyển dữ liệu giữa máy Android và iPhone.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runTask('export', () => exportSnapshotToFile(storeId))}
            disabled={!!busy || !storeId}
            className="px-4 py-2.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <HardDriveDownload className="w-4 h-4" /> Xuất tệp sao lưu
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!!busy || !storeId}
            className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <HardDriveUpload className="w-4 h-4" /> Phục hồi từ tệp
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => void refresh()}
            disabled={!!busy}
            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Làm mới thống kê
          </button>
        </div>
      </div>

      {/* Thống kê DB */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Database className="w-5 h-5 text-slate-700" />
          <h3 className="text-sm font-extrabold text-slate-900 uppercase">
            Cơ sở dữ liệu SQLite trên thiết bị
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats?.tables.map((t) => (
            <div key={t.table} className="bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase truncate" title={t.label}>
                {t.label}
              </p>
              <p className="text-base font-black text-slate-900">{t.count.toLocaleString('vi-VN')}</p>
            </div>
          ))}
        </div>
        {stats && (
          <p className="text-[11px] text-slate-400 font-mono pt-1">
            Nền tảng lưu trữ: {stats.platform} · Phiên bản cấu trúc: v{stats.schemaVersion}
          </p>
        )}
      </div>
    </div>
  );
}
