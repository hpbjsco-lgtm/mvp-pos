/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenStatus } from '../types';
import { printKitchenTicketIfEnabled } from './kitchenPrinting';
import { savePrinterSettings, type SavedUsbPrinter } from './printerSettings';
import { canPrintDirectly, printReceipt } from './receiptPrinting';
import type { ReceiptDocument } from './receiptDocument';

/** Records which printer got which job, and lets a test hold a job open. */
const written: Array<{ device: string; job: string }> = [];
let gates: Array<() => void> = [];
let holdFirstJobOf: string | null = null;

vi.mock('./usbTransport', () => ({
  isWebUsbSupported: () => true,
  findAllowedUsbPrinter: async (saved: SavedUsbPrinter) => (saved.label === 'missing' ? null : { label: saved.label }),
  writeToUsbPrinter: async (device: { label: string }, bytes: Uint8Array) => {
    if (holdFirstJobOf === device.label) {
      holdFirstJobOf = null;
      await new Promise<void>(resolve => gates.push(resolve));
    }
    written.push({ device: device.label, job: new TextDecoder().decode(bytes) });
  },
}));
vi.mock('./receiptRenderer', () => ({ renderReceiptToBitmap: async (receipt: ReceiptDocument) => ({ title: receipt.blocks.length }) }));
vi.mock('./escpos', async importOriginal => ({
  ...(await importOriginal<typeof import('./escpos')>()),
  buildReceiptJob: (bitmap: { title: number }) => new TextEncoder().encode(`job${bitmap.title}`),
}));

/** A saved printer; each label is a different physical printer (own product id). */
const productIds = new Map<string, number>();
const printer = (label: string): SavedUsbPrinter => {
  if (!productIds.has(label)) productIds.set(label, productIds.size + 1);
  return { vendorId: 1, productId: productIds.get(label)!, label };
};
const document = (blocks: number): ReceiptDocument => ({ blocks: Array.from({ length: blocks }, () => ({ kind: 'text', text: 'x' })) } as unknown as ReceiptDocument);

describe('which printer a print goes to', () => {
  let values: Record<string, string>;
  beforeEach(() => {
    values = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => { values[key] = value; },
      removeItem: (key: string) => { delete values[key]; },
    };
    written.length = 0;
    gates = [];
    holdFirstJobOf = null;
  });
  afterEach(() => { delete (globalThis as any).localStorage; });

  const settings = (extra: object) => savePrinterSettings({ paperWidth: 58, shiftRightMm: 0, printKitchenTicket: true, ...extra });

  it('sends a kitchen ticket to the kitchen printer and a receipt to the receipt printer', async () => {
    settings({ usb: printer('counter'), kitchenUsb: printer('kitchen') });
    await printReceipt(document(1), 'kitchen');
    await printReceipt(document(2));
    expect(written.map(entry => entry.device)).toEqual(['kitchen', 'counter']);
  });

  it('prints kitchen tickets on the receipt printer when no kitchen printer is chosen', async () => {
    settings({ usb: printer('counter') });
    await printReceipt(document(1), 'kitchen');
    expect(written.map(entry => entry.device)).toEqual(['counter']);
  });

  it('prints kitchen tickets even when only the kitchen printer is chosen', async () => {
    settings({ kitchenUsb: printer('kitchen') });
    expect(canPrintDirectly('kitchen')).toBe(true);
    expect(canPrintDirectly('receipt')).toBe(false);
    await printReceipt(document(1), 'kitchen');
    expect(written.map(entry => entry.device)).toEqual(['kitchen']);
    await expect(printReceipt(document(1))).rejects.toThrow('Chưa chọn máy in');
  });

  it('keeps jobs of one printer in order, while another printer is not held up', async () => {
    settings({ usb: printer('counter'), kitchenUsb: printer('kitchen') });
    holdFirstJobOf = 'kitchen';
    const firstKitchen = printReceipt(document(1), 'kitchen');
    const secondKitchen = printReceipt(document(2), 'kitchen');
    const receipt = printReceipt(document(3));
    await receipt;
    // The receipt printed although the kitchen printer is busy, and the second kitchen job waits for the first.
    expect(written.map(entry => entry.device)).toEqual(['counter']);
    gates.forEach(open => open());
    await Promise.all([firstKitchen, secondKitchen]);
    expect(written.filter(entry => entry.device === 'kitchen').map(entry => entry.job)).toEqual(['job1', 'job2']);
  });

  it('reports a kitchen printer that is not connected by its name', async () => {
    settings({ usb: printer('counter'), kitchenUsb: printer('missing') });
    await expect(printReceipt(document(1), 'kitchen')).rejects.toThrow('Không thấy máy in "missing"');
  });

  it('prints the kitchen ticket through the kitchen printer only when "print kitchen tickets" is on', async () => {
    const items = [{ id: 'k', orderId: 'NB', productId: 'p', productName: 'Phở', quantity: 1, status: KitchenStatus.PENDING, createdAt: '2026-11-01T10:00:00Z' }];
    const input = { tableName: 'Bàn 1', staffName: 'An', items, sentAt: new Date() };
    settings({ usb: printer('counter'), kitchenUsb: printer('kitchen'), printKitchenTicket: false });
    expect(await printKitchenTicketIfEnabled(input)).toBe(false);
    settings({ usb: printer('counter'), kitchenUsb: printer('kitchen'), printKitchenTicket: true });
    expect(await printKitchenTicketIfEnabled(input)).toBe(true);
    expect(written.map(entry => entry.device)).toEqual(['kitchen']);
  });
});
