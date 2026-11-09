/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Product, RecipeItem } from '../types';
import { unitChoices } from '../utils/inventoryItems';
import { recipeBaseQty, recipeCost } from '../utils/recipes';

interface RecipeEditorProps {
  /** Nguyên vật liệu trong kho (thành phần công thức). */
  ingredients: Product[];
  /** Công thức hiện tại: nguyên liệu và số lượng cho 1 phần. */
  recipe: RecipeItem[];
  onChange: (recipe: RecipeItem[]) => void;
}

const money = (n: number) => Math.round(n).toLocaleString('vi-VN');

/**
 * Khung "Thành phần nguyên liệu" dùng chung cho món chế biến và topping chế biến: tìm và thêm nguyên liệu trong kho,
 * nhập số lượng cho 1 phần theo đơn vị cơ bản hoặc đơn vị quy đổi, hiện giá vốn của 1 phần.
 */
export default function RecipeEditor({ ingredients, recipe, onChange }: RecipeEditorProps) {
  const stockItems = useMemo(() => ingredients.filter(i => (i.itemGroup || 'ingredient') === 'ingredient' && i.isActive !== false), [ingredients]);
  const [search, setSearch] = useState('');
  const cost = recipeCost(recipe, ingredients);

  const results = search.trim()
    ? stockItems.filter(i => !recipe.some(r => r.ingredientId === i.id) && (i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()))).slice(0, 6)
    : [];

  /** Thay một dòng của công thức. */
  /** Changes one line of the recipe. */
  const update = (index: number, patch: Partial<RecipeItem>) => onChange(recipe.map((x, j) => (j === index ? { ...x, ...patch } : x)));

  return (
    <div className="rounded-xl border border-outline-variant p-4 space-y-3">
      <div><p className="text-base font-bold text-on-surface">Thành phần nguyên liệu</p>
        <p className="text-sm text-on-surface-variant">Thêm công thức để tự động trừ tồn và tính giá vốn dựa trên nguyên liệu</p></div>
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Thêm hàng thành phần" className="m3-input !min-h-11 pl-10" />
        {results.length > 0 && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
            {results.map(i => (
              <button key={i.id} type="button" onClick={() => { onChange([...recipe, { ingredientId: i.id, quantity: 1, unit: i.unit }]); setSearch(''); }}
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
                <input type="number" min={0} step="any" value={r.quantity || ''} onChange={e => update(i, { quantity: parseFloat(e.target.value) || 0 })} className="m3-input !min-h-9 !px-2 text-right" aria-label="Số lượng" />
                {units.length > 1 ? (
                  <select value={r.unit || ing?.unit || ''} onChange={e => update(i, { unit: e.target.value })} className="m3-input !min-h-9 !px-2 text-sm" aria-label="Đơn vị">
                    {units.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                  </select>
                ) : <span className="text-on-surface-variant">{ing?.unit || '—'}</span>}
                <span className="text-right text-on-surface-variant">{money(ing?.cost || 0)}</span>
                <span className="text-right font-bold">{money(total)}</span>
                <button type="button" onClick={() => onChange(recipe.filter((_, j) => j !== i))} className="m3-icon-btn !w-8 !h-8 hover:text-error" aria-label="Bỏ thành phần"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          {recipe.length > 0 && (
            <div className="px-3 py-2 border-t border-outline-variant bg-surface-container-low flex justify-between text-sm font-bold"><span>Giá vốn 1 phần</span><span>{money(cost)}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
