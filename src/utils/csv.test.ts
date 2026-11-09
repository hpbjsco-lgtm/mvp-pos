/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv, UTF8_BOM } from './csv';

describe('toCsv', () => {
  it('starts with a byte order mark, ends lines with CRLF and quotes what needs it', () => {
    const text = toCsv([['Tên', 'Ghi chú'], ['Cà phê, rang xay', 'Nói "ngon"'], ['Dòng 1\nDòng 2', 5]]);
    expect(text.startsWith(UTF8_BOM)).toBe(true);
    expect(text.slice(1)).toBe('Tên,Ghi chú\r\n"Cà phê, rang xay","Nói ""ngon"""\r\n"Dòng 1\nDòng 2",5\r\n');
  });
});

describe('parseCsv', () => {
  it('reads what toCsv wrote, including quotes, separators and line breaks inside a cell', () => {
    const rows = [['Tên', 'Ghi chú'], ['Cà phê, rang xay', 'Nói "ngon"'], ['A\nB', '']];
    expect(parseCsv(toCsv(rows)).map(row => row.cells)).toEqual(rows);
  });

  it('numbers lines from 1 and counts the lines of a cell with a break', () => {
    const parsed = parseCsv('a,b\n"x\ny",1\nlast,2\n');
    expect(parsed.map(row => row.line)).toEqual([1, 2, 4]);
  });

  it('detects the semicolon that Excel uses with a Vietnamese setting, and tabs', () => {
    expect(parseCsv('Tên;Giá\nTrà;25000\n').map(row => row.cells)).toEqual([['Tên', 'Giá'], ['Trà', '25000']]);
    expect(parseCsv('Tên\tGiá\nTrà\t25000\n').map(row => row.cells)).toEqual([['Tên', 'Giá'], ['Trà', '25000']]);
  });

  it('skips empty rows and rows that start with #, and trims cells', () => {
    const parsed = parseCsv('# Hướng dẫn\nTên,Giá\n\n#VD,Ví dụ\n  Trà , 25000 \n,,\n');
    expect(parsed.map(row => row.cells)).toEqual([['Tên', 'Giá'], ['Trà', '25000']]);
    expect(parsed[1].line).toBe(5);
  });

  it('accepts CRLF and old Mac line ends and a file without a final line break', () => {
    expect(parseCsv('a,b\r\n1,2').map(row => row.cells)).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2\r').map(row => row.cells)).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('reports a quote that is never closed with its line', () => {
    expect(() => parseCsv('a,b\n1,"oops\n2,3')).toThrow('Dòng 2');
  });
});
