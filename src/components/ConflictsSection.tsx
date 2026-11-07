/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { compareConflict, type ConflictComparison } from '../sync/conflictPresenter';
import { requestSyncNow } from '../sync/appSyncClient';
import { SyncRequestError, type ConflictDetail, type SyncClient } from '../sync/syncClient';
import PageCard from './ui/PageCard';
import PageTabs from './ui/PageTabs';
import DataTable, { type DataTableColumn } from './ui/DataTable';

/** Most conflicts whose two versions are loaded for the list. */
const MAX_LOADED = 50;

type Tab = 'pending' | 'resolved';

/** A conflict of the list with its comparison. */
interface ConflictRow {
  detail: ConflictDetail;
  comparison: ConflictComparison;
}

interface ConflictsSectionProps {
  /** Client of the server this app uses. */
  client: SyncClient;
  /** Store whose conflicts are shown. */
  storeId: string;
  /** Name of the person who decides, stored with the resolution. */
  resolvedBy: string;
  /** Called after a conflict was resolved, so counters elsewhere refresh. */
  onChanged: () => void;
  triggerBeep: (success: boolean) => void;
}

/**
 * @param iso ISO time from the server.
 * @returns Local date and time.
 */
const formatTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * @param deviceId Device identifier.
 * @returns The last characters, enough to tell devices apart.
 */
const shortDevice = (deviceId: string) => deviceId.slice(-6).toUpperCase();

/** Words for the choice stored with a resolved conflict. */
const RESOLUTION_LABELS = { server: 'Giữ bản máy chủ', device: 'Dùng bản của máy' } as const;

/**
 * Screen where the owner or a manager decides, for each synchronisation conflict, which version is right:
 * the one on the server or the one a device tried to save.
 */
export default function ConflictsSection({ client, storeId, resolvedBy, onChanged, triggerBeep }: ConflictsSectionProps) {
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Loads the list of the current tab with both versions of each conflict. */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const summaries = (await client.listConflicts(storeId, tab)).slice(0, MAX_LOADED);
      const details = await Promise.all(summaries.map(summary => client.getConflict(summary.id)));
      setRows(details.map(detail => ({ detail, comparison: compareConflict(detail) })));
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, storeId, tab]);

  useEffect(() => { void load(); }, [load]);

  const selected = rows.find(row => row.detail.id === selectedId) ?? null;

  const columns: DataTableColumn<ConflictRow>[] = [
    { key: 'type', header: 'Loại', render: row => row.comparison.tableLabel },
    { key: 'record', header: 'Bản ghi', render: row => <span className="font-semibold">{row.comparison.rowLabel}</span> },
    { key: 'device', header: 'Máy', render: row => <span className="font-mono">{shortDevice(row.detail.deviceId)}</span> },
    { key: 'time', header: 'Lúc', render: row => formatTime(tab === 'pending' ? row.detail.createdAt : row.detail.resolvedAt) },
    ...(tab === 'resolved' ? [
      { key: 'result', header: 'Kết quả', render: (row: ConflictRow) => (row.detail.resolution ? RESOLUTION_LABELS[row.detail.resolution] : '') },
      { key: 'by', header: 'Người xử lý', render: (row: ConflictRow) => row.detail.resolvedBy ?? '' },
    ] : []),
  ];

  /**
   * Resolves the selected conflict after the person confirms.
   *
   * @param choice `server` keeps the server's data, `device` stores the device's version.
   */
  const resolve = async (choice: 'server' | 'device') => {
    if (!selected) return;
    const { comparison, detail } = selected;
    const consequence = choice === 'device'
      ? `Bản của máy ${shortDevice(detail.deviceId)} sẽ được lưu lên máy chủ và thay bản hiện tại.`
      : 'Dữ liệu trên máy chủ được giữ nguyên, các máy sẽ bỏ thay đổi của mình.';
    if (!confirm(`${comparison.tableLabel} "${comparison.rowLabel}": ${RESOLUTION_LABELS[choice]}.\n\n${consequence}\nTiếp tục?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.resolveConflict(detail.id, choice, resolvedBy);
      triggerBeep(true);
      setSelectedId(null);
      setMessage({ ok: true, text: `Đã xử lý "${comparison.rowLabel}": ${RESOLUTION_LABELS[choice].toLowerCase()}.` });
      requestSyncNow();
      onChanged();
    } catch (resolveError) {
      triggerBeep(false);
      const code = resolveError instanceof SyncRequestError ? resolveError.code : '';
      if (code === 'CONFLICT_STALE') {
        setMessage({ ok: false, text: 'Dữ liệu trên máy chủ vừa thay đổi. Hãy xem lại hai bản hiện tại rồi chọn lại.' });
      } else if (code === 'NOT_PENDING') {
        setMessage({ ok: false, text: 'Xung đột này đã được người khác xử lý.' });
        setSelectedId(null);
        onChanged();
      } else {
        setMessage({ ok: false, text: (resolveError as Error).message });
      }
    } finally {
      setBusy(false);
      await load();
    }
  };

  return (
    <PageCard
      title="Xung đột đồng bộ"
      headerRight={<PageTabs options={[{ value: 'pending', label: 'Chờ xử lý' }, { value: 'resolved', label: 'Đã xử lý' }]} value={tab} onChange={value => { setTab(value); setSelectedId(null); setMessage(null); }} />}
    >
      <p className="text-sm text-on-surface-variant">
        Xung đột xảy ra khi hai thiết bị sửa cùng một bản ghi. Chọn bản nào đúng: bản đang có trên máy chủ hoặc bản mà thiết bị đã cố lưu.
      </p>

      {message && (
        <p className={`text-sm font-semibold rounded-xl p-3 ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>{message.text}</p>
      )}
      {error && <p className="text-sm font-semibold rounded-xl p-3 bg-error-container text-on-error-container">Không tải được danh sách xung đột: {error}</p>}

      <DataTable
        rows={rows}
        rowKey={row => row.detail.id}
        emptyMessage={loading ? 'Đang tải...' : tab === 'pending' ? 'Không có xung đột nào cần xử lý' : 'Chưa có xung đột nào được xử lý'}
        onRowClick={row => { setSelectedId(row.detail.id); setMessage(null); }}
        minWidthClass="min-w-[560px]"
        columns={columns}
      />

      {selected && (
        <div className="rounded-2xl border border-outline-variant p-4 space-y-4">
          <h3 className="text-lg font-bold text-on-surface">{selected.comparison.tableLabel}: {selected.comparison.rowLabel}</h3>

          {selected.comparison.serverRemoved && (
            <p className="text-sm font-semibold rounded-xl p-3 bg-tertiary-container text-on-tertiary-container">
              Bản ghi này đã bị xóa trên máy chủ. Chọn "Dùng bản của máy" để tạo lại, hoặc "Giữ bản máy chủ" để giữ trạng thái đã xóa.
            </p>
          )}

          {selected.comparison.fields.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-on-surface-variant border-b border-outline-variant">
                    <th className="py-2 pr-3 font-semibold">Trường</th>
                    <th className="py-2 pr-3 font-semibold">Bản máy chủ</th>
                    <th className="py-2 font-semibold">Bản của máy {shortDevice(selected.detail.deviceId)}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.comparison.fields.map(field => (
                    <tr key={field.column} className="border-b border-outline-variant/50">
                      <td className="py-2 pr-3 font-semibold">{field.label}</td>
                      <td className="py-2 pr-3 break-words">{field.serverValue}</td>
                      <td className="py-2 break-words">{field.deviceValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selected.comparison.children.map(child => (
            <div key={child.label} className="space-y-1 text-sm">
              <p className="font-semibold">{child.label}: máy chủ {child.serverCount}, máy {child.deviceCount}</p>
              {child.added.length > 0 && <p>Chỉ có trên máy: {child.added.join(', ')}</p>}
              {child.removed.length > 0 && <p>Chỉ có trên máy chủ: {child.removed.join(', ')}</p>}
              {child.changed.map(line => <p key={line}>Khác nhau: {line}</p>)}
            </div>
          ))}

          {!selected.comparison.serverRemoved && selected.comparison.fields.length === 0 && selected.comparison.children.length === 0 && (
            <p className="text-sm text-on-surface-variant">Hai bản giống nhau ở các trường hiển thị được (chỉ khác thông tin hệ thống). Chọn bản nào cũng được.</p>
          )}

          {selected.detail.status === 'pending' ? (
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => void resolve('server')} className="m3-btn-outlined !min-h-12">Giữ bản máy chủ</button>
              <button type="button" disabled={busy} onClick={() => void resolve('device')} className="m3-btn-filled !min-h-12">Dùng bản của máy</button>
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Đã xử lý lúc {formatTime(selected.detail.resolvedAt)} bởi {selected.detail.resolvedBy}: {selected.detail.resolution ? RESOLUTION_LABELS[selected.detail.resolution] : ''}.
            </p>
          )}
        </div>
      )}
    </PageCard>
  );
}
