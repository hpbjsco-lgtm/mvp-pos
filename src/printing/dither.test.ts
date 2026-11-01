import { describe, expect, it } from 'vitest';
import { ditherToBlackAndWhite } from './dither';

/** Pixel buffer where every pixel has the given RGBA value. */
const solid = (width: number, height: number, rgba: [number, number, number, number]) =>
  Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]);

/** Number of black pixels in an RGBA buffer. */
const blackCount = (pixels: Uint8ClampedArray) => pixels.filter((value, i) => i % 4 === 0 && value === 0).length;

describe('ditherToBlackAndWhite', () => {
  it('keeps pure black and pure white unchanged', () => {
    expect(blackCount(ditherToBlackAndWhite(solid(4, 4, [0, 0, 0, 255]), 4, 4))).toBe(16);
    expect(blackCount(ditherToBlackAndWhite(solid(4, 4, [255, 255, 255, 255]), 4, 4))).toBe(0);
  });
  it('treats transparent pixels as white', () => {
    expect(blackCount(ditherToBlackAndWhite(solid(4, 4, [0, 0, 0, 0]), 4, 4))).toBe(0);
  });
  it('turns mid grey into a pattern of about half black dots', () => {
    const black = blackCount(ditherToBlackAndWhite(solid(16, 16, [128, 128, 128, 255]), 16, 16));
    expect(black).toBeGreaterThan(100);
    expect(black).toBeLessThan(156);
  });
  it('outputs only black or white opaque pixels', () => {
    const output = ditherToBlackAndWhite(solid(8, 8, [90, 140, 200, 255]), 8, 8);
    for (let i = 0; i < output.length; i += 4) {
      expect([0, 255]).toContain(output[i]);
      expect(output[i + 3]).toBe(255);
    }
  });
  it('rejects a buffer of the wrong size', () => {
    expect(() => ditherToBlackAndWhite(new Uint8ClampedArray(3), 2, 1)).toThrow('2x1');
  });
});
