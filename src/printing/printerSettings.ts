/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaperWidthMm, PAPER_WIDTH_DOTS } from './escpos';

/** Identity of a USB printer the person has allowed the browser to use. */
export interface SavedUsbPrinter {
  /** Kind of connection; tells which transport sends the data. */
  type: 'usb';
  vendorId: number;
  productId: number;
  /** Serial number when the printer reports one; used to tell two identical printers apart. */
  serialNumber?: string;
  /** Name shown in the settings dialog. */
  label: string;
}

/** A printer chosen on this device, by kind of connection. More kinds are added here as they are supported. */
export type SavedPrinter = SavedUsbPrinter;

/** Receipt printer settings of this device (browser). */
export interface PrinterSettings {
  /** Paper width in millimetres. */
  paperWidth: PaperWidthMm;
  /** How far the receipt is moved to the right, in millimetres, for printers whose head sits off-centre on the paper. */
  shiftRightMm: number;
  /** Print a kitchen ticket on this printer each time dishes are sent to the kitchen from this device. */
  printKitchenTicket: boolean;
  /** The chosen printer; absent until one is chosen. */
  printer?: SavedPrinter;
  /**
   * A second printer used only for kitchen tickets (for example one standing in the kitchen); absent means kitchen
   * tickets use the receipt printer. It uses the same paper width and shift as the receipt printer.
   */
  kitchenPrinter?: SavedPrinter;
}

/** What is printed: the customer's receipt, or the kitchen ticket. */
export type PrintTarget = 'receipt' | 'kitchen';

/**
 * Picks the printer for a kind of print.
 *
 * @param settings Printer settings of this device.
 * @param target Receipt or kitchen ticket.
 * @returns The kitchen printer for a kitchen ticket when one is chosen, otherwise the receipt printer; undefined when none is chosen.
 */
export function printerFor(settings: PrinterSettings, target: PrintTarget): SavedPrinter | undefined {
  return target === 'kitchen' ? settings.kitchenPrinter ?? settings.printer : settings.printer;
}

/**
 * Reads one saved printer entry. Entries saved before several kinds of connection existed have no `type` and are
 * USB printers; they are read as such and written in the new form the next time the settings are saved.
 *
 * @param entry Value read from storage.
 * @param name Name of the entry for the error message.
 * @returns The printer, or undefined when the entry is absent.
 * @throws Error when the entry is present but damaged.
 */
function parseSavedPrinter(entry: any, name: string): SavedPrinter | undefined {
  if (entry === undefined) return undefined;
  const kind = entry?.type ?? 'usb';
  if (kind === 'usb' && Number.isInteger(entry?.vendorId) && Number.isInteger(entry?.productId) && typeof entry?.label === 'string') {
    return {
      type: 'usb',
      vendorId: entry.vendorId,
      productId: entry.productId,
      ...(entry.serialNumber === undefined ? {} : { serialNumber: entry.serialNumber }),
      label: entry.label,
    };
  }
  throw new Error(`damaged ${name} entry`);
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
    const printer = parseSavedPrinter(parsed.printer ?? parsed.usb, 'printer');
    const kitchenPrinter = parseSavedPrinter(parsed.kitchenPrinter ?? parsed.kitchenUsb, 'kitchen printer');
    return { paperWidth: parsed.paperWidth, shiftRightMm, printKitchenTicket, printer, kitchenPrinter };
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
