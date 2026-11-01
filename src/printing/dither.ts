/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts pixels to pure black and white with Floyd-Steinberg error diffusion, so grey areas of a
 * photo or a coloured logo print as dot patterns instead of solid blobs. Flat black and white
 * artwork comes out unchanged.
 *
 * @param rgba Pixels, 4 bytes each, row by row. Transparent pixels count as white.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns New opaque RGBA pixels, each pixel black or white.
 * @throws Error when the pixel buffer does not match `width * height * 4`.
 */
export function ditherToBlackAndWhite(rgba: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Pixel buffer has ${rgba.length} values but a ${width}x${height} image needs ${width * height * 4}.`);
  }
  // Brightness of each pixel, 0 (black) to 255 (white), with transparency blended onto white.
  const brightness = new Float32Array(width * height);
  for (let i = 0; i < brightness.length; i++) {
    const alpha = rgba[i * 4 + 3] / 255;
    brightness[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) * alpha + 255 * (1 - alpha);
  }
  const output = new Uint8ClampedArray(width * height * 4);
  const spread = (x: number, y: number, amount: number) => {
    if (x >= 0 && x < width && y < height) brightness[y * width + x] += amount;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const old = brightness[y * width + x];
      const value = old < 128 ? 0 : 255;
      const error = old - value;
      spread(x + 1, y, (error * 7) / 16);
      spread(x - 1, y + 1, (error * 3) / 16);
      spread(x, y + 1, (error * 5) / 16);
      spread(x + 1, y + 1, error / 16);
      const offset = (y * width + x) * 4;
      output[offset] = output[offset + 1] = output[offset + 2] = value;
      output[offset + 3] = 255;
    }
  }
  return output;
}
