/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Link2, Search, ShoppingBag, Bike, Timer, UtensilsCrossed, Users, X } from 'lucide-react';
import { DiningTable, Product, Zone } from '../types';
import DragScrollRow from './DragScrollRow';
import tableIconSvg from '../assets/icons/table.svg?raw';
import {
  CartMap, DELIVERY_ID, TAKEAWAY_ID, formatElapsed, getGroupTables, getTableStats, isVirtualCartId, resolvePrimaryId,
} from '../utils/tableOps';

type StatusFilter = 'all' | 'busy' | 'free';

interface TableBoardProps {
  tables: DiningTable[];
  zones: Zone[];
  carts: CartMap;
  products: Product[];
  /** Id giỏ đang chọn: id bàn hoặc 'takeaway' / 'delivery'. */
  selectedId: string;
  onSelect: (id: string) => void;
}

const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** Icon bàn (SVG cục bộ, tô theo màu chữ hiện tại của thẻ). */
function TableIcon({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block shrink-0 [&>svg]:w-full [&>svg]:h-full ${className}`} dangerouslySetInnerHTML={{ __html: tableIconSvg }} />;
}

/**
 * Danh sách bàn F&B dạng lưới thẻ: mỗi thẻ cho biết ngay bàn trống / đang dùng / gộp / đặt trước,
 * kèm tổng tiền, thời gian ngồi, số món và số khách.
 */
export default function TableBoard({ tables, zones, carts, products, selectedId, onSelect }: TableBoardProps) {
  const [zoneId, setZoneId] = useState<string>('all');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Cập nhật nhãn "thời gian ngồi" mỗi 30 giây
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(
    () =>
      [...tables]
        .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
        .map(t => ({ table: t, stats: getTableStats(t, tables, carts, products) })),
    [tables, carts, products],
  );

  const zoneRows = rows.filter(r => zoneId === 'all' || r.table.zoneId === zoneId);
  const busyCount = zoneRows.filter(r => r.stats.isOccupied).length;
  const counts = { all: zoneRows.length, busy: busyCount, free: zoneRows.length - busyCount };

  const visible = zoneRows.filter(r => {
    if (filter === 'busy' && !r.stats.isOccupied) return false;
    if (filter === 'free' && r.stats.isOccupied) return false;
    return !query.trim() || r.table.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'busy', label: 'Đang dùng' },
    { key: 'free', label: 'Còn trống' },
  ];

  return (
    <div id="table-board" className="space-y-3">
      {/* Khu vực + tìm kiếm */}
      <div className="flex items-center gap-2">
        <DragScrollRow className="flex-1 gap-2">
          {[{ id: 'all', name: 'Tất cả khu vực' }, ...zones].map(z => (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              className={`m3-chip !rounded-full whitespace-nowrap ${zoneId === z.id ? '!bg-primary !border-primary !text-on-primary' : ''}`}
            >
              {z.name}
            </button>
          ))}
        </DragScrollRow>
        <button
          onClick={() => { setSearchOpen(v => !v); if (searchOpen) setQuery(''); }}
          className={`m3-icon-btn !w-10 !h-10 ${searchOpen ? 'bg-primary-container text-on-primary-container' : ''}`}
          aria-label="Tìm bàn"
        >
          {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {searchOpen && (
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nhập tên bàn..."
          className="m3-input !min-h-11"
        />
      )}

      {/* Bộ lọc trạng thái dạng thanh phân đoạn, kèm số lượng */}
      <div className="grid grid-cols-3 bg-surface-container-high p-1 rounded-2xl gap-1">
        {filterTabs.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-10 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
              filter === f.key ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {f.label} <span className="opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {/* Chú giải màu */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-on-surface-variant font-semibold">
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-surface-container-lowest border border-outline" /> Trống</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-secondary" /> Đang dùng</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-tertiary" /> Gộp bàn</span>
        <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-tertiary" /> Đặt trước</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3">
        {/* Giỏ ảo: Mang về / Giao đi */}
        {zoneId === 'all' && !query.trim() && filter !== 'free' && [
          { id: TAKEAWAY_ID, label: 'Mang về', Icon: ShoppingBag },
          { id: DELIVERY_ID, label: 'Giao đi', Icon: Bike },
        ].map(({ id, label, Icon }) => {
          const lines = carts[id] || [];
          if (filter === 'busy' && lines.length === 0) return null;
          const total = lines.reduce((s, l) => s + (products.find(p => p.id === l.productId)?.price || 0) * l.quantity, 0);
          const qty = lines.reduce((s, l) => s + l.quantity, 0);
          const selected = selectedId === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`text-left rounded-2xl border-2 p-3 min-h-[108px] flex flex-col justify-between cursor-pointer transition-all active:scale-[0.98] ${
                selected
                  ? 'bg-primary border-primary text-on-primary shadow-md'
                  : lines.length > 0
                    ? 'bg-secondary-container border-secondary text-on-secondary-container'
                    : 'bg-surface-container-lowest border-dashed border-outline-variant text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="flex items-center gap-1.5 text-base font-black">
                <Icon className="w-5 h-5" /> {label}
              </span>
              {lines.length > 0 ? (
                <span className="space-y-0.5">
                  <span className="block text-lg font-black leading-tight">{money(total)}</span>
                  <span className="text-[13px] font-bold opacity-80 flex items-center gap-1"><UtensilsCrossed className="w-3.5 h-3.5" /> {qty} món</span>
                </span>
              ) : (
                <span className="text-[13px] font-semibold opacity-70">Chạm để tạo đơn</span>
              )}
            </button>
          );
        })}

        {visible.map(({ table, stats }) => {
          const selected = !isVirtualCartId(selectedId) && stats.primaryId === resolvePrimaryId(tables, selectedId);
          const isChild = table.id !== stats.primaryId;
          const groupLen = getGroupTables(tables, table.id).length;
          const hasReservation = !!table.reservationName;
          const elapsed = formatElapsed(stats.openedAt, now);

          const tone = selected
            ? 'bg-primary border-primary text-on-primary shadow-md'
            : stats.isMerged
              ? 'bg-tertiary-container border-tertiary text-on-tertiary-container'
              : stats.isOccupied
                ? 'bg-secondary-container border-secondary text-on-secondary-container'
                : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container';

          return (
            <button
              key={table.id}
              onClick={() => onSelect(table.id)}
              className={`relative text-left rounded-2xl border-2 p-3 min-h-[108px] flex flex-col justify-between cursor-pointer transition-all active:scale-[0.98] ${tone}`}
            >
              <span className="flex items-start justify-between gap-1">
                <span className="flex items-center gap-1.5 text-base font-black leading-tight min-w-0">
                  <TableIcon className="w-7 h-7 opacity-90" />
                  <span className="line-clamp-2 break-words">{table.name}</span>
                </span>
                {stats.isMerged && <Link2 className="w-4 h-4 shrink-0" aria-label="Bàn gộp" />}
              </span>

              {stats.isOccupied ? (
                isChild ? (
                  <span className="text-[13px] font-bold opacity-90">
                    Gộp vào {tables.find(t => t.id === stats.primaryId)?.name}
                  </span>
                ) : (
                  <span className="space-y-0.5">
                    <span className="block text-lg font-black leading-tight">{money(stats.total)}</span>
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] font-bold opacity-85">
                      {elapsed && <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{elapsed}</span>}
                      <span className="flex items-center gap-1"><UtensilsCrossed className="w-3.5 h-3.5" />{stats.itemCount}</span>
                      {stats.guests > 0 && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{stats.guests}</span>}
                      {groupLen > 1 && <span>{groupLen} bàn</span>}
                    </span>
                  </span>
                )
              ) : (
                <span className="text-[13px] font-semibold text-on-surface-variant flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {table.capacity} chỗ
                </span>
              )}

              {hasReservation && (
                <span
                  className={`absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[12px] font-bold flex items-center gap-1 shadow-sm ${
                    selected ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-tertiary text-on-tertiary'
                  }`}
                  title={`${table.reservationName}${table.reservationTime ? ` - ${table.reservationTime}` : ''}`}
                >
                  <CalendarClock className="w-3 h-3" /> {table.reservationTime || 'Đặt'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="py-12 text-center text-on-surface-variant">
          <TableIcon className="w-10 h-10 mx-auto mb-2 text-outline-variant" />
          <p className="text-base font-bold">Không có bàn phù hợp</p>
          <p className="text-sm">Thử đổi khu vực hoặc bộ lọc trạng thái.</p>
        </div>
      )}
    </div>
  );
}
