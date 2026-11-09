/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildReceiptJob, DOTS_PER_MM, PAPER_WIDTH_DOTS } from './escpos';
import { getPrinterSettings, printerFor, PrintTarget, SavedUsbPrinter } from './printerSettings';
import { ReceiptDocument } from './receiptDocument';
import { renderReceiptToBitmap } from './receiptRenderer';
import { findAllowedUsbPrinter, isWebUsbSupported, writeToUsbPrinter } from './usbTransport';

/**
 * Tail of the print queue of each printer, by printer identity. Jobs for one printer run one after another because
 * two jobs cannot hold its USB interface at once; two different printers print at the same time.
 */
const printQueues = new Map<string, Promise<unknown>>();

/**
 * @param printer A saved printer.
 * @returns A text that is the same for the same physical printer.
 */
function printerKey(printer: SavedUsbPrinter): string {
  return `${printer.vendorId}:${printer.productId}:${printer.serialNumber ?? ''}`;
}

/**
 * Prints a document on the printer chosen in this browser's settings for that kind of print. Jobs for the same
 * printer are queued, so several calls in a row print in order.
 *
 * @param receipt Document to print.
 * @param target `receipt` (default) for the customer's receipt, `kitchen` for a kitchen ticket, which goes to the
 *   kitchen printer when one is chosen and to the receipt printer otherwise.
 * @throws Error with a readable message when the browser has no WebUSB, no printer is chosen, the
 *   printer is not connected, or the print fails.
 */
export function printReceipt(receipt: ReceiptDocument, target: PrintTarget = 'receipt'): Promise<void> {
  let printer: SavedUsbPrinter | undefined;
  try {
    printer = printerFor(getPrinterSettings(), target);
  } catch (error) {
    return Promise.reject(error);
  }
  if (!printer) return Promise.reject(new Error('Chưa chọn máy in. Mở "Máy in hóa đơn" trong menu tài khoản để chọn.'));
  const key = printerKey(printer);
  const job = (printQueues.get(key) ?? Promise.resolve()).then(() => printNow(receipt, printer));
  printQueues.set(key, job.catch(() => undefined));
  return job;
}

/**
 * Prints one document immediately; use `printReceipt`, which queues jobs.
 *
 * @param receipt Document to print.
 * @param saved The printer to use.
 * @throws Error with a readable message when the browser has no WebUSB, the
 *   printer is not connected, or the print fails.
 */
async function printNow(receipt: ReceiptDocument, saved: SavedUsbPrinter): Promise<void> {
  if (!isWebUsbSupported()) throw new Error('Trình duyệt này không in trực tiếp được. Hãy dùng Chrome hoặc Edge.');
  const settings = getPrinterSettings();
  const device = await findAllowedUsbPrinter(saved);
  if (!device) throw new Error(`Không thấy máy in "${saved.label}". Cắm dây USB, bật máy in hoặc chọn lại máy in.`);
  const bitmap = await renderReceiptToBitmap(receipt, PAPER_WIDTH_DOTS[settings.paperWidth], Math.round(settings.shiftRightMm * DOTS_PER_MM));
  await writeToUsbPrinter(device, buildReceiptJob(bitmap));
}

/**
 * Tells whether a kind of print goes straight to a printer on this device. When false the app falls back to the
 * browser's print dialog (receipts) or prints nothing (kitchen tickets).
 *
 * @param target `receipt` (default) or `kitchen`.
 * @returns True when the browser supports WebUSB and a printer has been chosen for that kind of print.
 * @throws Error when the saved printer settings are damaged.
 */
export function canPrintDirectly(target: PrintTarget = 'receipt'): boolean {
  return isWebUsbSupported() && printerFor(getPrinterSettings(), target) !== undefined;
}
