/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** A black and white image, one bit per dot, rows packed most significant bit first (1 = black). */
export interface MonochromeBitmap {
  /** Width in dots. */
  width: number;
  /** Height in dots. */
  height: number;
  /** Packed dots: `ceil(width / 8)` bytes per row, `height` rows. */
  data: Uint8Array;
}

/** Printable width in dots (203 dpi) for the paper widths the app supports. */
export const PAPER_WIDTH_DOTS = { 58: 384, 80: 576 } as const;

/** Dots per millimetre of a 203 dpi print head. */
export const DOTS_PER_MM = 8;

/** Paper widths in millimetres that the app can print on. */
export type PaperWidthMm = keyof typeof PAPER_WIDTH_DOTS;

/**
 * Rows sent per raster command. Cheap printers have small receive buffers and drop data when one
 * command carries a tall image, so a long receipt is sent as several bands.
 */
export const RASTER_BAND_HEIGHT = 128;

/**
 * Converts RGBA pixels (for example `ImageData.data`) to a black and white bitmap.
 * A pixel is black when it is opaque and darker than the threshold; transparent pixels stay white.
 *
 * @param rgba Pixels, 4 bytes each, row by row.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @param threshold Luminance (0-255) below which a pixel turns black.
 * @returns The packed bitmap.
 * @throws Error when the pixel buffer does not match `width * height * 4`.
 */
export function packMonochrome(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 128,
): MonochromeBitmap {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Pixel buffer has ${rgba.length} values but a ${width}x${height} image needs ${width * height * 4}.`);
  }
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = rgba[offset + 3] / 255;
      // Weights follow the usual perceived brightness of red, green and blue.
      const luminance = (0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]) * alpha + 255 * (1 - alpha);
      if (luminance < threshold) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}

/**
 * Builds the byte stream for an ESC/POS receipt printer. Only the commands the app needs are
 * implemented: reset, raster image, paper feed and cut.
 */
export class EscPosBuilder {
  /** Bytes collected so far. */
  private readonly bytes: number[] = [];

  /**
   * Resets the printer to its defaults (ESC @). Send it first so settings left by a previous job do not leak in.
   *
   * @returns This builder.
   */
  initialize(): this {
    this.bytes.push(0x1b, 0x40);
    return this;
  }

  /**
   * Prints a bitmap with the raster command (GS v 0), split into bands of `RASTER_BAND_HEIGHT` rows.
   *
   * @param bitmap Image to print.
   * @returns This builder.
   * @throws Error when the bitmap is empty, its data length is wrong, or it is too wide for the command.
   */
  rasterImage(bitmap: MonochromeBitmap): this {
    const rowBytes = Math.ceil(bitmap.width / 8);
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('Cannot print an empty image.');
    if (rowBytes > 0xffff) throw new Error(`Image is ${bitmap.width} dots wide; the printer command allows at most ${0xffff * 8}.`);
    if (bitmap.data.length !== rowBytes * bitmap.height) {
      throw new Error(`Bitmap data has ${bitmap.data.length} bytes but ${rowBytes * bitmap.height} are needed.`);
    }
    for (let top = 0; top < bitmap.height; top += RASTER_BAND_HEIGHT) {
      const rows = Math.min(RASTER_BAND_HEIGHT, bitmap.height - top);
      this.bytes.push(0x1d, 0x76, 0x30, 0x00, rowBytes & 0xff, rowBytes >> 8, rows & 0xff, rows >> 8);
      for (const value of bitmap.data.subarray(top * rowBytes, (top + rows) * rowBytes)) this.bytes.push(value);
    }
    return this;
  }

  /**
   * Feeds the paper (ESC d), so the printed part moves past the tear bar.
   *
   * @param lines Number of text lines to feed, 0 to 255.
   * @returns This builder.
   * @throws Error when `lines` is outside 0-255.
   */
  feed(lines: number): this {
    if (!Number.isInteger(lines) || lines < 0 || lines > 255) throw new Error(`Feed must be a whole number from 0 to 255, got ${lines}.`);
    this.bytes.push(0x1b, 0x64, lines);
    return this;
  }

  /**
   * Feeds a little and cuts the paper (GS V 66 0). Printers without a cutter ignore it; most 58 mm
   * mobile printers have none, so only call this when the cutter is known to exist.
   *
   * @returns This builder.
   */
  cut(): this {
    this.bytes.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  /**
   * @returns A copy of the bytes to send to the printer.
   */
  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Builds the complete job for one receipt: reset, the receipt image, then blank paper so the
 * last line clears the tear bar.
 *
 * @param bitmap Rendered receipt.
 * @param options `feedLines` blank lines after the image (default 4); `cut` also sends the cut command.
 * @returns Bytes ready to send to the printer.
 */
export function buildReceiptJob(bitmap: MonochromeBitmap, options: { feedLines?: number; cut?: boolean } = {}): Uint8Array {
  const builder = new EscPosBuilder().initialize().rasterImage(bitmap).feed(options.feedLines ?? 4);
  if (options.cut) builder.cut();
  return builder.build();
}
