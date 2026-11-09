import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPrinterSettings, getPrinterSettings, savePrinterSettings } from './printerSettings';
import { describeUsbDevice, findWriteTarget, splitIntoChunks } from './usbTransport';

/** Builds a fake USB configuration: each entry is an interface with its alternates' class and endpoints. */
const configuration = (...interfaces: { number: number; cls: number; endpoints: { n: number; dir: 'in' | 'out'; type: string }[] }[]) => ({
  interfaces: interfaces.map(i => ({
    interfaceNumber: i.number,
    alternates: [{ alternateSetting: 0, interfaceClass: i.cls, endpoints: i.endpoints.map(e => ({ endpointNumber: e.n, direction: e.dir, type: e.type })) }],
  })),
}) as unknown as Parameters<typeof findWriteTarget>[0];

describe('findWriteTarget', () => {
  it('picks the bulk OUT endpoint of the printer-class interface', () => {
    const target = findWriteTarget(configuration(
      { number: 0, cls: 7, endpoints: [{ n: 1, dir: 'in', type: 'bulk' }, { n: 2, dir: 'out', type: 'bulk' }] },
    ));
    expect(target).toEqual({ interfaceNumber: 0, alternateSetting: 0, endpointNumber: 2 });
  });
  it('prefers the printer class over another interface with a bulk OUT endpoint', () => {
    const target = findWriteTarget(configuration(
      { number: 0, cls: 255, endpoints: [{ n: 1, dir: 'out', type: 'bulk' }] },
      { number: 1, cls: 7, endpoints: [{ n: 3, dir: 'out', type: 'bulk' }] },
    ));
    expect(target?.interfaceNumber).toBe(1);
  });
  it('falls back to a vendor-class interface and ignores interrupt endpoints', () => {
    expect(findWriteTarget(configuration({ number: 0, cls: 255, endpoints: [{ n: 4, dir: 'out', type: 'bulk' }] }))?.endpointNumber).toBe(4);
    expect(findWriteTarget(configuration({ number: 0, cls: 7, endpoints: [{ n: 1, dir: 'out', type: 'interrupt' }] }))).toBeNull();
  });
});

describe('splitIntoChunks', () => {
  it('covers all bytes in order with pieces no larger than the size', () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, i) => i);
    const chunks = splitIntoChunks(bytes, 4);
    expect(chunks.map(c => c.length)).toEqual([4, 4, 2]);
    expect(chunks.flatMap(c => Array.from(c))).toEqual(Array.from(bytes));
  });
  it('returns no pieces for empty data', () => expect(splitIntoChunks(new Uint8Array(0))).toEqual([]));
});

describe('describeUsbDevice', () => {
  it('uses the names, or the ids in hex when there is no name', () => {
    expect(describeUsbDevice({ manufacturerName: 'SUPERISC', productName: 'S31', vendorId: 1, productId: 2 })).toBe('SUPERISC S31');
    expect(describeUsbDevice({ manufacturerName: undefined, productName: undefined, vendorId: 0x0416, productId: 0x5011 })).toBe('USB 0416:5011');
  });
});

describe('printer settings storage', () => {
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

  it('defaults to 58 mm without a printer', () => expect(getPrinterSettings()).toEqual({ paperWidth: 58, shiftRightMm: 1.5, printKitchenTicket: false }));
  it('saves and reads the chosen printer and paper width', () => {
    savePrinterSettings({ paperWidth: 80, shiftRightMm: 3, printKitchenTicket: true, usb: { vendorId: 1, productId: 2, label: 'S31' } });
    expect(getPrinterSettings()).toEqual({ paperWidth: 80, shiftRightMm: 3, printKitchenTicket: true, usb: { vendorId: 1, productId: 2, label: 'S31' } });
    clearPrinterSettings();
    expect(getPrinterSettings()).toEqual({ paperWidth: 58, shiftRightMm: 1.5, printKitchenTicket: false });
  });
  it('fails loudly on a damaged value', () => {
    values['smartpos.printer'] = '{"paperWidth":99}';
    expect(() => getPrinterSettings()).toThrow('bị hỏng');
    values['smartpos.printer'] = '{"paperWidth":58,"usb":{"vendorId":"x"}}';
    expect(() => getPrinterSettings()).toThrow('bị hỏng');
    values['smartpos.printer'] = '{"paperWidth":58,"shiftRightMm":50}';
    expect(() => getPrinterSettings()).toThrow('bị hỏng');
    values['smartpos.printer'] = '{"paperWidth":58,"printKitchenTicket":"yes"}';
    expect(() => getPrinterSettings()).toThrow('bị hỏng');
  });
  it('uses the default shift for settings saved before the shift existed', () => {
    values['smartpos.printer'] = '{"paperWidth":80}';
    expect(getPrinterSettings()).toEqual({ paperWidth: 80, shiftRightMm: 1.5, printKitchenTicket: false, usb: undefined });
  });

  it('saves and reads a separate kitchen printer, and refuses a damaged kitchen entry', () => {
    savePrinterSettings({ paperWidth: 58, shiftRightMm: 1.5, printKitchenTicket: true, usb: { vendorId: 1, productId: 2, label: 'S31' }, kitchenUsb: { vendorId: 3, productId: 4, label: 'Bep' } });
    expect(getPrinterSettings().kitchenUsb).toEqual({ vendorId: 3, productId: 4, label: 'Bep' });
    values['smartpos.printer'] = '{"paperWidth":58,"kitchenUsb":{"vendorId":"x"}}';
    expect(() => getPrinterSettings()).toThrow('Cấu hình máy in bị hỏng');
  });
});
