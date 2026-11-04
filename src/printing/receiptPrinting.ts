/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildReceiptJob, DOTS_PER_MM, PAPER_WIDTH_DOTS } from './escpos';
import { getPrinterSettings } from './printerSettings';
import { ReceiptDocument } from './receiptDocument';
import { renderReceiptToBitmap } from './receiptRenderer';
import { findAllowedUsbPrinter, isWebUsbSupported, writeToUsbPrinter } from './usbTransport';

/** Tail of the print queue: jobs run one after another because two jobs cannot hold the USB interface at once. */
let printQueue: Promise<unknown> = Promise.resolve();

/**
 * Prints a receipt on the printer chosen in this browser's settings. Jobs are queued, so several
 * calls in a row print in order.
 *
 * @param receipt Receipt to print.
 * @throws Error with a readable message when the browser has no WebUSB, no printer is chosen, the
 *   printer is not connected, or the print fails.
 */
export function printReceipt(receipt: ReceiptDocument): Promise<void> {
  const job = printQueue.then(() => printNow(receipt));
  printQueue = job.catch(() => undefined);
  return job;
}

/**
 * Prints one receipt immediately; use `printReceipt`, which queues jobs.
 *
 * @param receipt Receipt to print.
 * @throws Error with a readable message when the browser has no WebUSB, no printer is chosen, the
 *   printer is not connected, or the print fails.
 */
async function printNow(receipt: ReceiptDocument): Promise<void> {
  if (!isWebUsbSupported()) throw new Error('Trình duyệt này không in trực tiếp được. Hãy dùng Chrome hoặc Edge.');
  const settings = getPrinterSettings();
  if (!settings.usb) throw new Error('Chưa chọn máy in. Mở "Máy in hóa đơn" trong menu tài khoản để chọn.');
  const device = await findAllowedUsbPrinter(settings.usb);
  if (!device) throw new Error(`Không thấy máy in "${settings.usb.label}". Cắm dây USB, bật máy in hoặc chọn lại máy in.`);
  const bitmap = await renderReceiptToBitmap(receipt, PAPER_WIDTH_DOTS[settings.paperWidth], Math.round(settings.shiftRightMm * DOTS_PER_MM));
  await writeToUsbPrinter(device, buildReceiptJob(bitmap));
}

/**
 * Tells whether receipts go straight to a printer on this device. When false the app falls back to the
 * browser's print dialog.
 *
 * @returns True when the browser supports WebUSB and a printer has been chosen.
 * @throws Error when the saved printer settings are damaged.
 */
export function canPrintDirectly(): boolean {
  return isWebUsbSupported() && getPrinterSettings().usb !== undefined;
}
