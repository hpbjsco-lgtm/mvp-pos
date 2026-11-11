/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedPrinter } from './printerSettings';
import { findAllowedUsbPrinter, isWebUsbSupported, writeToUsbPrinter } from './usbTransport';

/** A way to send print data to one printer, whatever the kind of connection. */
export interface PrinterTransport {
  /**
   * Sends one print job.
   *
   * @param bytes Complete job (ESC/POS commands).
   * @throws Error with a readable message when the printer cannot be reached or refuses the data.
   */
  write(bytes: Uint8Array): Promise<void>;
}

/**
 * Text that is the same for the same physical printer. Jobs with the same key are queued one after another.
 *
 * @param printer A saved printer.
 * @returns The key.
 */
export function printerKey(printer: SavedPrinter): string {
  return `${printer.type}:${printer.vendorId}:${printer.productId}:${printer.serialNumber ?? ''}`;
}

/**
 * Tells whether this browser can send data to a printer of that kind of connection.
 *
 * @param printer A saved printer.
 * @returns True when the browser supports the connection.
 */
export function isDirectPrintingSupported(printer: SavedPrinter): boolean {
  return isWebUsbSupported();
}

/**
 * Finds the printer and returns the transport that writes to it.
 *
 * @param printer A saved printer.
 * @returns The transport.
 * @throws Error with a readable message when the browser does not support the connection or the printer is not connected.
 */
export async function openTransport(printer: SavedPrinter): Promise<PrinterTransport> {
  if (!isDirectPrintingSupported(printer)) throw new Error('Trình duyệt này không in trực tiếp được. Hãy dùng Chrome hoặc Edge.');
  const device = await findAllowedUsbPrinter(printer);
  if (!device) throw new Error(`Không thấy máy in "${printer.label}". Cắm dây USB, bật máy in hoặc chọn lại máy in.`);
  return { write: bytes => writeToUsbPrinter(device, bytes) };
}
