/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPrinterSettings, savePrinterSettings } from './printerSettings';
import { printerKey } from './printerTransport';
import { describeSerialPort, findAllowedSerialPrinter, requestSerialPrinter, toSavedSerialPrinter, writeToSerialPrinter } from './serialTransport';

/** A fake serial port that records what was written and in which order the calls happened. */
function fakePort(options: { info?: SerialPortInfo; failOpen?: boolean; failWriteAt?: number; writable?: boolean } = {}) {
  const events: string[] = [];
  const chunks: number[] = [];
  let writes = 0;
  const writer = {
    write: async (chunk: Uint8Array) => {
      if (options.failWriteAt === writes) throw new Error('link lost');
      writes++;
      chunks.push(chunk.length);
    },
    close: async () => { events.push('writer.close'); },
    releaseLock: () => { events.push('releaseLock'); },
  };
  const port = {
    getInfo: () => options.info ?? {},
    open: async () => {
      if (options.failOpen) throw new Error('busy');
      events.push('open');
    },
    close: async () => { events.push('port.close'); },
    writable: options.writable === false ? null : { getWriter: () => writer },
  };
  return { port: port as unknown as SerialPort, events, chunks };
}

describe('describeSerialPort', () => {
  it('shows ids in hex, or a generic Bluetooth name when the port reports none', () => {
    expect(describeSerialPort({ usbVendorId: 0x0416, usbProductId: 0x5011 })).toBe('Cổng nối tiếp 0416:5011');
    expect(describeSerialPort({})).toBe('Máy in Bluetooth (cổng nối tiếp)');
  });
});

describe('writeToSerialPrinter', () => {
  it('opens, writes in pieces no larger than 512 bytes, closes the writer, releases and closes the port', async () => {
    const { port, events, chunks } = fakePort();
    await writeToSerialPrinter(port, new Uint8Array(1100));
    expect(chunks).toEqual([512, 512, 76]);
    expect(events).toEqual(['open', 'writer.close', 'releaseLock', 'port.close']);
  });

  it('reports a port that cannot be opened, with a Bluetooth hint', async () => {
    const { port } = fakePort({ failOpen: true });
    await expect(writeToSerialPrinter(port, new Uint8Array(1))).rejects.toThrow('Không mở được máy in (busy)');
  });

  it('closes the port and reports the error when a write fails midway', async () => {
    const { port, events } = fakePort({ failWriteAt: 1 });
    await expect(writeToSerialPrinter(port, new Uint8Array(1100))).rejects.toThrow('Gửi dữ liệu tới máy in thất bại (link lost)');
    expect(events).toEqual(['open', 'releaseLock', 'port.close']);
  });

  it('closes the port when it has nothing to write to', async () => {
    const { port, events } = fakePort({ writable: false });
    await expect(writeToSerialPrinter(port, new Uint8Array(1))).rejects.toThrow('không nhận dữ liệu in');
    expect(events).toEqual(['open', 'port.close']);
  });
});

describe('finding an allowed port', () => {
  afterEach(() => { delete (globalThis as any).navigator; });
  const withPorts = (ports: SerialPort[], request?: () => Promise<SerialPort>) => {
    (globalThis as any).navigator = { serial: { getPorts: async () => ports, requestPort: request } };
  };

  it('finds the port with the same ids, or none', async () => {
    const wanted = fakePort({ info: { usbVendorId: 1, usbProductId: 2 } }).port;
    withPorts([fakePort({ info: { usbVendorId: 9, usbProductId: 9 } }).port, wanted]);
    expect(await findAllowedSerialPrinter({ type: 'serial', usbVendorId: 1, usbProductId: 2, label: 'x' })).toBe(wanted);
    expect(await findAllowedSerialPrinter({ type: 'serial', usbVendorId: 5, usbProductId: 5, label: 'x' })).toBeNull();
  });

  it('finds a Bluetooth port that reports no ids when it is the only one', async () => {
    const bluetooth = fakePort().port;
    withPorts([bluetooth]);
    expect(await findAllowedSerialPrinter({ type: 'serial', label: 'Máy in Bluetooth (cổng nối tiếp)' })).toBe(bluetooth);
  });

  it('refuses to guess between several ports without ids', async () => {
    withPorts([fakePort().port, fakePort().port]);
    await expect(findAllowedSerialPrinter({ type: 'serial', label: 'Máy in Bluetooth (cổng nối tiếp)' })).rejects.toThrow('không biết cổng nào');
  });

  it('returns null when the picker is closed, and rethrows other picker errors', async () => {
    withPorts([], async () => { throw new DOMException('closed', 'NotFoundError'); });
    expect(await requestSerialPrinter()).toBeNull();
    withPorts([], async () => { throw new DOMException('blocked', 'SecurityError'); });
    await expect(requestSerialPrinter()).rejects.toThrow('blocked');
  });
});

describe('saved serial printers', () => {
  let values: Record<string, string>;
  beforeEach(() => {
    values = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => { values[key] = value; },
      removeItem: (key: string) => { delete values[key]; },
    };
  });
  afterEach(() => { delete (globalThis as any).localStorage; });

  it('converts a port to a saved printer without ids for Bluetooth', () => {
    expect(toSavedSerialPrinter(fakePort().port)).toEqual({ type: 'serial', usbVendorId: undefined, usbProductId: undefined, label: 'Máy in Bluetooth (cổng nối tiếp)' });
  });

  it('saves and reads a serial printer, and refuses a damaged one', () => {
    savePrinterSettings({ paperWidth: 58, shiftRightMm: 1.5, printKitchenTicket: false, printer: { type: 'serial', label: 'Máy in Bluetooth (cổng nối tiếp)' } });
    expect(getPrinterSettings().printer).toEqual({ type: 'serial', label: 'Máy in Bluetooth (cổng nối tiếp)' });
    values['smartpos.printer'] = '{"paperWidth":58,"printer":{"type":"serial","usbVendorId":"x","label":"a"}}';
    expect(() => getPrinterSettings()).toThrow('Cấu hình máy in bị hỏng');
    values['smartpos.printer'] = '{"paperWidth":58,"printer":{"type":"serial"}}';
    expect(() => getPrinterSettings()).toThrow('Cấu hình máy in bị hỏng');
  });

  it('gives a serial printer and a USB printer different queue keys', () => {
    expect(printerKey({ type: 'serial', label: 'a' })).not.toBe(printerKey({ type: 'usb', vendorId: 0, productId: 0, label: 'a' }));
    expect(printerKey({ type: 'serial', usbVendorId: 1, usbProductId: 2, label: 'a' })).toBe('serial:1:2');
  });
});
