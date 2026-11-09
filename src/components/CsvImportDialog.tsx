/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ImportResult } from '../utils/inventoryCsv';

/** Most issues listed before the rest are summarised. */
const MAX_ISSUES_SHOWN = 30;
/** Most rows shown in the preview. */
const MAX_PREVIEW_ROWS = 10;

interface CsvImportDialogProps<T> {
  title: string;
  /** Short explanation shown above the file picker. */
  instructions: string;
  /** Downloads the template file for this kind of import. */
  onDownloadTemplate: () => void;
  /** Reads the file text into records and issues. */
  parse: (text: string) => ImportResult<T>;
  /** Column names of the preview table. */
  previewHeaders: string[];
  /** Cells of one record in the preview table. */
  previewRow: (item: T) => string[];
  /** Adds the records; only called when the file has no issues. */
  onConfirm: (items: T[]) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Dialog to import records from a CSV file: the person picks a file, sees the problems per line or a preview of the
 * records, and confirms. Nothing is added while the file has problems, so a half-imported file cannot happen.
 */
export default function CsvImportDialog<T>({ title, instructions, onDownloadTemplate, parse, previewHeaders, previewRow, onConfirm, onClose }: CsvImportDialogProps<T>) {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult<T> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * Reads the chosen file and checks it.
   *
   * @param file File chosen by the person.
   */
  const pick = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    try {
      setResult(parse(await file.text()));
    } catch (readError) {
      setResult(null);
      setError(`Không đọc được file: ${(readError as Error).message}`);
    }
  };

  /** Adds the records. */
  const confirm = async () => {
    if (!result) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(result.items);
      onClose();
    } catch (confirmError) {
      setError((confirmError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasIssues = !!result && result.issues.length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-on-surface">{title}</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <p className="text-sm text-on-surface-variant">{instructions}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onDownloadTemplate} className="m3-btn-outlined !min-h-11 text-sm">Tải file mẫu</button>
            <label className="m3-btn-tonal !min-h-11 text-sm cursor-pointer">
              Chọn file CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {fileName && <span className="text-sm text-on-surface-variant break-all">{fileName}</span>}
          </div>

          {error && <p className="text-sm font-semibold rounded-xl p-3 bg-error-container text-on-error-container">{error}</p>}

          {result && (
            <>
              <p className={`text-sm font-bold ${hasIssues ? 'text-error' : 'text-on-surface'}`}>
                {result.items.length} dòng hợp lệ{hasIssues ? `, ${result.issues.length} dòng lỗi. Hãy sửa file rồi chọn lại, chưa có gì được nhập.` : '.'}
              </p>

              {hasIssues && (
                <ul className="text-sm rounded-xl border border-error/40 divide-y divide-outline-variant/50 max-h-56 overflow-y-auto">
                  {result.issues.slice(0, MAX_ISSUES_SHOWN).map(issue => (
                    <li key={`${issue.line}-${issue.message}`} className="px-3 py-2"><strong>Dòng {issue.line}:</strong> {issue.message}</li>
                  ))}
                  {result.issues.length > MAX_ISSUES_SHOWN && <li className="px-3 py-2 text-on-surface-variant">và {result.issues.length - MAX_ISSUES_SHOWN} lỗi khác</li>}
                </ul>
              )}

              {!hasIssues && result.items.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-outline-variant">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left bg-surface-container">{previewHeaders.map(header => <th key={header} className="px-3 py-2 font-semibold whitespace-nowrap">{header}</th>)}</tr></thead>
                    <tbody>
                      {result.items.slice(0, MAX_PREVIEW_ROWS).map((item, index) => (
                        <tr key={index} className="border-t border-outline-variant/50">
                          {previewRow(item).map((value, column) => <td key={column} className="px-3 py-1.5 whitespace-nowrap">{value}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.items.length > MAX_PREVIEW_ROWS && <p className="px-3 py-2 text-sm text-on-surface-variant">và {result.items.length - MAX_PREVIEW_ROWS} dòng nữa</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-outline-variant flex gap-3 shrink-0">
          <button type="button" disabled={busy || !result || hasIssues || result.items.length === 0} onClick={() => void confirm()} className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-40">
            {busy ? 'Đang nhập...' : result && !hasIssues && result.items.length > 0 ? `Nhập ${result.items.length} dòng` : 'Nhập'}
          </button>
          <button type="button" onClick={onClose} className="m3-btn-outlined !min-h-12">Đóng</button>
        </div>
      </div>
    </div>
  );
}
