/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { clampLineDiscount, commissionOf, parseSalesChannels, validateSalesChannels } from './saleAdjustments';

describe('clampLineDiscount', () => {
  it('stays between nothing and the value of the line', () => {
    expect(clampLineDiscount(5000, 30000)).toBe(5000);
    expect(clampLineDiscount(40000, 30000)).toBe(30000);
    expect(clampLineDiscount(-100, 30000)).toBe(0);
    expect(clampLineDiscount(Number.NaN, 30000)).toBe(0);
    expect(clampLineDiscount(1234.6, 30000)).toBe(1235);
    expect(clampLineDiscount(100, 0)).toBe(0);
  });
});

describe('commissionOf', () => {
  it('is the share of the order total the channel keeps, as a whole amount', () => {
    expect(commissionOf(100000, 25)).toBe(25000);
    expect(commissionOf(99999, 20)).toBe(20000);
    expect(commissionOf(33333, 15)).toBe(5000);
  });
  it('is nothing without a percent or a total, and never more than the total', () => {
    expect(commissionOf(100000, 0)).toBe(0);
    expect(commissionOf(0, 20)).toBe(0);
    expect(commissionOf(100000, 250)).toBe(100000);
  });
});

describe('sales channels', () => {
  it('reads what was saved and ignores damaged text', () => {
    expect(parseSalesChannels('[{"name":" GrabFood ","commissionPercent":25},{"name":"","commissionPercent":5},{"name":"Be"}]'))
      .toEqual([{ name: 'GrabFood', commissionPercent: 25 }, { name: 'Be', commissionPercent: 0 }]);
    expect(parseSalesChannels('')).toEqual([]);
    expect(parseSalesChannels('{not json')).toEqual([]);
    expect(parseSalesChannels('{"name":"x"}')).toEqual([]);
  });

  it('accepts a good list and trims the names', () => {
    expect(validateSalesChannels([{ name: ' Grab ', commissionPercent: 25 }, { name: 'Shopee', commissionPercent: 0 }])).toEqual([
      { name: 'Grab', commissionPercent: 25 }, { name: 'Shopee', commissionPercent: 0 },
    ]);
  });

  it('refuses an empty name, a repeated name and a commission outside 0 to 100', () => {
    expect(() => validateSalesChannels([{ name: ' ', commissionPercent: 10 }])).toThrow('không được để trống');
    expect(() => validateSalesChannels([{ name: 'Grab', commissionPercent: 10 }, { name: 'grab', commissionPercent: 5 }])).toThrow('bị trùng');
    expect(() => validateSalesChannels([{ name: 'Grab', commissionPercent: 101 }])).toThrow('0 đến 100');
    expect(() => validateSalesChannels([{ name: 'Grab', commissionPercent: -1 }])).toThrow('0 đến 100');
  });
});
