/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  X, Link2, Unlink, ArrowRightLeft, Scissors, Combine, CalendarClock, Info, History, Trash2, Minus, Plus, Check, ChevronRight,
} from 'lucide-react';
import { DiningTable, KitchenItem, Product, Zone } from '../types';
import { buildKitchenHistory } from '../utils/kitchenHistory';
import type { CartLine } from './POSScreen';
import {
  CartMap, DELIVERY_ID, MoveSelection, TAKEAWAY_ID, canTransferTo, formatElapsed, getChildTables, getGroupLabel,
  getGroupTables, getTableStats, lineKey, resolvePrimaryId, virtualCartLabel,
} from '../utils/tableOps';

const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** Khung hộp thoại dùng chung: bottom-sheet trên điện thoại, hộp giữa màn hình trên màn lớn. */
function Modal({ title, icon, onClose, children, footer }: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
            {icon && <span className="p-1.5 rounded-xl bg-primary-container text-on-primary-container">{icon}</span>}
            {title}
          </h3>
          <button onClick={onClose} className="m3-icon-btn !w-9 !h-9" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-outline-variant shrink-0 flex gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menu tuỳ chọn của đơn                                               */
/* ------------------------------------------------------------------ */

export interface OptionItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
}

export function OrderOptionsMenu({ title, groups, onClose }: { title: string; groups: OptionItem[][]; onClose: () => void }) {
  return (
    <Modal title={`Tùy chọn - ${title}`} onClose={onClose}>
      <div className="space-y-3 -mx-1">
        {groups.map((group, gi) => (
          <div key={gi} className="rounded-2xl border border-outline-variant overflow-hidden divide-y divide-outline-variant/60">
            {group.map(item => (
              <button
                key={item.key}
                disabled={item.disabled}
                onClick={() => { onClose(); item.onClick(); }}
                className={`w-full min-h-12 px-4 flex items-center gap-3 text-left text-base font-semibold transition-colors ${
                  item.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : item.danger
                      ? 'text-error hover:bg-error-container/50 cursor-pointer'
                      : 'text-on-surface hover:bg-surface-container cursor-pointer'
                }`}
              >
                <span className="shrink-0 w-5 h-5 flex items-center justify-center">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-sm font-medium text-on-surface-variant">{item.hint}</span>}
                <ChevronRight className="w-4 h-4 opacity-40" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Các icon dùng cho menu tuỳ chọn (gom lại để POSScreen khỏi import lặp). */
export const OptionIcons = {
  history: <History className="w-5 h-5" />,
  merge: <Link2 className="w-5 h-5" />,
  transfer: <ArrowRightLeft className="w-5 h-5" />,
  split: <Scissors className="w-5 h-5" />,
  combine: <Combine className="w-5 h-5" />,
  reservation: <CalendarClock className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
  cancel: <Trash2 className="w-5 h-5" />,
};

/* ------------------------------------------------------------------ */
/* Gộp bàn / bỏ gộp                                                    */
/* ------------------------------------------------------------------ */

function tableOccupancyLabel(t: DiningTable, tables: DiningTable[], carts: CartMap, products: Product[]) {
  const s = getTableStats(t, tables, carts, products);
  if (!s.isOccupied) return 'Trống';
  if (s.primaryId !== t.id) return `Gộp vào ${tables.find(x => x.id === s.primaryId)?.name || ''}`;
  return `${s.itemCount} món · ${money(s.total)}`;
}

export function MergeTablesDialog({ currentId, tables, zones, carts, products, onConfirm, onUnmerge, onClose }: {
  currentId: string;
  tables: DiningTable[];
  zones: Zone[];
  carts: CartMap;
  products: Product[];
  onConfirm: (otherIds: string[]) => void;
  onUnmerge: (childId: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const primaryId = resolvePrimaryId(tables, currentId);
  const group = getGroupTables(tables, primaryId);
  const children = getChildTables(tables, primaryId);
  const groupIds = new Set(group.map(t => t.id));
  const candidates = tables
    .filter(t => !groupIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <Modal
      title={`Gộp bàn - ${getGroupLabel(tables, primaryId)}`}
      icon={<Link2 className="w-4.5 h-4.5" />}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="m3-btn-outlined flex-1 !min-h-12">Đóng</button>
          <button
            disabled={picked.length === 0}
            onClick={() => onConfirm(picked)}
            className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-40"
          >
            <Link2 className="w-4 h-4" /> Gộp {picked.length > 0 ? `(${picked.length})` : ''}
          </button>
        </>
      }
    >
      {children.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">Đang gộp chung</p>
          <div className="flex flex-wrap gap-2">
            {children.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1.5 pl-3 pr-1 min-h-9 rounded-full bg-tertiary-container text-on-tertiary-container text-sm font-bold">
                {c.name}
                <button onClick={() => onUnmerge(c.id)} className="m3-icon-btn !w-7 !h-7 !text-on-tertiary-container" title="Bỏ gộp bàn này" aria-label={`Bỏ gộp ${c.name}`}>
                  <Unlink className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">Chọn bàn muốn gộp vào</p>
        <p className="text-sm text-on-surface-variant">Món của các bàn được chọn sẽ chuyển về một hóa đơn chung.</p>
        {zones.map(z => {
          const list = candidates.filter(t => t.zoneId === z.id);
          if (list.length === 0) return null;
          return (
            <div key={z.id} className="space-y-1.5">
              <p className="text-sm font-bold text-on-surface">{z.name}</p>
              <div className="grid grid-cols-2 gap-2">
                {list.map(t => {
                  const on = picked.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id)}
                      className={`text-left rounded-xl border-2 px-3 py-2 min-h-14 cursor-pointer transition-colors ${
                        on ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container'
                      }`}
                    >
                      <span className="flex items-center justify-between text-base font-bold text-on-surface">
                        {t.name} {on && <Check className="w-4 h-4 text-primary" />}
                      </span>
                      <span className="text-[13px] text-on-surface-variant">{tableOccupancyLabel(t, tables, carts, products)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {candidates.filter(t => !t.zoneId || !zones.some(z => z.id === t.zoneId)).length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {candidates.filter(t => !t.zoneId || !zones.some(z => z.id === t.zoneId)).map(t => (
              <button key={t.id} onClick={() => toggle(t.id)} className={`text-left rounded-xl border-2 px-3 py-2 min-h-14 ${picked.includes(t.id) ? 'border-primary bg-primary-container' : 'border-outline-variant'}`}>
                <span className="block text-base font-bold">{t.name}</span>
                <span className="text-[13px] text-on-surface-variant">{tableOccupancyLabel(t, tables, carts, products)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Chuyển bàn                                                          */
/* ------------------------------------------------------------------ */

export function TransferTableDialog({ currentId, tables, zones, carts, onConfirm, onClose }: {
  currentId: string;
  tables: DiningTable[];
  zones: Zone[];
  carts: CartMap;
  onConfirm: (toId: string) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<string>('');
  const options = tables
    .filter(t => canTransferTo(tables, carts, currentId, t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));

  return (
    <Modal
      title={`Chuyển bàn - ${getGroupLabel(tables, currentId)}`}
      icon={<ArrowRightLeft className="w-4.5 h-4.5" />}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
          <button disabled={!target} onClick={() => onConfirm(target)} className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-40">
            <ArrowRightLeft className="w-4 h-4" /> Chuyển
          </button>
        </>
      }
    >
      <p className="text-sm text-on-surface-variant">Chỉ hiển thị các bàn đang trống. Toàn bộ món (và các bàn đã gộp) sẽ chuyển sang bàn mới.</p>
      {options.length === 0 ? (
        <p className="py-8 text-center text-base font-bold text-on-surface-variant">Hiện không còn bàn trống.</p>
      ) : (
        [...zones, { id: '__none', name: 'Khác', createdAt: '' } as Zone].map(z => {
          const list = options.filter(t => (z.id === '__none' ? !t.zoneId || !zones.some(zz => zz.id === t.zoneId) : t.zoneId === z.id));
          if (list.length === 0) return null;
          return (
            <div key={z.id} className="space-y-1.5">
              <p className="text-sm font-bold text-on-surface">{z.name}</p>
              <div className="grid grid-cols-3 gap-2">
                {list.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTarget(t.id)}
                    className={`rounded-xl border-2 px-2 py-2.5 min-h-12 text-base font-bold cursor-pointer transition-colors ${
                      target === t.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Tách đơn / Ghép đơn                                                 */
/* ------------------------------------------------------------------ */

export function SplitMergeOrderDialog({ currentId, initialMode, tables, zones, carts, products, onConfirm, onClose }: {
  currentId: string;
  initialMode: 'split' | 'combine';
  tables: DiningTable[];
  zones: Zone[];
  carts: CartMap;
  products: Product[];
  onConfirm: (toId: string, selection: MoveSelection) => void;
  onClose: () => void;
}) {
  const fromKey = resolvePrimaryId(tables, currentId);
  const lines: CartLine[] = carts[fromKey] || [];
  const [mode, setMode] = useState<'split' | 'combine'>(initialMode);
  const [target, setTarget] = useState<string>('');
  const [selection, setSelection] = useState<MoveSelection>({});

  const fromGroupIds = new Set(getGroupTables(tables, fromKey).map(t => t.id));
  const targets = useMemo(
    () => [
      ...[TAKEAWAY_ID, DELIVERY_ID].filter(id => id !== fromKey).map(id => ({
        id,
        name: virtualCartLabel(id),
        busy: (carts[id] || []).length > 0,
        zoneName: 'Khác',
      })),
      ...tables
        .filter(t => !fromGroupIds.has(t.id) && !t.mergedIntoId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
        .map(t => ({
          id: t.id,
          name: t.name,
          busy: getTableStats(t, tables, carts, products).isOccupied,
          zoneName: zones.find(z => z.id === t.zoneId)?.name || 'Khác',
        })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables, carts, products, zones, fromKey],
  );

  const effective = (l: CartLine) => (mode === 'combine' ? l.quantity : selection[lineKey(l)] || 0);
  const totalMoving = lines.reduce((s, l) => s + effective(l), 0);
  const moneyMoving = lines.reduce((s, l) => s + effective(l) * (products.find(p => p.id === l.productId)?.price || 0), 0);

  const setQty = (l: CartLine, q: number) =>
    setSelection(prev => ({ ...prev, [lineKey(l)]: Math.max(0, Math.min(l.quantity, q)) }));

  const submit = () => {
    const sel: MoveSelection = {};
    for (const l of lines) sel[lineKey(l)] = effective(l);
    onConfirm(target, sel);
  };

  const targetBusy = targets.find(t => t.id === target)?.busy;

  return (
    <Modal
      title={`${mode === 'split' ? 'Tách đơn' : 'Ghép đơn'} - ${getGroupLabel(tables, fromKey)}`}
      icon={mode === 'split' ? <Scissors className="w-4.5 h-4.5" /> : <Combine className="w-4.5 h-4.5" />}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="m3-btn-outlined flex-1 !min-h-12">Bỏ qua</button>
          <button
            disabled={!target || totalMoving === 0}
            onClick={submit}
            className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-40"
          >
            {mode === 'split' ? 'Tách' : 'Ghép'} {totalMoving > 0 ? `${totalMoving} món` : ''}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 bg-surface-container-high p-1 rounded-2xl gap-1">
        {([['combine', 'Ghép đơn'], ['split', 'Tách đơn']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`min-h-10 rounded-xl text-sm font-bold cursor-pointer transition-colors ${mode === k ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">
          {mode === 'split' ? 'Tách sang' : 'Ghép vào'}
        </label>
        <select value={target} onChange={e => setTarget(e.target.value)} className="m3-input">
          <option value="">Chọn bàn / loại đơn...</option>
          {targets.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.zoneName !== 'Khác' ? ` (${t.zoneName})` : ''} — {t.busy ? 'đang có đơn' : 'trống'}
            </option>
          ))}
        </select>
        {target && (
          <p className="text-sm text-on-surface-variant">
            {targetBusy ? 'Món sẽ được cộng vào đơn hiện có của đích.' : 'Đích đang trống: hệ thống sẽ mở đơn mới ở đó.'}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-outline-variant overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] bg-surface-container px-4 py-2 text-sm font-bold text-on-surface-variant uppercase tracking-wide">
          <span>Món</span>
          <span>{mode === 'split' ? 'SL tách' : 'SL ghép'}</span>
        </div>
        {lines.length === 0 && <p className="p-4 text-base text-on-surface-variant">Đơn hiện chưa có món.</p>}
        {lines.map(l => {
          const prod = products.find(p => p.id === l.productId);
          const q = effective(l);
          return (
            <div key={lineKey(l)} className="px-4 py-2.5 border-t border-outline-variant/60 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-on-surface truncate">{prod?.name || 'Món'}</p>
                <p className="text-[13px] text-on-surface-variant truncate">
                  {[l.size, l.sugarLevel && `Đường ${l.sugarLevel}`, l.iceLevel && `Đá ${l.iceLevel}`, l.note].filter(Boolean).join(' · ') || money(prod?.price || 0)}
                  {' '}· có {l.quantity}
                </p>
              </div>
              {mode === 'split' ? (
                <div className="flex items-center gap-1 border border-outline-variant rounded-full bg-surface-container-lowest shrink-0">
                  <button onClick={() => setQty(l, q - 1)} disabled={q <= 0} className="m3-icon-btn !w-9 !h-9 disabled:opacity-30"><Minus className="w-4 h-4" /></button>
                  <span className="min-w-6 text-center text-base font-bold">{q}</span>
                  <button onClick={() => setQty(l, q + 1)} disabled={q >= l.quantity} className="m3-icon-btn !w-9 !h-9 disabled:opacity-30"><Plus className="w-4 h-4" /></button>
                </div>
              ) : (
                <span className="text-base font-bold text-on-surface shrink-0">{q}</span>
              )}
            </div>
          );
        })}
        {totalMoving > 0 && (
          <div className="px-4 py-2.5 border-t border-outline-variant bg-surface-container-low flex justify-between text-base font-bold">
            <span>Chuyển</span>
            <span className="text-primary">{money(moneyMoving)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Phiếu đặt bàn                                                       */
/* ------------------------------------------------------------------ */

export function ReservationDialog({ table, onSave, onClear, onClose }: {
  table: DiningTable;
  onSave: (patch: Pick<DiningTable, 'reservationName' | 'reservationPhone' | 'reservationTime' | 'reservationNote'>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(table.reservationName || '');
  const [phone, setPhone] = useState(table.reservationPhone || '');
  const [time, setTime] = useState(table.reservationTime || '');
  const [note, setNote] = useState(table.reservationNote || '');

  return (
    <Modal
      title={`Phiếu đặt bàn - ${table.name}`}
      icon={<CalendarClock className="w-4.5 h-4.5" />}
      onClose={onClose}
      footer={
        <>
          {table.reservationName && (
            <button onClick={onClear} className="m3-btn-danger flex-1 !min-h-12">Hủy đặt bàn</button>
          )}
          <button
            disabled={!name.trim()}
            onClick={() => onSave({ reservationName: name.trim(), reservationPhone: phone.trim(), reservationTime: time, reservationNote: note.trim() })}
            className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-40"
          >
            Lưu đặt bàn
          </button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-on-surface-variant">Tên khách đặt bàn</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Anh Hải" className="m3-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-on-surface-variant">Số điện thoại</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912345678" className="m3-input font-mono" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-on-surface-variant">Giờ hẹn</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className="m3-input font-mono" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-on-surface-variant">Ghi chú</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Ví dụ: 6 người, có trẻ em" className="m3-input !py-3" />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Lịch sử báo bếp                                                     */
/* ------------------------------------------------------------------ */

export function KitchenHistoryDialog({ label, items, onClose }: { label: string; items: KitchenItem[]; onClose: () => void }) {
  const events = buildKitchenHistory(items);
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex justify-end" onClick={onClose}>
      <aside
        className="h-full w-full sm:w-[440px] bg-surface-container-lowest shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        aria-label="Lịch sử báo bếp"
      >
        <div className="px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-black tracking-wide text-on-surface">LỊCH SỬ BÁO BẾP</h3>
            <p className="text-sm text-on-surface-variant truncate">{label}</p>
          </div>
          <button onClick={onClose} className="m3-icon-btn !w-9 !h-9" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-container-low">
          {events.length === 0 ? (
            <p className="py-16 text-center text-base font-bold text-on-surface-variant">Chưa có món nào được gửi bếp.</p>
          ) : (
            events.map(ev => (
              <section key={ev.id} className="bg-surface-container-lowest px-5 py-4 mb-2.5 space-y-2">
                <p className="text-sm text-on-surface-variant">{new Date(ev.time).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-base font-bold text-on-surface">{ev.staff ? `${ev.staff} thông báo bếp` : 'Thông báo bếp'}</p>
                <div className="border-l-2 border-outline-variant pl-4 space-y-3">
                  {ev.lines.map((line, i) => (
                    <div key={i} className="space-y-0.5">
                      <p className={`text-base ${line.sign === '-' ? 'text-error font-semibold' : 'text-on-surface'}`}>
                        {line.sign} {line.quantity} {line.name}
                      </p>
                      {line.details.map((d, j) => (
                        <p key={j} className="text-sm text-on-surface-variant">{d}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thông tin đơn hàng                                                  */
/* ------------------------------------------------------------------ */

export function OrderInfoDialog({ label, openedAt, guests, itemCount, total, kitchenSent, onClose }: {
  label: string;
  openedAt?: string;
  guests: number;
  itemCount: number;
  total: number;
  kitchenSent: number;
  onClose: () => void;
}) {
  const rows: [string, string][] = [
    ['Vị trí', label],
    ['Mở lúc', openedAt ? new Date(openedAt).toLocaleString('vi-VN') : '—'],
    ['Thời gian ngồi', openedAt ? formatElapsed(openedAt) : '—'],
    ['Số khách', guests > 0 ? String(guests) : '—'],
    ['Số món', String(itemCount)],
    ['Đã gửi bếp', `${kitchenSent} lượt món`],
    ['Tạm tính', money(total)],
  ];
  return (
    <Modal title="Thông tin đơn hàng" icon={<Info className="w-4.5 h-4.5" />} onClose={onClose}>
      <div className="rounded-2xl border border-outline-variant overflow-hidden divide-y divide-outline-variant/60">
        {rows.map(([k, v]) => (
          <div key={k} className="px-4 py-3 flex justify-between gap-4 text-base">
            <span className="text-on-surface-variant font-semibold">{k}</span>
            <span className="text-on-surface font-bold text-right">{v}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
