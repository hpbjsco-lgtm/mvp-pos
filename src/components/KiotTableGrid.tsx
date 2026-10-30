/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Search, ShoppingBag, Bike, X, CalendarClock } from 'lucide-react';
import { DiningTable, Product, Zone } from '../types';
import DragScrollRow from './DragScrollRow';
import tableOutlineSvg from '../assets/icons/table-outline.svg?raw';
import {
  CartMap, DELIVERY_ID, TAKEAWAY_ID, formatElapsed, getTableStats, isVirtualCartId, resolvePrimaryId,
} from '../utils/tableOps';

type StatusFilter = 'all' | 'busy' | 'free';

interface KiotTableGridProps {
  tables: DiningTable[];
  zones: Zone[];
  carts: CartMap;
  products: Product[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const money = (n: number) => n.toLocaleString('vi-VN');

/**
 * Danh sách phòng bàn theo bố cục màn hình bán hàng KiotViet (PC): thẻ bàn vẽ dạng mặt bàn + ghế,
 * thông tin (tiền, thời gian, số món, số khách) nằm trong mặt bàn, tên bàn ở dưới.
 */
export default function KiotTableGrid({ tables, zones, carts, products, selectedId, onSelect }: KiotTableGridProps) {
  const [zoneId, setZoneId] = useState('all');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(
    () => [...tables]
      .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
      .map(t => ({ table: t, stats: getTableStats(t, tables, carts, products) })),
    [tables, carts, products],
  );

  const zoneRows = rows.filter(r => zoneId === 'all' || r.table.zoneId === zoneId);
  const busy = zoneRows.filter(r => r.stats.isOccupied).length;
  const counts = { all: zoneRows.length, busy, free: zoneRows.length - busy };

  const visible = zoneRows.filter(r => {
    if (filter === 'busy' && !r.stats.isOccupied) return false;
    if (filter === 'free' && r.stats.isOccupied) return false;
    return !query.trim() || r.table.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const showVirtual = zoneId === 'all' && !query.trim() && filter !== 'free';
  const radios: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Tất cả' }, { key: 'busy', label: 'Sử dụng' }, { key: 'free', label: 'Còn trống' },
  ];

  const virtualTile = (id: string, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const lines = carts[id] || [];
    if (filter === 'busy' && lines.length === 0) return null;
    const selected = selectedId === id;
    const total = lines.reduce((s, l) => s + (products.find(p => p.id === l.productId)?.price || 0) * l.quantity, 0);
    return (
      <button
        key={id}
        onClick={() => onSelect(id)}
        className={`rounded-xl p-2 flex flex-col items-center justify-start gap-1 cursor-pointer transition-colors ${
          selected ? 'bg-primary text-on-primary' : lines.length > 0 ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container text-on-surface-variant'
        }`}
      >
        <span className={`w-full aspect-[10/7] rounded-xl flex items-center justify-center ${selected ? 'bg-white/20' : 'bg-primary-container/60'}`}>
          <Icon className="w-12 h-12 opacity-80" />
        </span>
        <span className="text-base font-bold text-on-surface" style={selected ? { color: 'inherit' } : undefined}>{label}</span>
        {lines.length > 0 && <span className="text-sm font-bold">{money(total)}</span>}
      </button>
    );
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Khu vực + công cụ */}
      <div className="flex items-center gap-2 shrink-0">
        <DragScrollRow className="flex-1 gap-1 items-center">
          {[{ id: 'all', name: 'Tất cả' }, ...zones].map(z => (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              className={`shrink-0 min-h-10 px-4 rounded-full text-base font-bold whitespace-nowrap cursor-pointer transition-colors ${
                zoneId === z.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {z.name}
            </button>
          ))}
        </DragScrollRow>
        <button
          onClick={() => { setSearchOpen(v => !v); if (searchOpen) setQuery(''); }}
          className={`m3-icon-btn !w-10 !h-10 ${searchOpen ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container'}`}
          aria-label="Tìm bàn"
        >
          {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {searchOpen && (
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Nhập tên bàn..." className="m3-input !min-h-10 mt-2 shrink-0" />
      )}

      {/* Bộ lọc dạng radio, kèm số lượng */}
      <div className="flex items-center gap-5 py-3 shrink-0">
        {radios.map(r => (
          <label key={r.key} className="flex items-center gap-2 cursor-pointer text-base text-on-surface select-none">
            <input type="radio" name="table-filter" checked={filter === r.key} onChange={() => setFilter(r.key)} className="w-4.5 h-4.5 accent-primary" />
            {r.label} ({counts[r.key]})
          </label>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-x-3 gap-y-4 grid-cols-[repeat(auto-fill,minmax(138px,1fr))]">
          {showVirtual && virtualTile(TAKEAWAY_ID, 'Mang về', ShoppingBag)}
          {showVirtual && virtualTile(DELIVERY_ID, 'Giao đi', Bike)}

          {visible.map(({ table, stats }) => {
            const selected = !isVirtualCartId(selectedId) && stats.primaryId === resolvePrimaryId(tables, selectedId);
            const isChild = table.id !== stats.primaryId;
            const elapsed = formatElapsed(stats.openedAt, now);
            const tone = selected
              ? 'bg-primary text-on-primary'
              : stats.isMerged
                ? 'bg-tertiary-container text-tertiary'
                : stats.isOccupied
                  ? 'bg-primary-container text-primary'
                  : 'text-outline hover:bg-surface-container';
            const fill = selected ? 'transparent' : stats.isOccupied ? 'var(--color-primary-container)' : '#ffffff';

            return (
              <button
                key={table.id}
                onClick={() => onSelect(table.id)}
                className={`relative rounded-xl p-2 pb-2.5 flex flex-col items-center gap-1.5 cursor-pointer transition-colors active:scale-[0.98] ${tone}`}
              >
                <span className="relative block w-full aspect-[10/7]">
                  <span
                    aria-hidden
                    className="absolute inset-0 block [&>svg]:w-full [&>svg]:h-full"
                    style={{ ['--table-fill' as any]: fill }}
                    dangerouslySetInnerHTML={{ __html: tableOutlineSvg }}
                  />
                  {/* Thông tin nằm trong mặt bàn */}
                  <span className="absolute left-[14%] right-[14%] top-[19%] bottom-[19%] flex flex-col justify-center px-1 text-left leading-tight">
                    {stats.isOccupied ? (
                      isChild ? (
                        <span className="text-[13px] font-bold text-center">Gộp</span>
                      ) : (
                        <>
                          <span className="truncate text-[13px] font-bold">{money(stats.total)}</span>
                          <span className="truncate text-[12px] font-semibold opacity-90">
                            {[elapsed, `${stats.itemCount} món`, stats.guests > 0 ? `${stats.guests} khách` : ''].filter(Boolean).join(' · ')}
                          </span>
                        </>
                      )
                    ) : (
                      <span className="text-[12px] font-semibold text-center opacity-70">{table.capacity} chỗ</span>
                    )}
                  </span>
                </span>
                <span className={`text-base font-bold leading-tight text-center ${selected ? '' : 'text-on-surface'}`}>{table.name}</span>

                {table.reservationName && (
                  <span
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center"
                    title={`Đặt trước: ${table.reservationName}${table.reservationTime ? ` - ${table.reservationTime}` : ''}`}
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {visible.length === 0 && !showVirtual && (
          <p className="py-12 text-center text-base font-bold text-on-surface-variant">Không có bàn phù hợp</p>
        )}
      </div>
    </div>
  );
}
