/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaperWidthMm, PAPER_WIDTH_DOTS } from './escpos';

/** Identity of a USB printer the person has allowed the browser to use. */
export interface SavedUsbPrinter {
  vendorId: number;
  productId: number;
  /** Serial number when the printer reports one; used to tell two identical printers apart. */
  serialNumber?: string;
  /** Name shown in the settings dialog. */
  label: string;
}

/** Receipt printer settings of this device (browser). */
export interface PrinterSettings {
  /** Paper width in millimetres. */
  paperWidth: PaperWidthMm;
  /** How far the receipt is moved to the right, in millimetres, for printers whose head sits off-centre on the paper. */
  shiftRightMm: number;
  /** Print a kitchen ticket on this printer each time dishes are sent to the kitchen from this device. */
  printKitchenTicket: boolean;
  /** The chosen printer; absent until one is chosen. */
  usb?: SavedUsbPrinter;
}

/** localStorage key. It is per browser on purpose: each cash desk has its own printer. */
const STORAGE_KEY = 'smartpos.printer';

/** Settings used before anything is saved. */
export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = { paperWidth: 58, shiftRightMm: 1.5, printKitchenTicket: false };

/** Largest accepted shift, in millimetres. */
export const MAX_SHIFT_RIGHT_MM = 10;

/**
 * Reads the printer settings of this device.
 *
 * @returns The saved settings, or the defaults (58 mm, shifted 1.5 mm to the right, no printer) when nothing is saved.
 * @throws Error when the saved value is damaged, so a wrong printer is never used silently.
 */
export function getPrinterSettings(): PrinterSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PRINTER_SETTINGS };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PRINTER_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    if (!(parsed?.paperWidth in PAPER_WIDTH_DOTS)) throw new Error('unknown paper width');
    const shiftRightMm = parsed.shiftRightMm ?? DEFAULT_PRINTER_SETTINGS.shiftRightMm;
    if (typeof shiftRightMm !== 'number' || !(shiftRightMm >= 0 && shiftRightMm <= MAX_SHIFT_RIGHT_MM)) throw new Error('invalid shift');
    const printKitchenTicket = parsed.printKitchenTicket ?? DEFAULT_PRINTER_SETTINGS.printKitchenTicket;
    if (typeof printKitchenTicket !== 'boolean') throw new Error('invalid kitchen ticket flag');
    const usb = parsed.usb;
    if (usb !== undefined && (!Number.isInteger(usb.vendorId) || !Number.isInteger(usb.productId) || typeof usb.label !== 'string')) {
      throw new Error('damaged printer entry');
    }
    return { paperWidth: parsed.paperWidth, shiftRightMm, printKitchenTicket, usb };
  } catch (error) {
    throw new Error(`Cấu hình máy in bị hỏng (${(error as Error).message}). Hãy chọn lại máy in.`);
  }
}

/**
 * Saves the printer settings of this device.
 *
 * @param settings Settings to save.
 */
export function savePrinterSettings(settings: PrinterSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Forgets the saved settings; the defaults apply again. */
export function clearPrinterSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
