/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Breaks text into lines that fit a width. It breaks at spaces; a single word wider than the
 * line is broken between characters.
 *
 * @param text Text to wrap. Explicit "\n" always starts a new line.
 * @param maxWidth Line width in the unit of `measure`.
 * @param measure Returns the width of a string, for example `ctx.measureText(s).width`.
 * @returns The lines, at least one (empty when `text` is empty).
 * @throws Error when `maxWidth` is not positive.
 */
export function wrapText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  if (maxWidth <= 0) throw new Error(`Line width must be positive, got ${maxWidth}.`);
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ').filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = '';
      // The word alone is too wide: fill lines character by character.
      let piece = '';
      for (const char of word) {
        if (piece && measure(piece + char) > maxWidth) {
          lines.push(piece);
          piece = '';
        }
        piece += char;
      }
      current = piece;
    }
    lines.push(current);
  }
  return lines;
}
