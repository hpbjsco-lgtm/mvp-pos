/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Marks a file as UTF-8 so Excel shows Vietnamese letters correctly. */
export const UTF8_BOM = '﻿';

/** A row read from a CSV file. */
export interface CsvRow {
  /** Line of the file where the row starts (the first line is 1), for error messages. */
  line: number;
  cells: string[];
}

/**
 * Writes rows as CSV text: cells with a comma, a quote or a line break are quoted, quotes are doubled, lines end with
 * CRLF and the text starts with a UTF-8 byte order mark so Excel opens it with the right letters.
 *
 * @param rows Rows of cells.
 * @returns The CSV text.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const quote = (cell: string | number) => {
    const text = String(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return UTF8_BOM + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

/**
 * Picks the separator of a CSV text from its first non-empty line: Excel with a Vietnamese setting saves with a
 * semicolon, other programs with a comma or a tab.
 *
 * @param text CSV text without the byte order mark.
 * @returns `,`, `;` or a tab.
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find(line => line.trim() !== '' && !line.trim().startsWith('#')) ?? '';
  const count = (separator: string) => firstLine.split(separator).length - 1;
  const best = [';', '\t', ','].reduce((chosen, separator) => (count(separator) > count(chosen) ? separator : chosen), ',');
  return best;
}

/**
 * Reads CSV text. Quoted cells may hold separators, doubled quotes and line breaks. Empty rows and rows whose first
 * cell starts with `#` (instructions and examples in the template) are skipped.
 *
 * @param input CSV text, with or without the byte order mark.
 * @returns The rows with the line where each one starts.
 * @throws {Error} When a quoted cell is never closed.
 */
export function parseCsv(input: string): CsvRow[] {
  const text = input.startsWith(UTF8_BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    const empty = cells.every(value => value.trim() === '');
    const comment = cells[0].trim().startsWith('#');
    if (!empty && !comment) rows.push({ line: rowLine, cells: cells.map(value => value.trim()) });
    cells = [];
    cell = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else { cell += char; if (char === '\n') line += 1; }
    } else if (char === '"' && cell === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  if (inQuotes) throw new Error(`Dòng ${rowLine}: có dấu ngoặc kép mở nhưng chưa đóng.`);
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
}
