/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/** One selectable pill. */
export interface FilterPillOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown in brackets after the label. */
  count?: number;
}

interface FilterPillsProps<T extends string> {
  options: FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Row of pill buttons used to filter a list. The selected pill is filled with the primary color,
 * the others are outlined.
 */
export default function FilterPills<T extends string>({ options, value, onChange }: FilterPillsProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`min-h-9 px-4 rounded-full border text-sm font-bold whitespace-nowrap cursor-pointer transition-colors ${
              selected
                ? 'bg-primary border-primary text-on-primary'
                : 'border-primary/70 text-on-surface-variant bg-transparent hover:bg-primary-container/50'
            }`}
          >
            {option.label}{option.count !== undefined ? ` (${option.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}
