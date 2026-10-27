/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search, Trash2, X } from 'lucide-react';
import { Product } from '../types';
import { fileToResizedDataUrl } from '../utils/imageUpload';

interface ToppingDialogProps {
  /** Topping đang sửa (bỏ trống = tạo mới). */
  topping?: Product;
  /** Toàn bộ sản phẩm (để chọn món gắn topping). */
  products: Product[];
  onSave: (topping: Product) => void;
  onClose: () => void;
}

const KINDS: { id: NonNullable<Product['toppingKind']>; title: string; desc: string; example: string }[] = [
  { id: 'prepared', title: 'Topping chế biến', desc: 'Được chế biến từ nguyên liệu khi khách gọi món, trừ tồn trực tiếp vào nguyên liệu.', example: 'Cà phê, trà sữa, đồ ăn tại chỗ.' },
  { id: 'regular', title: 'Topping thường', desc: 'Được bán nguyên chiếc, đóng gói sẵn hoặc mua về bán lại.', example: 'Nước ngọt lon, bia chai, snack đóng gói.' },
  { id: 'made', title: 'Topping sản xuất', desc: 'Được làm trước rồi lưu kho, sau đó bán dần hoặc dùng cho món chế biến.', example: 'Bánh ngọt làm sẵn, cốt cà phê.' },
];

/** Tạo / sửa topping: thông tin, giá, loại topping, và gắn vào các món (theo từng món hoặc theo nhóm). */
export default function ToppingDialog({ topping, products, onSave, onClose }: ToppingDialogProps) {
  const dishes = useMemo(() => products.filter(p => !p.isTopping), [products]);
  const categories = useMemo(() => Array.from(new Set<string>(dishes.map(d => d.category))).sort((a, b) => a.localeCompare(b, 'vi')), [dishes]);
  const existingGroups = useMemo(() => Array.from(new Set<string>(products.filter(p => p.isTopping).map(p => p.category))), [products]);

  const [name, setName] = useState(topping?.name || '');
  const [category, setCategory] = useState(topping?.category || 'Topping');
  const [price, setPrice] = useState<number>(topping?.price ?? 5000);
  const [kind, setKind] = useState<NonNullable<Product['toppingKind']>>(topping?.toppingKind || 'prepared');
  const [allowSale, setAllowSale] = useState(topping?.isAvailable ?? true);
  const [imageUrl, setImageUrl] = useState(topping?.imageUrl || '');
  const [attachOn, setAttachOn] = useState(topping ? (topping.toppingFor || []).length > 0 : true);
  const [attached, setAttached] = useState<string[]>(topping?.toppingFor || []);
  const [search, setSearch] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  const [error, setError] = useState('');

  const results = search.trim()
    ? dishes.filter(d => !attached.includes(d.id) && (d.name.toLowerCase().includes(search.toLowerCase()) || d.sku.toLowerCase().includes(search.toLowerCase()))).slice(0, 6)
    : [];

  const save = (andNew: boolean) => {
    if (!name.trim()) { setError('Vui lòng nhập tên topping.'); return; }
    const product: Product = {
      id: topping?.id || `TP-${Date.now()}`,
      sku: topping?.sku || `TP-${Date.now().toString().slice(-6)}`,
      name: name.trim(),
      price: Math.max(0, price || 0),
      cost: topping?.cost || 0,
      category: category.trim() || 'Topping',
      imageUrl: imageUrl || undefined,
      isAvailable: allowSale,
      isTopping: true,
      toppingKind: kind,
      toppingFor: attachOn ? attached : [],
      createdAt: topping?.createdAt || new Date().toISOString(),
    };
    onSave(product);
    if (andNew) {
      setName(''); setPrice(5000); setImageUrl(''); setAttached(attachOn ? attached : []); setError('');
    } else onClose();
  };

  const pickImage = async (file?: File | null) => {
    if (!file) return;
    try { setImageUrl(await fileToResizedDataUrl(file)); setError(''); } catch (e: any) { setError(e?.message || 'Không đọc được ảnh.'); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant shrink-0">
          <h3 className="text-xl font-black text-on-surface">{topping ? 'Sửa topping' : 'Tạo topping'}</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Tên topping</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Trân châu trắng" className="m3-input" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Nhóm món</label>
                  <input list="topping-groups" value={category} onChange={e => setCategory(e.target.value)} className="m3-input" />
                  <datalist id="topping-groups">{[...new Set(['Topping', ...existingGroups])].map(g => <option key={g} value={g} />)}</datalist>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Giá bán (đ)</label>
                  <input type="text" inputMode="numeric" value={price ? price.toLocaleString('vi-VN') : ''} placeholder="0"
                    onChange={e => setPrice(parseInt(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0)} className="m3-input text-right font-bold" />
                </div>
              </div>
            </div>
            <label className="relative h-36 sm:h-auto rounded-xl border-2 border-dashed border-outline-variant bg-surface-container flex items-center justify-center text-center text-sm font-semibold text-on-surface-variant cursor-pointer overflow-hidden">
              {imageUrl ? <img src={imageUrl} alt="Ảnh topping" className="absolute inset-0 w-full h-full object-cover" /> : <span className="px-2">Thêm ảnh<br /><span className="font-normal">tối đa 2 MB</span></span>}
              <input type="file" accept="image/*" className="hidden" onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>

          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <div>
              <p className="text-base font-bold text-on-surface">Chọn loại topping</p>
              <p className="text-sm text-on-surface-variant">Chọn cách topping này được bán và trừ tồn kho</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {KINDS.map(k => (
                <button key={k.id} type="button" onClick={() => setKind(k.id)}
                  className={`text-left rounded-xl border-2 p-3 space-y-1.5 cursor-pointer transition-colors ${kind === k.id ? 'border-primary bg-primary-container/50' : 'border-outline-variant hover:bg-surface-container'}`}>
                  <span className="flex items-center justify-between font-bold text-on-surface">{k.title}
                    <span className={`w-4.5 h-4.5 rounded-full border-2 ${kind === k.id ? 'border-primary bg-primary' : 'border-outline'}`} />
                  </span>
                  <span className="block text-sm text-on-surface-variant">{k.desc}</span>
                  <span className="block text-sm text-on-surface-variant"><strong>Ví dụ:</strong> {k.example}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span>
                <span className="block text-base font-bold text-on-surface">Gắn món</span>
                <span className="block text-sm text-on-surface-variant">Chọn các món được phép chọn topping này</span>
              </span>
              <input type="checkbox" checked={attachOn} onChange={e => setAttachOn(e.target.checked)} className="w-6 h-6 accent-primary mt-1" />
            </label>

            {attachOn && (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm món" className="m3-input !min-h-11 pl-10" />
                    {results.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
                        {results.map(d => (
                          <button key={d.id} type="button" onClick={() => { setAttached(a => [...a, d.id]); setSearch(''); }}
                            className="w-full text-left px-3.5 py-2 hover:bg-surface-container text-sm cursor-pointer flex justify-between gap-3">
                            <span className="font-semibold">{d.name}</span><span className="text-on-surface-variant">{d.price.toLocaleString('vi-VN')}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { setPickedGroups([]); setGroupOpen(true); }} className="m3-btn-outlined !min-h-11 text-sm shrink-0">Chọn theo nhóm</button>
                </div>

                <div className="rounded-xl border border-outline-variant overflow-hidden">
                  <div className="grid grid-cols-[6rem_1fr_6rem_2.5rem] bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant uppercase">
                    <span>Mã món</span><span>Tên món</span><span className="text-right">Giá bán</span><span />
                  </div>
                  {attached.length === 0 && <p className="px-3 py-5 text-center text-sm text-on-surface-variant">Chưa có món</p>}
                  {attached.map(id => {
                    const d = dishes.find(x => x.id === id);
                    if (!d) return null;
                    return (
                      <div key={id} className="grid grid-cols-[6rem_1fr_6rem_2.5rem] items-center px-3 py-1.5 border-t border-outline-variant/60 text-sm">
                        <span className="font-mono text-on-surface-variant truncate">{d.sku}</span>
                        <span className="font-semibold text-on-surface truncate">{d.name}</span>
                        <span className="text-right">{d.price.toLocaleString('vi-VN')}</span>
                        <button type="button" onClick={() => setAttached(a => a.filter(x => x !== id))} className="m3-icon-btn !w-8 !h-8 hover:text-error" aria-label="Bỏ món"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-outline-variant shrink-0 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-base cursor-pointer mr-auto select-none">
            <input type="checkbox" checked={allowSale} onChange={e => setAllowSale(e.target.checked)} className="w-5 h-5 accent-primary" /> Cho phép bán
          </label>
          <button onClick={onClose} className="m3-btn-text !min-h-12">Bỏ qua</button>
          {!topping && <button onClick={() => save(true)} className="m3-btn-outlined !min-h-12">Lưu &amp; Tạo thêm</button>}
          <button onClick={() => save(false)} className="m3-btn-filled !min-h-12">Lưu</button>
        </div>
      </div>

      {groupOpen && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setGroupOpen(false); }}>
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold">Chọn nhóm món</h4>
              <button onClick={() => setGroupOpen(false)} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-outline-variant/60 border border-outline-variant rounded-xl">
              {categories.map(c => (
                <label key={c} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-surface-container text-base">
                  <input type="checkbox" checked={pickedGroups.includes(c)} onChange={e => setPickedGroups(g => e.target.checked ? [...g, c] : g.filter(x => x !== c))} className="w-5 h-5 accent-primary" />
                  <span className="flex-1">{c}</span>
                  <span className="text-sm text-on-surface-variant">{dishes.filter(d => d.category === c).length} món</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setGroupOpen(false)} className="m3-btn-text !min-h-11">Bỏ qua</button>
              <button
                onClick={() => {
                  const ids = dishes.filter(d => pickedGroups.includes(d.category)).map(d => d.id);
                  setAttached(a => [...new Set([...a, ...ids])]);
                  setGroupOpen(false);
                }}
                className="m3-btn-filled !min-h-11"
              >Xong</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
