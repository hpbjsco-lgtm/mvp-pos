/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, ProductOptionChoice, ProductOptionGroup, SelectedOption } from '../types';

/** Levels offered for sugar and ice when a drink is created. */
const DEFAULT_DRINK_LEVELS = ['0%', '30%', '50%', '70%', '100%'];

/** Level picked by default for sugar and ice. */
const DEFAULT_DRINK_LEVEL = '100%';

/**
 * Builds the choices of a group from a list of labels.
 *
 * @param idPrefix Prefix of the choice ids; the position is appended.
 * @param labels Labels in display order.
 * @param defaultLabel Label that is picked by default, if any.
 * @returns The choices.
 */
export function buildChoices(idPrefix: string, labels: string[], defaultLabel?: string): ProductOptionChoice[] {
  return labels.map((label, index) => ({ id: `${idPrefix}::${index}`, label, isDefault: label === defaultLabel }));
}

/**
 * Id for a group or choice created in the form. Unique enough for one store; it is only a row key.
 *
 * @param prefix `og` for a group, `oc` for a choice.
 * @returns The id.
 */
export function newOptionId(prefix: 'og' | 'oc'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The groups a new drink starts with: Sugar and Ice (single choice), both at 100%. The person can change or delete them.
 * Ids are built from the product id, so every device that builds them for the same drink gets the same ids.
 *
 * @param productId Id of the drink.
 * @returns The two groups.
 */
export function defaultDrinkOptionGroups(productId: string): ProductOptionGroup[] {
  return [
    { id: `${productId}::sugar`, name: 'Đường', allowMultiple: false, choices: buildChoices(`${productId}::sugar`, DEFAULT_DRINK_LEVELS, DEFAULT_DRINK_LEVEL) },
    { id: `${productId}::ice`, name: 'Đá', allowMultiple: false, choices: buildChoices(`${productId}::ice`, DEFAULT_DRINK_LEVELS, DEFAULT_DRINK_LEVEL) },
  ];
}

/**
 * Options picked automatically when a dish is added: the default choice of each group that has one.
 *
 * @param product The dish.
 * @returns The default selections, in group order.
 */
export function defaultSelections(product: Pick<Product, 'optionGroups'> | undefined): SelectedOption[] {
  const selections: SelectedOption[] = [];
  for (const group of product?.optionGroups ?? []) {
    for (const choice of group.choices) {
      if (choice.isDefault) selections.push({ group: group.name, choice: choice.label, ...(group.allowMultiple ? { multiple: true } : {}) });
    }
  }
  return selections;
}

/**
 * Picks or un-picks a choice. In a single-choice group the new choice replaces the old one and picking the chosen
 * one again clears it; in a multiple-choice group the choice is switched on or off.
 *
 * @param current Options now on the line.
 * @param group The group that was touched.
 * @param choice The label that was touched.
 * @returns The new options, in group order of the dish where known (new picks go last), or undefined when none are left.
 */
export function toggleSelection(current: SelectedOption[] | undefined, group: Pick<ProductOptionGroup, 'name' | 'allowMultiple'>, choice: string): SelectedOption[] | undefined {
  const list = current ?? [];
  const already = list.some(item => item.group === group.name && item.choice === choice);
  const others = group.allowMultiple ? list : list.filter(item => item.group !== group.name);
  const next = already
    ? list.filter(item => !(item.group === group.name && item.choice === choice))
    : [...others, { group: group.name, choice, ...(group.allowMultiple ? { multiple: true } : {}) }];
  return next.length > 0 ? next : undefined;
}

/**
 * Removes every choice of one group, used when the person picks "no choice" in a single-choice group.
 *
 * @param current Options now on the line.
 * @param groupName Name of the group to clear.
 * @returns The remaining options, or undefined when none are left.
 */
export function clearGroup(current: SelectedOption[] | undefined, groupName: string): SelectedOption[] | undefined {
  const next = (current ?? []).filter(item => item.group !== groupName);
  return next.length > 0 ? next : undefined;
}

/**
 * Text for lists, tickets and receipts, for example "Đường 50%, Đá 70%, Ít cay". A choice of a multiple-choice
 * group is shown without the group name.
 *
 * @param options Options on the line.
 * @returns The text, or an empty string when there are none.
 */
export function optionsText(options: SelectedOption[] | undefined): string {
  return (options ?? []).map(item => (item.multiple ? item.choice : `${item.group} ${item.choice}`)).join(', ');
}

/**
 * Text that is the same for the same selection whatever the order, to tell lines of one dish with different options apart.
 *
 * @param options Options on the line.
 * @returns The signature.
 */
export function optionsSignature(options: SelectedOption[] | undefined): string {
  return (options ?? []).map(item => `${item.group}=${item.choice}`).sort().join(';');
}

/**
 * Reads the options column. An empty or damaged value gives no options, because a line without options is valid.
 *
 * @param value Column text (JSON array) or null.
 * @returns The options, or undefined when there are none.
 */
export function parseOptions(value: unknown): SelectedOption[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return undefined;
    const list = parsed.filter(item => typeof item?.group === 'string' && typeof item?.choice === 'string')
      .map(item => ({ group: item.group, choice: item.choice, ...(item.multiple ? { multiple: true } : {}) }));
    return list.length > 0 ? list : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param options Options on the line.
 * @returns The text to store in the options column; empty when there are none.
 */
export function serializeOptions(options: SelectedOption[] | undefined): string {
  return options && options.length > 0 ? JSON.stringify(options) : '';
}

/**
 * Checks option groups before a dish is saved.
 *
 * @param groups Groups as edited.
 * @returns An error message for the person, or null when the groups are fine.
 */
export function validateOptionGroups(groups: ProductOptionGroup[]): string | null {
  const names = new Set<string>();
  for (const group of groups) {
    const name = group.name.trim();
    if (!name) return 'Nhóm tùy chọn chưa có tên.';
    if (names.has(name.toLowerCase())) return `Nhóm "${name}" bị trùng tên.`;
    names.add(name.toLowerCase());
    const labels = group.choices.map(choice => choice.label.trim());
    if (labels.length === 0) return `Nhóm "${name}" chưa có lựa chọn nào.`;
    if (labels.some(label => !label)) return `Nhóm "${name}" có lựa chọn để trống.`;
    if (new Set(labels.map(label => label.toLowerCase())).size !== labels.length) return `Nhóm "${name}" có lựa chọn bị trùng.`;
    if (!group.allowMultiple && group.choices.filter(choice => choice.isDefault).length > 1) return `Nhóm "${name}" chỉ cho chọn một nên chỉ có một lựa chọn mặc định.`;
  }
  return null;
}
