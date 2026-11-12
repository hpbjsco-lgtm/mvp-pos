/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ProductOptionChoice, ProductOptionGroup } from '../types';
import { newOptionId } from '../utils/productOptions';

interface OptionGroupsEditorProps {
  /** Groups as edited now. */
  groups: ProductOptionGroup[];
  /** Called with the new list after every change. */
  onChange: (groups: ProductOptionGroup[]) => void;
}

/**
 * Sets up the option groups of a dish: each group has a name, a switch for picking several choices at once, and a list
 * of choices with one (or, for a multiple-choice group, several) picked by default. Used for sugar, ice, spice level
 * and quick notes such as "No onion".
 */
export default function OptionGroupsEditor({ groups, onChange }: OptionGroupsEditorProps) {
  /** Replaces one group. */
  const updateGroup = (groupId: string, change: (group: ProductOptionGroup) => ProductOptionGroup) =>
    onChange(groups.map(group => (group.id === groupId ? change(group) : group)));

  /** Replaces one choice of a group. */
  const updateChoice = (groupId: string, choiceId: string, change: (choice: ProductOptionChoice) => ProductOptionChoice) =>
    updateGroup(groupId, group => ({ ...group, choices: group.choices.map(choice => (choice.id === choiceId ? change(choice) : choice)) }));

  /**
   * Switches the default of a choice. In a single-choice group at most one choice is the default, so picking one clears the others.
   *
   * @param group The group the choice belongs to.
   * @param choice The choice that was switched.
   */
  const toggleDefault = (group: ProductOptionGroup, choice: ProductOptionChoice) =>
    updateGroup(group.id, current => ({
      ...current,
      choices: current.choices.map(item => {
        if (item.id === choice.id) return { ...item, isDefault: !item.isDefault };
        return current.allowMultiple ? item : { ...item, isDefault: false };
      }),
    }));

  /**
   * Switches a group between single and multiple choice. Going back to single choice keeps only the first default.
   *
   * @param group The group.
   * @param allowMultiple The new setting.
   */
  const setAllowMultiple = (group: ProductOptionGroup, allowMultiple: boolean) =>
    updateGroup(group.id, current => {
      let kept = false;
      const choices = allowMultiple ? current.choices : current.choices.map(choice => {
        if (!choice.isDefault) return choice;
        if (kept) return { ...choice, isDefault: false };
        kept = true;
        return choice;
      });
      return { ...current, allowMultiple, choices };
    });

  const addGroup = () => onChange([...groups, { id: newOptionId('og'), name: '', allowMultiple: false, choices: [{ id: newOptionId('oc'), label: '', isDefault: false }] }]);

  return (
    <div className="rounded-xl border border-outline-variant p-4 space-y-3">
      <div>
        <p className="text-base font-bold text-on-surface">Tùy chọn khi bán</p>
        <p className="text-sm text-on-surface-variant">
          Nhóm lựa chọn nhân viên chọn nhanh khi gọi món. Ví dụ: Đường (0%, 50%, 100%), Đá, Mức cay, hoặc nhóm ghi chú nhanh (Không hành, Ít cay) cho chọn nhiều.
        </p>
      </div>

      {groups.length === 0 && <p className="text-sm text-on-surface-variant">Món này chưa có nhóm tùy chọn nào.</p>}

      {groups.map(group => (
        <div key={group.id} className="rounded-xl bg-surface-container p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={group.name}
              onChange={e => updateGroup(group.id, current => ({ ...current, name: e.target.value }))}
              placeholder="Tên nhóm, vd: Đường"
              aria-label="Tên nhóm tùy chọn"
              className="m3-input !min-h-11 flex-1 min-w-40 font-bold"
            />
            <label className="flex items-center gap-2 text-sm font-semibold text-on-surface cursor-pointer select-none">
              <input type="checkbox" checked={group.allowMultiple} onChange={e => setAllowMultiple(group, e.target.checked)} className="w-5 h-5 accent-primary" />
              Cho chọn nhiều
            </label>
            <button
              type="button"
              onClick={() => onChange(groups.filter(item => item.id !== group.id))}
              className="m3-icon-btn !w-10 !h-10 hover:text-error"
              aria-label={`Xóa nhóm ${group.name || 'tùy chọn'}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_5.5rem_2.5rem] gap-2 text-xs font-bold uppercase text-on-surface-variant px-1">
              <span>Lựa chọn</span><span className="text-center">Mặc định</span><span />
            </div>
            {group.choices.map(choice => (
              <div key={choice.id} className="grid grid-cols-[1fr_5.5rem_2.5rem] gap-2 items-center">
                <input
                  value={choice.label}
                  onChange={e => updateChoice(group.id, choice.id, current => ({ ...current, label: e.target.value }))}
                  placeholder="vd: 50%"
                  aria-label="Tên lựa chọn"
                  className="m3-input !min-h-11"
                />
                <label className="flex justify-center cursor-pointer" title="Tự chọn khi thêm món vào đơn">
                  <input type="checkbox" checked={choice.isDefault} onChange={() => toggleDefault(group, choice)} className="w-5 h-5 accent-primary" aria-label="Chọn sẵn" />
                </label>
                <button
                  type="button"
                  onClick={() => updateGroup(group.id, current => ({ ...current, choices: current.choices.filter(item => item.id !== choice.id) }))}
                  className="m3-icon-btn !w-10 !h-10 hover:text-error"
                  aria-label="Xóa lựa chọn"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateGroup(group.id, current => ({ ...current, choices: [...current.choices, { id: newOptionId('oc'), label: '', isDefault: false }] }))}
              className="m3-btn-text !min-h-10 text-sm"
            >
              <Plus className="w-4 h-4" /> Thêm lựa chọn
            </button>
          </div>
        </div>
      ))}

      <button type="button" onClick={addGroup} className="m3-btn-tonal !min-h-10 text-sm"><Plus className="w-4 h-4" /> Thêm nhóm tùy chọn</button>
    </div>
  );
}
