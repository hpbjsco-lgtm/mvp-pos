import { describe, expect, it } from 'vitest';
import { parseMoneyInput } from './moneyInput';

describe('parseMoneyInput', () => {
  it('keeps every digit when the field already shows separators', () => {
    expect(parseMoneyInput('15.000')).toBe(15000);
    expect(parseMoneyInput('1.5000')).toBe(15000);
    expect(parseMoneyInput('1.500.000')).toBe(1500000);
  });
  it('reads plain digits and ignores other characters', () => {
    expect(parseMoneyInput('25000')).toBe(25000);
    expect(parseMoneyInput('12,5 đ')).toBe(125);
  });
  it('returns 0 for empty or non-numeric text and limits the length', () => {
    expect(parseMoneyInput('')).toBe(0);
    expect(parseMoneyInput('abc')).toBe(0);
    expect(parseMoneyInput('1234567890123')).toBe(123456789);
  });
});
