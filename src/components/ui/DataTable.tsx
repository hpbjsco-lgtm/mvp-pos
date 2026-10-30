/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

/** Column definition of a DataTable. */
export interface DataTableColumn<Row> {
  /** Unique key of the column. */
  key: string;
  /** Header text. */
  header: string;
  /** Renders the cell for a row. */
  render: (row: Row) => React.ReactNode;
  /** Extra classes applied to both header and body cells (width, alignment). */
  className?: string;
}

interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Message shown when `rows` is empty. */
  emptyMessage: string;
  /** Renders the action cell (see RowActions); the column is omitted when not set. */
  renderActions?: (row: Row) => React.ReactNode;
  /** Called when a row is clicked. */
  onRowClick?: (row: Row) => void;
}

/**
 * Table with a primary-colored header row and thin separators between rows.
 * Wide tables scroll horizontally inside the card.
 */
export default function DataTable<Row>({ columns, rows, rowKey, emptyMessage, renderActions, onRowClick }: DataTableProps<Row>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="bg-primary text-on-primary text-sm font-bold">
            {columns.map((column, index) => (
              <th key={column.key} className={`px-3 py-2.5 ${index === 0 ? 'rounded-tl-lg' : ''} ${!renderActions && index === columns.length - 1 ? 'rounded-tr-lg' : ''} ${column.className || ''}`}>{column.header}</th>
            ))}
            {renderActions && <th className="px-3 py-2.5 w-24 rounded-tr-lg" aria-label="Thao tác" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-outline-variant text-base text-on-surface ${onRowClick ? 'cursor-pointer hover:bg-surface-container-low' : ''}`}
            >
              {columns.map(column => (
                <td key={column.key} className={`px-3 py-3 align-middle ${column.className || ''}`}>{column.render(row)}</td>
              ))}
              {renderActions && <td className="px-3 py-3 align-middle">{renderActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-12 text-center text-base font-semibold text-on-surface-variant">{emptyMessage}</p>}
    </div>
  );
}

interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  /** Extra buttons placed before the edit button (for example reset password). */
  children?: React.ReactNode;
}

/** Edit (green) and delete (red) icon buttons placed at the end of a table row. */
export function RowActions({ onEdit, onDelete, editLabel = 'Sửa', deleteLabel = 'Xóa', children }: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
      {children}
      {onEdit && (
        <button type="button" onClick={onEdit} title={editLabel} aria-label={editLabel} className="m3-icon-btn !w-9 !h-9 text-secondary hover:bg-secondary-container">
          <Pencil className="w-4.5 h-4.5" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} title={deleteLabel} aria-label={deleteLabel} className="m3-icon-btn !w-9 !h-9 text-error hover:bg-error-container">
          <Trash2 className="w-4.5 h-4.5" />
        </button>
      )}
    </div>
  );
}

interface RoundThumbProps {
  imageUrl?: string;
  /** Text used for the fallback initial and the alt text. */
  name: string;
}

/** Small round picture for list rows; shows the first letter of the name when there is no image. */
export function RoundThumb({ imageUrl, name }: RoundThumbProps) {
  return imageUrl ? (
    <img src={imageUrl} alt={name} className="w-10 h-10 rounded-full object-cover border border-outline-variant" />
  ) : (
    <span aria-hidden className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
