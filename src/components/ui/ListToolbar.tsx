/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Search } from 'lucide-react';

interface ListToolbarProps {
  /** Filter pills shown on the left (usually a FilterPills element). */
  filters?: React.ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Label of the primary action button; the button is hidden when empty. */
  addLabel?: string;
  onAdd?: () => void;
}

/**
 * Toolbar above a list: filter pills on the left, search box and the primary "add" button on the right.
 */
export default function ListToolbar({ filters, searchValue, onSearchChange, searchPlaceholder, addLabel, onAdd }: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0">{filters}</div>
      <div className="relative w-full sm:w-80 lg:w-96">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="m3-input !min-h-11 !rounded-xl pl-10"
        />
      </div>
      {addLabel && onAdd && (
        <button type="button" onClick={onAdd} className="m3-btn-filled !min-h-11 !rounded-xl !px-5 text-sm">{addLabel}</button>
      )}
    </div>
  );
}
