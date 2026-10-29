/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { InventoryBatch, Product } from '../types';
import { stockOf, stockStatus } from '../utils/inventoryItems';

type GroupKey = 'ingredient' | 'tool' | 'dish';

interface InventoryCatalogProps {
  /** Nguyên vật liệu + công cụ dụng cụ (quản lý tồn theo lô). */
  items: Product[];
  /** Món bán + topping (chỉ xem, sửa ở Thực đơn). */
  dishes: Product[];
  batches: InventoryBatch[];
  onEdit: (item: Product) => void;
  onDelete: (item: Product) => void;
}

const GROUP_LABEL: Record<GroupKey, string> = { ingredient: 'Nguyên vật liệu', tool: 'Công cụ dụng cụ', dish: 'Món bán' };
const money = (n: number) => n.toLocaleString('vi-VN');

/** Danh mục hàng trong kho: lọc theo nhóm quản lý / nhóm hàng / thương hiệu / tồn kho / trạng thái, kèm tồn và định mức. */
export default function InventoryCatalog({ items, dishes, batches, onEdit, onDelete }: InventoryCatalogProps) {
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<GroupKey[]>([]);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'in'>('all');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');

  const rows = useMemo(() => {
    const all = [
      ...items.map(p => ({ p, group: (p.itemGroup || 'ingredient') as GroupKey })),
      ...dishes.map(p => ({ p, group: 'dish' as GroupKey })),
    ];
    return all.map(({ p, group }) => {
      const tracked = group !== 'dish' && p.trackStock !== false;
      const stock = tracked ? stockOf(p.id, batches) : 0;
      return { p, group, tracked, stock, st: tracked ? stockStatus(p, stock) : 'untracked' as const };
    });
  }, [items, dishes, batches]);

  const categories = useMemo(() => [...new Set<string>(rows.map(r => r.p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [rows]);
  const brands = useMemo(() => [...new Set<string>(rows.map(r => r.p.brand || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [rows]);
  const locations = useMemo(() => [...new Set<string>(rows.map(r => r.p.location || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [rows]);

  const q = search.trim().toLowerCase();
  const visible = rows.filter(r => {
    if (groups.length > 0 && !groups.includes(r.group)) return false;
    if (category && r.p.category !== category) return false;
    if (brand && r.p.brand !== brand) return false;
    if (location && r.p.location !== location) return false;
    const active = r.p.isActive !== false;
    if (status === 'active' && !active) return false;
    if (status === 'inactive' && active) return false;
    if (stockFilter === 'low' && !(r.tracked && (r.st === 'low' || r.st === 'out'))) return false;
    if (stockFilter === 'out' && !(r.tracked && r.st === 'out')) return false;
    if (stockFilter === 'in' && !(r.tracked && r.stock > 0)) return false;
    return !q || r.p.name.toLowerCase().includes(q) || r.p.sku.toLowerCase().includes(q);
  });

  const totalStock = visible.reduce((s, r) => s + (r.tracked ? r.stock : 0), 0);
  const toggleGroup = (g: GroupKey) => setGroups(list => (list.includes(g) ? list.filter(x => x !== g) : [...list, g]));
  const sel = 'm3-input !min-h-10 text-sm';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4 items-start">
      {/* Bộ lọc */}
      <aside className="m3-card p-4 space-y-4 lg:sticky lg:top-0">
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-on-surface">Nhóm quản lý</p>
          {(['ingredient', 'tool', 'dish'] as GroupKey[]).map(g => (
            <label key={g} className="flex items-center gap-2 text-base cursor-pointer select-none">
              <input type="checkbox" checked={groups.includes(g)} onChange={() => toggleGroup(g)} className="w-4.5 h-4.5 accent-primary" /> {GROUP_LABEL[g]}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <div className="space-y-1"><p className="text-sm font-bold text-on-surface">Nhóm hàng</p>
            <select value={category} onChange={e => setCategory(e.target.value)} className={sel}><option value="">Tất cả</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="space-y-1"><p className="text-sm font-bold text-on-surface">Thương hiệu</p>
            <select value={brand} onChange={e => setBrand(e.target.value)} className={sel}><option value="">Tất cả</option>{brands.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="space-y-1"><p className="text-sm font-bold text-on-surface">Tồn kho</p>
            <select value={stockFilter} onChange={e => setStockFilter(e.target.value as any)} className={sel}>
              <option value="all">Tất cả</option><option value="in">Còn hàng</option><option value="low">Dưới định mức</option><option value="out">Hết hàng</option></select></div>
          <div className="space-y-1"><p className="text-sm font-bold text-on-surface">Vị trí</p>
            <select value={location} onChange={e => setLocation(e.target.value)} className={sel}><option value="">Tất cả</option>{locations.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-on-surface">Trạng thái</p>
          {([['active', 'Đang kinh doanh'], ['inactive', 'Ngừng kinh doanh'], ['all', 'Tất cả']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-base cursor-pointer select-none">
              <input type="radio" name="inv-status" checked={status === k} onChange={() => setStatus(k)} className="w-4.5 h-4.5 accent-primary" /> {label}
            </label>
          ))}
        </div>
      </aside>

      {/* Danh sách */}
      <div className="space-y-3 min-w-0">
        <div className="relative">
          <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Theo mã hoặc tên hàng" className="m3-input !rounded-full pl-10" />
        </div>

        <div className="m3-card overflow-x-auto">
          <table className="m3-table min-w-[760px]">
            <thead>
              <tr><th>Mã hàng</th><th>Tên hàng</th><th>Nhóm quản lý</th><th className="text-right">Giá vốn</th><th className="text-right">Tồn kho</th><th className="text-right">Định mức tồn</th><th /></tr>
            </thead>
            <tbody>
              <tr className="bg-surface-container-low">
                <td colSpan={4} className="text-sm text-on-surface-variant">{visible.length} mặt hàng</td>
                <td className="text-right font-black">{money(totalStock)}</td><td colSpan={2} />
              </tr>
              {visible.length === 0 && <tr><td colSpan={7} className="text-center text-on-surface-variant py-10 font-semibold">Không có hàng phù hợp</td></tr>}
              {visible.map(({ p, group, tracked, stock, st }) => (
                <tr key={p.id} className={`${group !== 'dish' ? 'cursor-pointer hover:bg-surface-container-low' : ''} ${p.isActive === false ? 'opacity-50' : ''}`}
                  onClick={() => { if (group !== 'dish') onEdit(p); }}>
                  <td className="font-mono">{p.sku}</td>
                  <td className="font-semibold">
                    {p.name}
                    {(p.brand || p.location) && <span className="block text-sm font-normal text-on-surface-variant">{[p.brand, p.location && `Vị trí: ${p.location}`].filter(Boolean).join(' · ')}</span>}
                  </td>
                  <td><span className={`m3-badge ${group === 'ingredient' ? 'm3-badge-success' : group === 'tool' ? 'm3-badge-warning' : 'm3-badge-neutral'}`}>{p.isTopping ? 'Topping' : GROUP_LABEL[group]}</span></td>
                  <td className="text-right">{money(p.cost || 0)}</td>
                  <td className={`text-right font-bold ${st === 'out' ? 'text-error' : st === 'low' ? 'text-tertiary' : ''}`}>
                    {tracked ? <>{money(stock)} {p.unit ? <span className="text-sm font-normal text-on-surface-variant">{p.unit}</span> : null}</> : '—'}
                    {tracked && st === 'low' && <span className="block text-xs font-bold">Dưới định mức</span>}
                    {tracked && st === 'out' && <span className="block text-xs font-bold">Hết hàng</span>}
                  </td>
                  <td className="text-right text-on-surface-variant">{tracked ? `${money(p.minStock || 0)} < ${p.maxStock ? money(p.maxStock) : '∞'}` : '—'}</td>
                  <td className="text-right">
                    {group !== 'dish' && (
                      <button onClick={e => { e.stopPropagation(); onDelete(p); }} className="text-sm font-bold text-error hover:underline cursor-pointer">Xóa</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
