/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MonochromeBitmap, packMonochrome } from './escpos';
import { ReceiptAlign, ReceiptDocument, ReceiptTextSize } from './receiptDocument';
import { wrapText } from './wrapText';

/** Font size in dots for each text size (203 dpi: 24 dots is about 3 mm). */
const FONT_SIZE_DOTS: Record<ReceiptTextSize, number> = { small: 20, normal: 24, large: 32 };

/** Fonts with Vietnamese letters, tried in order. The receipt is printed as an image, so the printer needs no font of its own. */
const FONT_FAMILY = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

/** Blank margin at the left and right of the content, in dots. */
const SIDE_PADDING_DOTS = 4;

/** Blank space above the first line so tall capital letters with accents are not cut. */
const TOP_PADDING = 8;

/** Space between the two sides of a row, in dots. */
const ROW_GAP_DOTS = 12;

/** Extra space between lines, as a share of the font size. */
const LINE_SPACING = 0.25;

/** A drawing step computed in the layout pass and replayed after the canvas has its final height. */
type DrawStep =
  | { kind: 'text'; value: string; font: string; x: number; y: number; align: CanvasTextAlign }
  | { kind: 'line'; y: number }
  | { kind: 'image'; image: HTMLImageElement; x: number; y: number; width: number; height: number; smooth: boolean };

/**
 * Loads an image from a data URL.
 *
 * @param dataUrl Image as a data URL.
 * @returns The decoded image.
 * @throws Error when the image cannot be decoded.
 */
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error('Không đọc được ảnh (logo hoặc mã QR) để in.');
  }
  return image;
}

/**
 * Converts an alignment to the x position of a block of the given width.
 *
 * @param align Alignment.
 * @param paperWidth Paper width in dots.
 * @param width Width of the block.
 * @returns Left edge of the block.
 */
function alignedX(align: ReceiptAlign, paperWidth: number, width: number): number {
  if (align === 'center') return Math.round((paperWidth - width) / 2);
  return align === 'right' ? paperWidth - width : 0;
}

/**
 * Draws a receipt on an off-screen canvas and converts it to a black and white bitmap. Browser only.
 *
 * @param receipt Receipt blocks from `buildReceiptDocument`.
 * @param paperWidthDots Printable width in dots (see `PAPER_WIDTH_DOTS`).
 * @param shiftRightDots Extra blank space on the left, in dots, that moves the content to the right.
 * @returns The bitmap to send with `buildReceiptJob`.
 * @throws Error when the canvas is not available or an image cannot be decoded.
 */
export async function renderReceiptToBitmap(receipt: ReceiptDocument, paperWidthDots: number, shiftRightDots = 0): Promise<MonochromeBitmap> {
  const canvas = window.document.createElement('canvas');
  canvas.width = paperWidthDots;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không cho vẽ hóa đơn (canvas không khả dụng).');

  // Content keeps a small margin on both sides because the print head does not reach the very edge of the paper.
  const contentWidth = paperWidthDots - 2 * SIDE_PADDING_DOTS - shiftRightDots;
  const steps: DrawStep[] = [];
  let y = TOP_PADDING;
  const fontFor = (size: ReceiptTextSize, bold?: boolean) => `${bold ? 'bold ' : ''}${FONT_SIZE_DOTS[size]}px ${FONT_FAMILY}`;
  const measureWith = (font: string) => (value: string) => {
    context.font = font;
    return context.measureText(value).width;
  };

  for (const block of receipt.blocks) {
    if (block.kind === 'spacer') {
      y += block.dots;
    } else if (block.kind === 'divider') {
      y += 6;
      steps.push({ kind: 'line', y });
      y += 10;
    } else if (block.kind === 'text') {
      const font = fontFor(block.size, block.bold);
      const lineHeight = Math.round(FONT_SIZE_DOTS[block.size] * (1 + LINE_SPACING));
      for (const line of wrapText(block.text, contentWidth, measureWith(font))) {
        const align: CanvasTextAlign = block.align;
        const x = align === 'center' ? contentWidth / 2 : align === 'right' ? contentWidth : 0;
        steps.push({ kind: 'text', value: line, font, x, y, align });
        y += lineHeight;
      }
    } else if (block.kind === 'row') {
      const font = fontFor(block.size, block.bold);
      const lineHeight = Math.round(FONT_SIZE_DOTS[block.size] * (1 + LINE_SPACING));
      const measure = measureWith(font);
      const rightWidth = measure(block.right);
      const leftLines = wrapText(block.left, Math.max(contentWidth - rightWidth - ROW_GAP_DOTS, contentWidth / 3), measure);
      // The right side sits on the first line of the left side.
      steps.push({ kind: 'text', value: block.right, font, x: contentWidth, y, align: 'right' });
      for (const line of leftLines) {
        steps.push({ kind: 'text', value: line, font, x: 0, y, align: 'left' });
        y += lineHeight;
      }
    } else {
      const image = await loadImage(block.dataUrl);
      const width = Math.min(block.widthDots, contentWidth);
      const height = Math.round((image.naturalHeight / image.naturalWidth) * width);
      steps.push({ kind: 'image', image, x: alignedX(block.align, contentWidth, width), y, width, height, smooth: block.smooth });
      y += height + 6;
    }
  }

  // Changing the canvas height clears it and resets the context, so draw only after the final size is set.
  canvas.height = Math.max(Math.ceil(y), 1);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  context.strokeStyle = '#000000';
  context.textBaseline = 'top';
  context.translate(SIDE_PADDING_DOTS + shiftRightDots, 0);
  for (const step of steps) {
    if (step.kind === 'text') {
      context.font = step.font;
      context.textAlign = step.align;
      context.fillText(step.value, step.x, step.y);
    } else if (step.kind === 'line') {
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.beginPath();
      context.moveTo(0, step.y);
      context.lineTo(contentWidth, step.y);
      context.stroke();
      context.setLineDash([]);
    } else {
      context.imageSmoothingEnabled = step.smooth;
      context.drawImage(step.image, step.x, step.y, step.width, step.height);
    }
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return packMonochrome(pixels.data, pixels.width, pixels.height);
}
