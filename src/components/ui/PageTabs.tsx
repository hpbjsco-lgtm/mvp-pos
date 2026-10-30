/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/** One tab of a PageTabs bar. */
export interface PageTabOption<T extends string> {
  value: T;
  label: string;
}

interface PageTabsProps<T extends string> {
  options: PageTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Tab bar for switching between sub-views of one screen (for example "Danh sách" and "Chấm công tuần"). */
export default function PageTabs<T extends string>({ options, value, onChange }: PageTabsProps<T>) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-outline-variant">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`px-4 min-h-10 text-sm font-bold cursor-pointer border-b-2 -mb-px transition-colors ${
              selected ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
