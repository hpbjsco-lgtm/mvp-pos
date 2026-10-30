/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { Product, ProductSize, RecipeItem } from '../types';
import { fileToResizedDataUrl } from '../utils/imageUpload';
import { cleanSizes, hasSizes } from '../utils/sizes';
import { unitChoices } from '../utils/inventoryItems';
import { isDrinkProduct, recipeBaseQty, recipeCost } from '../utils/recipes';

interface DishDialogProps {
  /** Món đang sửa (bỏ trống = tạo mới). */
  dish?: Product;
  /** Toàn bộ sản phẩm trong thực đơn (để lấy nhóm món, danh sách topping). */
  menuProducts: Product[];
  /** Nguyên vật liệu trong kho (thành phần công thức). */
  ingredients: Product[];
  /** Lưu món + danh sách topping được gắn cho món này. */
  onSave: (dish: Product, toppingIds: string[]) => void;
  onClose: () => void;
}

const MENU_TYPES: { id: NonNullable<Product['menuType']>; label: string }[] = [
  { id: 'food', label: 'Đồ ăn' }, { id: 'drink', label: 'Đồ uống' }, { id: 'service', label: 'Dịch vụ' }, { id: 'other', label: 'Khác' },
];

const money = (n: number) => Math.round(n).toLocaleString('vi-VN');

/**
 * Tạo / sửa món (F&B): thông tin, giá (một giá hoặc nhiều size), loại món (chế biến / thường),
 * thành phần nguyên liệu (trừ kho khi bán + tự tính giá vốn, lợi nhuận) và gắn topping.
 */
export default function DishDialog({ dish, menuProducts, ingredients, onSave, onClose }: DishDialogProps) {
  const dishes = useMemo(() => menuProducts.filter(p => !p.isTopping), [menuProducts]);
  const toppings = useMemo(() => menuProducts.filter(p => p.isTopping), [menuProducts]);
  const categories = useMemo(() => [...new Set<string>(dishes.map(d => d.category).filter(Boolean))], [dishes]);
  const stockItems = useMemo(() => ingredients.filter(i => (i.itemGroup || 'ingredient') === 'ingredient' && i.isActive !== false), [ingredients]);

  const [name, setName] = useState(dish?.name || '');
  const [category, setCategory] = useState(dish?.category || '');
  const [menuType, setMenuType] = useState<NonNullable<Product['menuType']>>(dish?.menuType || (isDrinkProduct(dish) ? 'drink' : 'food'));
  const [sku, setSku] = useState(dish?.sku || '');
  const [imageUrl, setImageUrl] = useState(dish?.imageUrl || '');
  const [price, setPrice] = useState<number>(dish?.price ?? 0);
  const [sizesOn, setSizesOn] = useState(hasSizes(dish));
  const [sizes, setSizes] = useState<ProductSize[]>(hasSizes(dish) ? dish!.sizes!.map(s => ({ ...s })) : []);
  const [kind, setKind] = useState<NonNullable<Product['dishKind']>>(dish?.dishKind || 'prepared');
  const [recipe, setRecipe] = useState<RecipeItem[]>(dish?.recipe || []);
  const [search, setSearch] = useState('');
  const [toppingOn, setToppingOn] = useState(!!dish && toppings.some(t => (t.toppingFor || []).includes(dish.id)));
  const [toppingIds, setToppingIds] = useState<string[]>(dish ? toppings.filter(t => (t.toppingFor || []).includes(dish.id)).map(t => t.id) : []);
  const [allowSale, setAllowSale] = useState(dish?.isAvailable ?? true);
  const [showOnPos, setShowOnPos] = useState(dish?.isActive !== false);
  const [error, setError] = useState('');

  const basePrice = sizesOn && sizes[0] ? sizes[0].price : price;
  const cost = kind === 'prepared' && recipe.length > 0 ? recipeCost(recipe, ingredients) : dish?.cost || 0;
  const hasCost = kind === 'prepared' && recipe.length > 0;
  const profit = basePrice - cost;

  const results = search.trim()
    ? stockItems.filter(i => !recipe.some(r => r.ingredientId === i.id) && (i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()))).slice(0, 6)
    : [];

  const toggleSizes = () => {
    if (!sizesOn && sizes.length === 0) setSizes([{ name: 'Nhỏ', price }, { name: 'Lớn', price: price + 10000 }]);
    setSizesOn(v => !v);
  };

  const save = (andNew: boolean) => {
    if (!name.trim()) { setError('Vui lòng nhập tên món.'); return; }
    const cleaned = sizesOn ? cleanSizes(sizes) : [];
    if (sizesOn && cleaned.length === 0) { setError('Vui lòng nhập ít nhất một size (tên và giá).'); return; }
    if (kind === 'prepared' && recipe.some(r => !(r.quantity > 0))) { setError('Số lượng của mỗi nguyên liệu phải lớn hơn 0.'); return; }

    const product: Product = {
      ...(dish || { id: `P-${Date.now()}`, createdAt: new Date().toISOString() }),
      sku: sku.trim() || dish?.sku || `MN-${Date.now().toString().slice(-6)}`,
      name: name.trim(),
      category: category.trim() || (menuType === 'drink' ? 'Đồ uống' : menuType === 'food' ? 'Món ăn' : 'Khác'),
      menuType,
      price: cleaned.length > 0 ? cleaned[0].price : Math.max(0, price),
      cost: hasCost ? cost : dish?.cost || 0,
      imageUrl: imageUrl || undefined,
      sizes: cleaned.length > 0 ? cleaned : undefined,
      dishKind: kind,
      recipe: kind === 'prepared' && recipe.length > 0 ? recipe : undefined,
      isAvailable: allowSale,
      isActive: showOnPos,
    };
    onSave(product, toppingOn ? toppingIds : []);
    if (andNew) {
      setName(''); setSku(''); setImageUrl(''); setPrice(0); setSizesOn(false); setSizes([]); setRecipe([]); setToppingIds([]); setToppingOn(false); setError('');
    } else onClose();
  };

  const pickImage = async (file?: File | null) => {
    if (!file) return;
    try { setImageUrl(await fileToResizedDataUrl(file)); setError(''); } catch (e: any) { setError(e?.message || 'Không đọc được ảnh.'); }
  };

  const lab = 'text-sm font-semibold text-on-surface-variant';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-4xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant shrink-0">
          <h3 className="text-xl font-black text-on-surface">{dish ? 'Sửa món' : 'Tạo món'}</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
            <div className="space-y-3">
              <div className="space-y-1"><label className={lab}>Tên món</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Cafe sữa đá" className="m3-input" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className={lab}>Nhóm món</label>
                  <input list="dish-categories" value={category} onChange={e => setCategory(e.target.value)} placeholder="Chọn hoặc nhập nhóm mới" className="m3-input" />
                  <datalist id="dish-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
                <div className="space-y-1"><label className={lab}>Loại thực đơn</label>
                  <select value={menuType} onChange={e => setMenuType(e.target.value as any)} className="m3-input">
                    {MENU_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
              </div>
              <div className="space-y-1 max-w-xs"><label className={lab}>Mã món</label>
                <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Tự động" className="m3-input font-mono" /></div>
            </div>
            <label className="relative h-36 sm:h-auto rounded-xl border-2 border-dashed border-outline-variant bg-surface-container flex items-center justify-center text-center text-sm font-semibold text-on-surface-variant cursor-pointer overflow-hidden">
              {imageUrl ? <img src={imageUrl} alt="Ảnh món" className="absolute inset-0 w-full h-full object-cover" /> : <span className="px-2">Thêm ảnh<br /><span className="font-normal">tối đa 2 MB</span></span>}
              <input type="file" accept="image/*" className="hidden" onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>

          {/* Giá & thuế */}
          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-bold text-on-surface">Giá &amp; Thuế</p>
              <p className="text-sm text-on-surface-variant">
                Lợi nhuận ròng dự kiến: <strong>{hasCost || basePrice > 0 ? money(profit) : '-'}</strong> · Tỷ lệ giá vốn/giá bán: <strong>{hasCost && basePrice > 0 ? `${Math.round((cost / basePrice) * 100)}%` : '-'}</strong>
              </p>
            </div>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1">
                <label className={lab}>{sizesOn ? 'Giá bán (theo size)' : 'Giá bán (đ)'}</label>
                <input type="text" inputMode="numeric" disabled={sizesOn} value={basePrice ? money(basePrice) : ''} placeholder="0"
                  onChange={e => setPrice(parseInt(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0)} className="m3-input w-44 text-right font-bold" />
              </div>
              <button type="button" onClick={toggleSizes} className="min-h-11 px-3 text-sm font-bold text-primary underline underline-offset-2 cursor-pointer">
                {sizesOn ? 'Dùng một mức giá' : 'Thiết lập giá (nhiều size)'}
              </button>
            </div>
            {sizesOn && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_8rem_2.5rem] gap-2 text-xs font-bold uppercase text-on-surface-variant px-1"><span>Tên size</span><span className="text-right">Giá bán</span><span /></div>
                {sizes.map((sz, i) => (
                  <div key={i} className="grid grid-cols-[1fr_8rem_2.5rem] gap-2 items-center">
                    <input value={sz.name} onChange={e => setSizes(l => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={i === 0 ? 'vd: Nhỏ (mặc định)' : 'vd: Lớn'} className="m3-input !min-h-11" />
                    <input type="text" inputMode="numeric" value={sz.price ? money(sz.price) : ''} placeholder="0"
                      onChange={e => setSizes(l => l.map((x, j) => (j === i ? { ...x, price: parseInt(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0 } : x)))} className="m3-input !min-h-11 text-right font-bold" />
                    <button type="button" onClick={() => setSizes(l => l.filter((_, j) => j !== i))} disabled={sizes.length <= 1} className="m3-icon-btn !w-10 !h-10 hover:text-error disabled:opacity-30" aria-label="Xóa size"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setSizes(l => [...l, { name: '', price: l[l.length - 1]?.price || price }])} className="m3-btn-tonal !min-h-10 text-sm"><Plus className="w-4 h-4" /> Thêm size</button>
              </div>
            )}
          </div>

          {/* Loại món */}
          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <div><p className="text-base font-bold text-on-surface">Chọn loại món</p><p className="text-sm text-on-surface-variant">Chọn cách món này được bán và trừ tồn kho</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['prepared', 'Món chế biến', 'Món được chế biến theo công thức và trừ tồn nguyên liệu khi bán.', 'Cà phê, cơm suất.'],
                ['regular', 'Món thường', 'Món / hàng hóa nhập sẵn để bán và trừ tồn trực tiếp trên món.', 'Nước suối, snack.'],
              ] as const).map(([id, title, desc, ex]) => (
                <button key={id} type="button" onClick={() => setKind(id)}
                  className={`text-left rounded-xl border-2 p-3 space-y-1.5 cursor-pointer transition-colors ${kind === id ? 'border-primary bg-primary-container/50' : 'border-outline-variant hover:bg-surface-container'}`}>
                  <span className="flex items-center justify-between font-bold text-on-surface">{title}<span className={`w-4.5 h-4.5 rounded-full border-2 ${kind === id ? 'border-primary bg-primary' : 'border-outline'}`} /></span>
                  <span className="block text-sm text-on-surface-variant">{desc}</span>
                  <span className="block text-sm text-on-surface-variant"><strong>Ví dụ:</strong> {ex}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Thành phần nguyên liệu */}
          {kind === 'prepared' && (
            <div className="rounded-xl border border-outline-variant p-4 space-y-3">
              <div><p className="text-base font-bold text-on-surface">Thành phần nguyên liệu</p>
                <p className="text-sm text-on-surface-variant">Thêm công thức để tự động trừ tồn và tính giá vốn dựa trên nguyên liệu</p></div>
              <div className="relative max-w-md">
                <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Thêm hàng thành phần" className="m3-input !min-h-11 pl-10" />
                {results.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
                    {results.map(i => (
                      <button key={i.id} type="button" onClick={() => { setRecipe(r => [...r, { ingredientId: i.id, quantity: 1, unit: i.unit }]); setSearch(''); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-surface-container text-sm cursor-pointer flex justify-between gap-3">
                        <span className="font-semibold">{i.name}</span><span className="text-on-surface-variant">{i.sku} · {i.unit || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-outline-variant overflow-x-auto">
                <div className="min-w-[620px]">
                  <div className="grid grid-cols-[6rem_1fr_6rem_6.5rem_6rem_6rem_2.5rem] bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant uppercase">
                    <span>Mã hàng</span><span>Tên thành phần</span><span className="text-right">Số lượng</span><span>Đơn vị</span><span className="text-right">Giá vốn</span><span className="text-right">Tổng vốn</span><span />
                  </div>
                  {recipe.length === 0 && <p className="px-3 py-5 text-center text-sm text-on-surface-variant">Chưa có hàng thành phần</p>}
                  {recipe.map((r, i) => {
                    const ing = ingredients.find(x => x.id === r.ingredientId);
                    const units = ing ? unitChoices(ing) : [];
                    const total = (ing?.cost || 0) * recipeBaseQty(r, ing);
                    return (
                      <div key={r.ingredientId} className="grid grid-cols-[6rem_1fr_6rem_6.5rem_6rem_6rem_2.5rem] items-center gap-1 px-3 py-1.5 border-t border-outline-variant/60 text-sm">
                        <span className="font-mono text-on-surface-variant truncate">{ing?.sku}</span>
                        <span className="font-semibold truncate">{ing?.name || 'Nguyên liệu đã xóa'}</span>
                        <input type="number" min={0} step="any" value={r.quantity || ''} onChange={e => setRecipe(l => l.map((x, j) => (j === i ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x)))} className="m3-input !min-h-9 !px-2 text-right" aria-label="Số lượng" />
                        {units.length > 1 ? (
                          <select value={r.unit || ing?.unit || ''} onChange={e => setRecipe(l => l.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} className="m3-input !min-h-9 !px-2 text-sm" aria-label="Đơn vị">
                            {units.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                          </select>
                        ) : <span className="text-on-surface-variant">{ing?.unit || '—'}</span>}
                        <span className="text-right text-on-surface-variant">{money(ing?.cost || 0)}</span>
                        <span className="text-right font-bold">{money(total)}</span>
                        <button type="button" onClick={() => setRecipe(l => l.filter((_, j) => j !== i))} className="m3-icon-btn !w-8 !h-8 hover:text-error" aria-label="Bỏ thành phần"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    );
                  })}
                  {recipe.length > 0 && (
                    <div className="px-3 py-2 border-t border-outline-variant bg-surface-container-low flex justify-between text-sm font-bold"><span>Giá vốn 1 phần</span><span>{money(cost)}</span></div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Topping */}
          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span><span className="block text-base font-bold text-on-surface">Topping (Món thêm)</span>
                <span className="block text-sm text-on-surface-variant">Thêm topping để tăng hương vị cho món. Ví dụ: Trân châu, xốt kem</span></span>
              <input type="checkbox" checked={toppingOn} onChange={e => setToppingOn(e.target.checked)} className="w-6 h-6 accent-primary mt-1" />
            </label>
            {toppingOn && (toppings.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Chưa có topping nào. Tạo topping ở Thực đơn → + → Topping.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {toppings.map(t => (
                  <label key={t.id} className={`flex items-center gap-2 min-h-10 px-3.5 rounded-full border text-sm font-semibold cursor-pointer select-none ${toppingIds.includes(t.id) ? 'bg-primary-container border-primary text-on-primary-container' : 'border-outline-variant hover:bg-surface-container'}`}>
                    <input type="checkbox" checked={toppingIds.includes(t.id)} onChange={e => setToppingIds(l => (e.target.checked ? [...l, t.id] : l.filter(x => x !== t.id)))} className="w-4 h-4 accent-primary" />
                    {t.name} <span className="opacity-70">{money(t.price)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-outline-variant shrink-0 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mr-auto">
            <label className="flex items-center gap-2 text-base cursor-pointer select-none">
              <input type="checkbox" checked={allowSale} onChange={e => setAllowSale(e.target.checked)} className="w-5 h-5 accent-primary" /> Cho phép bán
            </label>
            <label className="flex items-center gap-2 text-base cursor-pointer select-none" title="Bỏ chọn để tạm ẩn món khỏi màn hình thu ngân, món vẫn còn trong thực đơn">
              <input type="checkbox" checked={showOnPos} onChange={e => setShowOnPos(e.target.checked)} className="w-5 h-5 accent-primary" /> Hiện trên màn hình thu ngân
            </label>
          </div>
          <button onClick={onClose} className="m3-btn-text !min-h-12">Bỏ qua</button>
          {!dish && <button onClick={() => save(true)} className="m3-btn-outlined !min-h-12">Lưu &amp; Tạo thêm món</button>}
          <button onClick={() => save(false)} className="m3-btn-filled !min-h-12">Lưu</button>
        </div>
      </div>
    </div>
  );
}
