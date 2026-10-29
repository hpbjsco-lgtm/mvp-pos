/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Product, UnitConversion } from '../types';
import { fileToResizedDataUrl } from '../utils/imageUpload';
import { nextItemCode } from '../utils/inventoryItems';
import UnitPickerDialog from './UnitPickerDialog';

interface IngredientDialogProps {
  /** Hàng đang sửa (bỏ trống = tạo mới). */
  item?: Product;
  group: 'ingredient' | 'tool';
  /** Toàn bộ nguyên vật liệu / công cụ hiện có (gợi ý nhóm, thương hiệu, sinh mã). */
  allItems: Product[];
  /** Tồn kho hiện tại (khi sửa). */
  currentStock?: number;
  /** Lưu; openingStock > 0 nghĩa là tạo kèm lô tồn đầu kỳ. */
  onSave: (item: Product, openingStock: number) => void;
  onClose: () => void;
}

/** Tạo / sửa nguyên vật liệu hoặc công cụ dụng cụ: thông tin, giá vốn, tồn kho & định mức, đơn vị tính quy đổi, vị trí. */
export default function IngredientDialog({ item, group, allItems, currentStock = 0, onSave, onClose }: IngredientDialogProps) {
  const label = group === 'tool' ? 'công cụ dụng cụ' : 'nguyên vật liệu';
  const categories = useMemo(() => [...new Set<string>(allItems.map(i => i.category).filter(Boolean))], [allItems]);
  const brands = useMemo(() => [...new Set<string>(allItems.map(i => i.brand || '').filter(Boolean))], [allItems]);

  const [sku, setSku] = useState(item?.sku || '');
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || '');
  const [brand, setBrand] = useState(item?.brand || '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || '');
  const [cost, setCost] = useState<number>(item?.cost ?? 0);
  const [track, setTrack] = useState(item?.trackStock ?? true);
  const [openStock, setOpenStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(item?.minStock ?? 0);
  const [maxStock, setMaxStock] = useState<number>(item?.maxStock ?? 0);
  const [unit, setUnit] = useState(item?.unit || '');
  const [conversions, setConversions] = useState<UnitConversion[]>(item?.unitConversions || []);
  const [location, setLocation] = useState(item?.location || '');
  const [weight, setWeight] = useState(item?.weight || '');
  const [note, setNote] = useState(item?.note || '');
  const [active, setActive] = useState(item?.isActive ?? true);
  const [moreOpen, setMoreOpen] = useState(!!(item?.location || item?.weight));
  const [unitOpen, setUnitOpen] = useState(false);
  const [error, setError] = useState('');

  const num = (v: string) => parseFloat(v.replace(/[^\d.]/g, '')) || 0;

  const save = (andNew: boolean) => {
    if (!name.trim()) { setError('Vui lòng nhập tên hàng.'); return; }
    if (track && maxStock > 0 && minStock > maxStock) { setError('Định mức tồn thấp nhất không được lớn hơn định mức cao nhất.'); return; }
    const prefix = group === 'tool' ? 'CC' : 'NL';
    const product: Product = {
      ...(item || { id: `ING-${Date.now()}`, price: 0, isAvailable: true, createdAt: new Date().toISOString() }),
      sku: sku.trim() || item?.sku || nextItemCode(allItems, prefix),
      name: name.trim(),
      cost: Math.max(0, cost),
      category: category.trim() || (group === 'tool' ? 'Công cụ' : 'Khác'),
      brand: brand.trim() || undefined,
      imageUrl: imageUrl || undefined,
      unit: unit || undefined,
      unitConversions: conversions.length > 0 ? conversions : undefined,
      itemGroup: group,
      trackStock: track,
      minStock: track ? minStock || undefined : undefined,
      maxStock: track ? maxStock || undefined : undefined,
      location: location.trim() || undefined,
      weight: weight.trim() || undefined,
      note: note.trim() || undefined,
      isActive: active,
    };
    onSave(product, !item && track ? openStock : 0);
    if (andNew) {
      setSku(''); setName(''); setImageUrl(''); setCost(0); setOpenStock(0); setNote(''); setError('');
    } else onClose();
  };

  const pickImage = async (file?: File | null) => {
    if (!file) return;
    try { setImageUrl(await fileToResizedDataUrl(file)); setError(''); } catch (e: any) { setError(e?.message || 'Không đọc được ảnh.'); }
  };

  const field = 'space-y-1';
  const lab = 'text-sm font-semibold text-on-surface-variant';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant shrink-0">
          <h3 className="text-xl font-black text-on-surface">{item ? `Sửa ${label}` : `Tạo ${label}`}</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
            <div className="space-y-3">
              <div className={field}><label className={lab}>Mã hàng</label>
                <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Tự động" className="m3-input font-mono" /></div>
              <div className={field}><label className={lab}>Tên hàng</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={group === 'tool' ? 'Ví dụ: Ly nhựa 500ml' : 'Ví dụ: Cà phê bột Robusta'} className="m3-input" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className={field}><label className={lab}>Nhóm hàng</label>
                  <input list="inv-categories" value={category} onChange={e => setCategory(e.target.value)} placeholder="Chọn hoặc nhập nhóm mới" className="m3-input" />
                  <datalist id="inv-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
                <div className={field}><label className={lab}>Thương hiệu</label>
                  <input list="inv-brands" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Chọn hoặc nhập mới" className="m3-input" />
                  <datalist id="inv-brands">{brands.map(b => <option key={b} value={b} />)}</datalist></div>
              </div>
            </div>
            <label className="relative h-36 sm:h-auto rounded-xl border-2 border-dashed border-outline-variant bg-surface-container flex items-center justify-center text-center text-sm font-semibold text-on-surface-variant cursor-pointer overflow-hidden">
              {imageUrl ? <img src={imageUrl} alt="Ảnh hàng" className="absolute inset-0 w-full h-full object-cover" /> : <span className="px-2">Thêm ảnh<br /><span className="font-normal">tối đa 2 MB</span></span>}
              <input type="file" accept="image/*" className="hidden" onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>

          <div className="rounded-xl border border-outline-variant p-4 space-y-2">
            <p className="text-base font-bold text-on-surface">Giá &amp; Thuế</p>
            <div className={field + ' max-w-[14rem]'}><label className={lab}>Giá vốn (đ)</label>
              <input type="text" inputMode="numeric" value={cost ? cost.toLocaleString('vi-VN') : ''} placeholder="0"
                onChange={e => setCost(num(e.target.value))} className="m3-input text-right font-bold" /></div>
          </div>

          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span><span className="block text-base font-bold text-on-surface">Quản lý tồn tại Kho hàng</span>
                <span className="block text-sm text-on-surface-variant">Theo dõi tồn kho của hàng khi nhập và xuất</span></span>
              <input type="checkbox" checked={track} onChange={e => setTrack(e.target.checked)} className="w-6 h-6 accent-primary mt-1" />
            </label>
            {track && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={field}><label className={lab}>{item ? 'Tồn kho hiện tại' : 'Tồn kho ban đầu'}</label>
                  {item ? <p className="m3-input flex items-center justify-end font-bold bg-surface-container">{currentStock.toLocaleString('vi-VN')}</p>
                    : <input type="number" min={0} step="any" value={openStock || ''} placeholder="0" onChange={e => setOpenStock(parseFloat(e.target.value) || 0)} className="m3-input text-right font-bold" />}</div>
                <div className={field}><label className={lab}>Định mức tồn thấp nhất</label>
                  <input type="number" min={0} step="any" value={minStock || ''} placeholder="0" onChange={e => setMinStock(parseFloat(e.target.value) || 0)} className="m3-input text-right" /></div>
                <div className={field}><label className={lab}>Định mức tồn cao nhất</label>
                  <input type="number" min={0} step="any" value={maxStock || ''} placeholder="Không giới hạn" onChange={e => setMaxStock(parseFloat(e.target.value) || 0)} className="m3-input text-right" /></div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-outline-variant p-4 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-bold text-on-surface">Quản lý theo đơn vị tính</p>
                <p className="text-sm text-on-surface-variant">Chọn đơn vị cơ bản và các đơn vị quy đổi (vd 1 Thùng = 24 Chai) để nhập / xuất theo đơn vị lớn.</p>
              </div>
              <button onClick={() => setUnitOpen(true)} className="m3-btn-outlined !min-h-10 text-sm shrink-0">Thiết lập</button>
            </div>
            {(unit || conversions.length > 0) && (
              <p className="text-sm text-on-surface">Đơn vị cơ bản: <strong>{unit || '—'}</strong>{conversions.map(c => ` · 1 ${c.name} = ${c.ratio} ${unit}`).join('')}</p>
            )}
          </div>

          <div className="rounded-xl border border-outline-variant">
            <button onClick={() => setMoreOpen(v => !v)} className="w-full px-4 py-3 flex items-center justify-between text-base font-bold text-on-surface cursor-pointer">
              Vị trí, trọng lượng <span className="text-primary text-sm">{moreOpen ? 'Thu gọn' : 'Mở rộng'}</span>
            </button>
            {moreOpen && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <div className={field}><label className={lab}>Vị trí</label><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Kệ A2, kho lạnh..." className="m3-input" /></div>
                <div className={field}><label className={lab}>Trọng lượng</label><input value={weight} onChange={e => setWeight(e.target.value)} placeholder="vd 500g" className="m3-input" /></div>
              </div>
            )}
          </div>

          <div className={field}><label className={lab}>Mô tả chi tiết</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="m3-input !py-3" /></div>
        </div>

        <div className="px-6 py-3.5 border-t border-outline-variant shrink-0 flex flex-wrap items-center gap-3">
          {item && (
            <label className="flex items-center gap-2 text-base cursor-pointer mr-auto select-none">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-5 h-5 accent-primary" /> Đang kinh doanh
            </label>
          )}
          <span className="flex-1" />
          <button onClick={onClose} className="m3-btn-text !min-h-12">Hủy</button>
          {!item && <button onClick={() => save(true)} className="m3-btn-outlined !min-h-12">Lưu &amp; Tạo thêm</button>}
          <button onClick={() => save(false)} className="m3-btn-filled !min-h-12">Lưu</button>
        </div>
      </div>

      {unitOpen && (
        <UnitPickerDialog unit={unit} conversions={conversions} onClose={() => setUnitOpen(false)}
          onSave={(u, c) => { setUnit(u); setConversions(c); setUnitOpen(false); }} />
      )}
    </div>
  );
}
