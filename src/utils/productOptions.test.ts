/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ProductOptionGroup, SelectedOption } from '../types';
import {
  clearGroup, defaultDrinkOptionGroups, defaultSelections, optionsSignature, optionsText, parseOptions, serializeOptions, toggleSelection, validateOptionGroups,
} from './productOptions';

const sugar = { name: 'Đường', allowMultiple: false };
const notes = { name: 'Ghi chú nhanh', allowMultiple: true };

describe('default drink groups', () => {
  it('are Sugar and Ice with five levels each and 100% picked, with ids built from the product id', () => {
    const groups = defaultDrinkOptionGroups('p1');
    expect(groups.map(group => group.name)).toEqual(['Đường', 'Đá']);
    expect(groups[0].choices.map(choice => choice.label)).toEqual(['0%', '30%', '50%', '70%', '100%']);
    expect(groups[0].choices.filter(choice => choice.isDefault).map(choice => choice.label)).toEqual(['100%']);
    expect(groups[0].id).toBe('p1::sugar');
    expect(groups[1].choices[2].id).toBe('p1::ice::2');
    expect(defaultDrinkOptionGroups('p1')).toEqual(groups);
  });

  it('give the default selections of a drink', () => {
    expect(defaultSelections({ optionGroups: defaultDrinkOptionGroups('p1') })).toEqual([
      { group: 'Đường', choice: '100%' }, { group: 'Đá', choice: '100%' },
    ]);
    expect(defaultSelections({})).toEqual([]);
    expect(defaultSelections(undefined)).toEqual([]);
  });
});

describe('toggleSelection', () => {
  it('replaces the choice of a single-choice group and clears it when picked again', () => {
    const afterFirst = toggleSelection([{ group: 'Đường', choice: '100%' }, { group: 'Đá', choice: '70%' }], sugar, '50%');
    expect(afterFirst).toEqual([{ group: 'Đá', choice: '70%' }, { group: 'Đường', choice: '50%' }]);
    expect(toggleSelection(afterFirst, sugar, '50%')).toEqual([{ group: 'Đá', choice: '70%' }]);
  });

  it('switches choices of a multiple-choice group on and off and marks them as multiple', () => {
    let current: SelectedOption[] | undefined = toggleSelection(undefined, notes, 'Ít cay');
    current = toggleSelection(current, notes, 'Không hành');
    expect(current).toEqual([{ group: 'Ghi chú nhanh', choice: 'Ít cay', multiple: true }, { group: 'Ghi chú nhanh', choice: 'Không hành', multiple: true }]);
    expect(toggleSelection(current, notes, 'Ít cay')).toEqual([{ group: 'Ghi chú nhanh', choice: 'Không hành', multiple: true }]);
    expect(toggleSelection(toggleSelection(undefined, notes, 'Ít cay'), notes, 'Ít cay')).toBeUndefined();
  });

  it('clears one group only', () => {
    expect(clearGroup([{ group: 'Đường', choice: '50%' }, { group: 'Đá', choice: '70%' }], 'Đường')).toEqual([{ group: 'Đá', choice: '70%' }]);
    expect(clearGroup([{ group: 'Đường', choice: '50%' }], 'Đường')).toBeUndefined();
  });
});

describe('text and storage', () => {
  const picked: SelectedOption[] = [
    { group: 'Đường', choice: '50%' }, { group: 'Đá', choice: '70%' },
    { group: 'Ghi chú nhanh', choice: 'Ít cay', multiple: true }, { group: 'Ghi chú nhanh', choice: 'Không hành', multiple: true },
  ];

  it('joins the choices with commas and hides the group name of multiple-choice groups', () => {
    expect(optionsText(picked)).toBe('Đường 50%, Đá 70%, Ít cay, Không hành');
    expect(optionsText(undefined)).toBe('');
  });

  it('gives the same signature whatever the order', () => {
    expect(optionsSignature(picked)).toBe(optionsSignature([...picked].reverse()));
    expect(optionsSignature(picked)).not.toBe(optionsSignature(picked.slice(1)));
    expect(optionsSignature(undefined)).toBe('');
  });

  it('round-trips through the column text, and reads empty or damaged text as no options', () => {
    expect(parseOptions(serializeOptions(picked))).toEqual(picked);
    expect(serializeOptions(undefined)).toBe('');
    expect(serializeOptions([])).toBe('');
    expect(parseOptions('')).toBeUndefined();
    expect(parseOptions('{oops')).toBeUndefined();
    expect(parseOptions('{"group":"x"}')).toBeUndefined();
    expect(parseOptions('[{"group":1}]')).toBeUndefined();
  });
});

describe('validateOptionGroups', () => {
  const group = (extra: Partial<ProductOptionGroup>): ProductOptionGroup => ({
    id: 'g', name: 'Đường', allowMultiple: false, choices: [{ id: 'c1', label: '50%', isDefault: false }], ...extra,
  });

  it('accepts good groups and an empty list', () => {
    expect(validateOptionGroups([])).toBeNull();
    expect(validateOptionGroups(defaultDrinkOptionGroups('p1'))).toBeNull();
  });

  it('names the problem for the person', () => {
    expect(validateOptionGroups([group({ name: ' ' })])).toBe('Nhóm tùy chọn chưa có tên.');
    expect(validateOptionGroups([group({}), group({ id: 'g2', name: 'đường' })])).toBe('Nhóm "đường" bị trùng tên.');
    expect(validateOptionGroups([group({ choices: [] })])).toBe('Nhóm "Đường" chưa có lựa chọn nào.');
    expect(validateOptionGroups([group({ choices: [{ id: 'c', label: ' ', isDefault: false }] })])).toBe('Nhóm "Đường" có lựa chọn để trống.');
    expect(validateOptionGroups([group({ choices: [{ id: 'a', label: '50%', isDefault: false }, { id: 'b', label: '50%', isDefault: false }] })])).toBe('Nhóm "Đường" có lựa chọn bị trùng.');
    expect(validateOptionGroups([group({ choices: [{ id: 'a', label: '50%', isDefault: true }, { id: 'b', label: '70%', isDefault: true }] })]))
      .toBe('Nhóm "Đường" chỉ cho chọn một nên chỉ có một lựa chọn mặc định.');
  });

  it('allows several defaults in a multiple-choice group', () => {
    expect(validateOptionGroups([group({ allowMultiple: true, choices: [{ id: 'a', label: 'A', isDefault: true }, { id: 'b', label: 'B', isDefault: true }] })])).toBeNull();
  });
});
