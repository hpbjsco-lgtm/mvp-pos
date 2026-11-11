/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SalesChannel } from '../types';

interface SalesChannelSettingsProps {
  /** Channels saved for the store. */
  channels: SalesChannel[];
  /** Saves the list; it throws a readable message when the list is not valid. */
  onSave: (channels: SalesChannel[]) => Promise<void>;
}

/**
 * Block to set up the sales channels of the store (delivery apps, for example) and the commission each one keeps.
 * The cashier then picks the channel of an order when paying, and reports show revenue, commission and what was
 * really received per channel.
 */
export default function SalesChannelSettings({ channels, onSave }: SalesChannelSettingsProps) {
  const [rows, setRows] = useState<SalesChannel[]>(channels);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /** Changes one row of the list. */
  const update = (index: number, patch: Partial<SalesChannel>) => setRows(list => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  /** Saves the list and shows the outcome. */
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onSave(rows);
      setMessage({ ok: true, text: 'Đã lưu danh sách kênh bán.' });
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="m3-card p-5 space-y-3">
      <div>
        <h3 className="text-base font-bold text-on-surface">Kênh bán và chiết khấu đối tác</h3>
        <p className="text-sm text-on-surface-variant">
          Ví dụ GrabFood, ShopeeFood. Khi thanh toán đơn mang về hoặc giao đi, thu ngân chọn kênh và hệ thống tính tiền đối tác giữ lại theo % bên dưới.
          Chưa có kênh nào thì ô chọn kênh không hiện.
        </p>
      </div>

      {rows.length === 0 && <p className="text-sm text-on-surface-variant">Chưa có kênh bán nào.</p>}
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_7rem_2.5rem] gap-2 items-center">
          <input value={row.name} onChange={e => update(index, { name: e.target.value })} placeholder="Tên kênh" className="m3-input !min-h-10" aria-label="Tên kênh" />
          <div className="relative">
            <input
              type="number" min={0} max={100} step="any" value={row.commissionPercent || ''} placeholder="0"
              onChange={e => update(index, { commissionPercent: parseFloat(e.target.value) || 0 })} className="m3-input !min-h-10 text-right pr-7" aria-label="Chiết khấu (%)"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">%</span>
          </div>
          <button type="button" onClick={() => setRows(list => list.filter((_, i) => i !== index))} className="m3-icon-btn !w-9 !h-9 hover:text-error" aria-label="Xóa kênh"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setRows(list => [...list, { name: '', commissionPercent: 0 }])} className="m3-btn-outlined !min-h-10 text-sm">+ Thêm kênh</button>
        <button type="button" disabled={busy} onClick={() => void save()} className="m3-btn-filled !min-h-10 text-sm">Lưu</button>
      </div>
      {message && (
        <p className={`text-sm font-semibold rounded-xl p-3 ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>{message.text}</p>
      )}
    </div>
  );
}
