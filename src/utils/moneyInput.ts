/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads an amount of money typed in a field that shows thousands separators ("15.000").
 * Only the digits count: "." and "," are separators that the field itself puts back, so "1.5000" is 15000,
 * not 1.5 (a decimal parse would read it that way and shrink the number on every keystroke).
 *
 * @param text Text of the field.
 * @param maxDigits Most digits kept; extra digits are ignored.
 * @returns The whole amount, 0 for empty text.
 */
export function parseMoneyInput(text: string, maxDigits = 9): number {
  return parseInt(text.replace(/\D/g, '').slice(0, maxDigits), 10) || 0;
}
