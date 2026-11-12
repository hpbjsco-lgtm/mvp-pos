/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedSerialPrinter } from './printerSettings';
import { splitIntoChunks } from './usbTransport';

/**
 * Speed given when opening the port. A Bluetooth serial link (SPP) ignores it, but the API requires a value.
 * Printers wired to a real serial port may need their own speed; that is not supported yet.
 */
const SERIAL_BAUD_RATE = 9600;

/** Bytes per write. Bluetooth printers have small buffers, so data is sent in small pieces and each piece is awaited. */
const SERIAL_CHUNK_BYTES = 512;

/**
 * @returns True when this browser can talk to serial ports, including paired Bluetooth printers (Chrome or Edge on a secure page).
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Text for a serial port in lists and messages. The browser does not give the name of a Bluetooth device,
 * so a port without ids is shown as a generic Bluetooth printer.
 *
 * @param info Ids of the port, as given by `SerialPort.getInfo()`.
 * @returns The text.
 */
export function describeSerialPort(info: SerialPortInfo): string {
  if (info.usbVendorId === undefined || info.usbProductId === undefined) return 'Máy in Bluetooth (cổng nối tiếp)';
  return `Cổng nối tiếp ${info.usbVendorId.toString(16).padStart(4, '0')}:${info.usbProductId.toString(16).padStart(4, '0')}`;
}

/**
 * Opens the browser's port picker so the person allows one serial port. Must be called from a click.
 * A Bluetooth printer must be paired and connected in the operating system first, or it is not listed.
 *
 * @returns The chosen port, or null when the person closed the picker.
 */
export async function requestSerialPrinter(): Promise<SerialPort | null> {
  try {
    return await navigator.serial.requestPort();
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null;
    throw error;
  }
}

/**
 * Converts a port to the identity kept in the settings.
 *
 * @param port Chosen port.
 * @returns Saved identity.
 */
export function toSavedSerialPrinter(port: Pick<SerialPort, 'getInfo'>): SavedSerialPrinter {
  const info = port.getInfo();
  return { type: 'serial', usbVendorId: info.usbVendorId, usbProductId: info.usbProductId, label: describeSerialPort(info) };
}

/**
 * Finds a port the browser already has permission for.
 *
 * @param saved Identity from the settings.
 * @returns The port, or null when it is not available or the permission was removed.
 * @throws Error when the saved printer has no ids and several ports are allowed, because the right one cannot be told apart.
 */
export async function findAllowedSerialPrinter(saved: SavedSerialPrinter): Promise<SerialPort | null> {
  const ports = await navigator.serial.getPorts();
  const matches = ports.filter(port => {
    const info = port.getInfo();
    return info.usbVendorId === saved.usbVendorId && info.usbProductId === saved.usbProductId;
  });
  if (matches.length > 1) {
    throw new Error(`Có nhiều cổng nối tiếp giống nhau, không biết cổng nào là máy in "${saved.label}". Chọn lại máy in và chỉ để một máy in Bluetooth được kết nối.`);
  }
  return matches[0] ?? null;
}

/**
 * Sends bytes to a serial printer: open, write in pieces, close. The port is closed after every job so the
 * operating system can use it again.
 *
 * @param port Allowed port.
 * @param bytes Print job.
 * @throws Error with a readable message when the port cannot be opened or a write fails.
 */
export async function writeToSerialPrinter(port: SerialPort, bytes: Uint8Array): Promise<void> {
  try {
    await port.open({ baudRate: SERIAL_BAUD_RATE });
  } catch (error) {
    throw new Error(`Không mở được máy in (${(error as Error).message}). Kiểm tra máy in đã bật và đã kết nối Bluetooth với thiết bị này.`);
  }
  try {
    if (!port.writable) throw new Error('Cổng này không nhận dữ liệu in. Hãy chọn đúng máy in.');
    const writer = port.writable.getWriter();
    try {
      for (const chunk of splitIntoChunks(bytes, SERIAL_CHUNK_BYTES)) await writer.write(chunk);
      // Closing the writer waits until everything written has been handed to the link.
      await writer.close();
    } catch (error) {
      throw new Error(`Gửi dữ liệu tới máy in thất bại (${(error as Error).message}).`);
    } finally {
      writer.releaseLock();
    }
  } finally {
    // A failed close must not hide the error of the print itself.
    await port.close().catch(() => undefined);
  }
}
