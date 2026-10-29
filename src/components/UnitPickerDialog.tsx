/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { UnitConversion } from '../types';
import { UNIT_PRESETS, unitLabel } from '../utils/inventoryItems';

interface UnitPickerDialogProps {
  unit?: string;
  conversions?: UnitConversion[];
  onSave: (unit: string, conversions: UnitConversion[]) => void;
  onClose: () => void;
}

/** Chọn đơn vị tính cho hàng hóa + quy đổi về đơn vị cơ bản (vd 1 Hộp = 24 Chai). */
export default function UnitPickerDialog({ unit, conversions, onSave, onClose }: UnitPickerDialogProps) {
  const initialSelected = [...new Set([...(unit ? [unit] : []), ...(conversions || []).map(c => c.name)])];
  const [group, setGroup] = useState(UNIT_PRESETS[0].group);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [base, setBase] = useState(unit || initialSelected[0] || '');
  const [ratios, setRatios] = useState<Record<string, number>>(Object.fromEntries((conversions || []).map(c => [c.name, c.ratio])));
  const [custom, setCustom] = useState<string[]>(initialSelected.filter(n => !UNIT_PRESETS.some(g => g.units.some(u => u.name === n))));
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const preset = UNIT_PRESETS.find(g => g.group === group)!;
  const chips = useMemo(() => [...preset.units.map(u => ({ name: u.name, label: unitLabel(u) })), ...custom.map(n => ({ name: n, label: n }))], [preset, custom]);

  const toggle = (name: string) => {
    setSelected(list => {
      const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name];
      if (!next.includes(base)) setBase(next[0] || '');
      return next;
    });
  };

  const addCustom = () => {
    const name = newName.trim();
    if (!name) return;
    if (!custom.includes(name)) setCustom(c => [...c, name]);
    if (!selected.includes(name)) toggle(name);
    setNewName(''); setAdding(false);
  };

  const save = () => {
    if (selected.length === 0) { setError('Vui lòng chọn ít nhất một đơn vị tính.'); return; }
    const baseUnit = selected.includes(base) ? base : selected[0];
    const others = selected.filter(n => n !== baseUnit);
    if (others.some(n => !(ratios[n] > 0))) { setError('Nhập tỉ lệ quy đổi (lớn hơn 0) cho các đơn vị còn lại.'); return; }
    onSave(baseUnit, others.map(n => ({ name: n, ratio: ratios[n] })));
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant shrink-0">
          <h3 className="text-xl font-black text-on-surface">Chọn đơn vị tính</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">{error}</div>}
          <div>
            <p className="text-sm font-bold text-on-surface mb-2">Chọn đơn vị tính cho</p>
            <div className="flex flex-wrap gap-2">
              {UNIT_PRESETS.map(g => (
                <button key={g.group} onClick={() => setGroup(g.group)}
                  className={`min-h-10 px-4 rounded-full border text-base font-bold cursor-pointer ${group === g.group ? 'bg-primary-container border-primary text-on-primary-container' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
                  {g.group}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-on-surface-variant mb-2">Chọn các đơn vị <strong>{group}</strong> bạn muốn sử dụng</p>
            <div className="flex flex-wrap gap-2">
              {chips.map(c => (
                <button key={c.name} onClick={() => toggle(c.name)}
                  className={`min-h-9 px-3.5 rounded-full border text-sm font-semibold cursor-pointer ${selected.includes(c.name) ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface hover:bg-surface-container'}`}>
                  {c.label}
                </button>
              ))}
              {adding ? (
                <span className="inline-flex items-center gap-1">
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                    placeholder="Tên đơn vị" className="m3-input !min-h-9 !w-32 !text-sm" />
                  <button onClick={addCustom} className="m3-btn-tonal !min-h-9 !px-3 text-sm">Thêm</button>
                </span>
              ) : (
                <button onClick={() => setAdding(true)} className="min-h-9 px-3 text-sm font-bold text-primary cursor-pointer">+ Tạo mới</button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Quy đổi đơn vị cho hàng hóa này</p>
            {selected.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Chưa chọn đơn vị nào.</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-on-surface-variant">Đơn vị cơ bản</label>
                  <select value={selected.includes(base) ? base : selected[0]} onChange={e => setBase(e.target.value)} className="m3-input !min-h-10 !w-48">
                    {selected.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {selected.filter(n => n !== (selected.includes(base) ? base : selected[0])).map(n => (
                  <div key={n} className="flex items-center gap-2 text-base">
                    <span className="font-semibold">1 {n} =</span>
                    <input type="number" min={0} step="any" value={ratios[n] || ''} placeholder="0"
                      onChange={e => setRatios(r => ({ ...r, [n]: parseFloat(e.target.value) || 0 }))} className="m3-input !min-h-10 !w-28 text-right font-bold" />
                    <span className="font-semibold">{selected.includes(base) ? base : selected[0]}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex justify-end gap-2">
          <button onClick={onClose} className="m3-btn-text !min-h-12">Hủy</button>
          <button onClick={save} className="m3-btn-filled !min-h-12">Xong</button>
        </div>
      </div>
    </div>
  );
}
