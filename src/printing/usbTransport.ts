/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedUsbPrinter } from './printerSettings';

/** USB interface class of printers. */
const PRINTER_INTERFACE_CLASS = 7;

/** Bytes per USB transfer. Small printers have small buffers, so data is sent in pieces and each piece is awaited. */
const TRANSFER_CHUNK_BYTES = 4096;

/** Where to write on a printer: the interface to claim and the bulk OUT endpoint on it. */
export interface UsbWriteTarget {
  interfaceNumber: number;
  alternateSetting: number;
  endpointNumber: number;
}

/**
 * Finds the interface and endpoint that receive print data. A printer-class interface is preferred;
 * otherwise the first interface with a bulk OUT endpoint is used (some printers report a vendor class).
 *
 * @param configuration USB configuration of the device.
 * @returns The target, or null when no interface has a bulk OUT endpoint.
 */
export function findWriteTarget(configuration: Pick<USBConfiguration, 'interfaces'>): UsbWriteTarget | null {
  const candidates: { target: UsbWriteTarget; isPrinterClass: boolean }[] = [];
  for (const usbInterface of configuration.interfaces) {
    for (const alternate of usbInterface.alternates) {
      const endpoint = alternate.endpoints.find(item => item.direction === 'out' && item.type === 'bulk');
      if (endpoint) {
        candidates.push({
          target: { interfaceNumber: usbInterface.interfaceNumber, alternateSetting: alternate.alternateSetting, endpointNumber: endpoint.endpointNumber },
          isPrinterClass: alternate.interfaceClass === PRINTER_INTERFACE_CLASS,
        });
      }
    }
  }
  return (candidates.find(item => item.isPrinterClass) ?? candidates[0])?.target ?? null;
}

/**
 * Splits data into pieces for USB transfers.
 *
 * @param bytes Data to split.
 * @param size Largest piece, in bytes.
 * @returns The pieces, in order, together covering all bytes.
 */
export function splitIntoChunks(bytes: Uint8Array, size: number = TRANSFER_CHUNK_BYTES): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += size) chunks.push(bytes.subarray(start, start + size));
  return chunks;
}

/**
 * @returns True when this browser can talk to USB devices (Chrome or Edge on a secure page).
 */
export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Text for a USB device in lists and messages.
 *
 * @param device Device to describe.
 * @returns The product name, or the vendor and product ids when the device has no name.
 */
export function describeUsbDevice(device: Pick<USBDevice, 'productName' | 'manufacturerName' | 'vendorId' | 'productId'>): string {
  const name = [device.manufacturerName, device.productName].filter(Boolean).join(' ');
  return name || `USB ${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}`;
}

/**
 * Opens the browser's device picker so the person allows one USB device. Must be called from a click.
 *
 * @param showAllDevices False lists only printer-class devices; true lists every USB device, for printers that report a vendor class.
 * @returns The chosen device, or null when the person closed the picker.
 */
export async function requestUsbPrinter(showAllDevices: boolean): Promise<USBDevice | null> {
  try {
    return await navigator.usb.requestDevice({ filters: showAllDevices ? [] : [{ classCode: PRINTER_INTERFACE_CLASS }] });
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null;
    throw error;
  }
}

/**
 * Converts a device to the identity kept in the settings.
 *
 * @param device Chosen device.
 * @returns Saved identity.
 */
export function toSavedUsbPrinter(device: USBDevice): SavedUsbPrinter {
  return { type: 'usb', vendorId: device.vendorId, productId: device.productId, serialNumber: device.serialNumber ?? undefined, label: describeUsbDevice(device) };
}

/**
 * Finds a printer the browser already has permission for.
 *
 * @param saved Identity from the settings.
 * @returns The device, or null when it is not connected or the permission was removed.
 */
export async function findAllowedUsbPrinter(saved: SavedUsbPrinter): Promise<USBDevice | null> {
  const devices = await navigator.usb.getDevices();
  return devices.find(device =>
    device.vendorId === saved.vendorId
    && device.productId === saved.productId
    && (!saved.serialNumber || device.serialNumber === saved.serialNumber)) ?? null;
}

/**
 * Sends bytes to a USB printer: open, claim the interface, write in pieces, release and close.
 * The device is released after every job so the operating system can use it again.
 *
 * @param device Allowed printer.
 * @param bytes Print job.
 * @throws Error with a readable message when the printer cannot be opened or claimed, or a transfer fails.
 */
export async function writeToUsbPrinter(device: USBDevice, bytes: Uint8Array): Promise<void> {
  try {
    await device.open();
  } catch (error) {
    throw new Error(`Không mở được máy in (${(error as Error).message}). Kiểm tra dây USB và nguồn máy in.`);
  }
  try {
    if (device.configuration === null) await device.selectConfiguration(1);
    const target = device.configuration ? findWriteTarget(device.configuration) : null;
    if (!target) throw new Error('Thiết bị USB này không có cổng nhận dữ liệu in. Hãy chọn đúng máy in.');
    try {
      await device.claimInterface(target.interfaceNumber);
    } catch (error) {
      throw new Error(
        `Hệ điều hành đang giữ máy in (${(error as Error).message}). `
        + 'Trên Mac: mở Cài đặt hệ thống, Máy in và máy quét, xóa máy in này khỏi danh sách rồi thử lại.');
    }
    try {
      if (target.alternateSetting !== 0) await device.selectAlternateInterface(target.interfaceNumber, target.alternateSetting);
      for (const chunk of splitIntoChunks(bytes)) {
        const result = await device.transferOut(target.endpointNumber, chunk);
        if (result.status !== 'ok') throw new Error(`Máy in từ chối dữ liệu (trạng thái ${result.status}).`);
      }
    } finally {
      // A failed release must not hide the error of the print itself.
      await device.releaseInterface(target.interfaceNumber).catch(() => undefined);
    }
  } finally {
    await device.close().catch(() => undefined);
  }
}
