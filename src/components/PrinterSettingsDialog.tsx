/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PAPER_WIDTH_DOTS, PaperWidthMm } from '../printing/escpos';
import { clearPrinterSettings, DEFAULT_PRINTER_SETTINGS, getPrinterSettings, MAX_SHIFT_RIGHT_MM, PrinterSettings, savePrinterSettings } from '../printing/printerSettings';
import { buildReceiptDocument } from '../printing/receiptDocument';
import { printReceipt } from '../printing/receiptPrinting';
import { isWebUsbSupported, requestUsbPrinter, toSavedUsbPrinter } from '../printing/usbTransport';
import { buildKitchenTicketDocument } from '../printing/kitchenTicketDocument';
import { KitchenStatus, PaymentMethod } from '../types';

interface PrinterSettingsDialogProps {
  onClose: () => void;
}

/** Result line shown at the bottom of the dialog. */
interface StatusMessage {
  ok: boolean;
  text: string;
}

/**
 * Reads the settings without throwing, so a damaged value can still be fixed in this dialog.
 *
 * @returns The saved settings, or the defaults when the saved value is damaged.
 */
function readSettings(): { settings: PrinterSettings; error: string | null } {
  try {
    return { settings: getPrinterSettings(), error: null };
  } catch (error) {
    return { settings: { ...DEFAULT_PRINTER_SETTINGS }, error: (error as Error).message };
  }
}

/** Sample receipt for the test print. */
const TEST_RECEIPT = buildReceiptDocument({
  order: {
    id: 'test', orderNumber: 'IN-THU', totalAmount: 58000, paymentMethod: PaymentMethod.CASH, paidAmount: 100000, changeAmount: 42000,
    staffId: 'test', createdAt: new Date().toISOString(),
    items: [{ productId: 'test', name: 'Cà phê sữa đá (in thử tiếng Việt có dấu)', quantity: 2, price: 29000 }],
  },
  storeInfo: { name: 'In thử máy in', address: 'Kiểm tra khổ giấy và chữ có dấu', phone: '', storeType: 'fnb' },
  staffName: 'Hệ thống',
  variant: 'final',
});

/** Sample kitchen ticket for the test print of the kitchen printer. */
const TEST_KITCHEN_TICKET = buildKitchenTicketDocument({
  tableName: 'In thử', staffName: 'Hệ thống', sentAt: new Date(),
  items: [{
    id: 'test', orderId: 'test', productId: 'test', productName: 'Cà phê sữa đá (in thử tiếng Việt có dấu)', quantity: 2,
    status: KitchenStatus.PENDING, size: 'Lớn', note: 'Ít đá', createdAt: new Date().toISOString(),
  }],
});

/**
 * Dialog to choose the receipt printer of this device (USB), set the paper width and print a test receipt.
 * The choice is stored in this browser only.
 */
export default function PrinterSettingsDialog({ onClose }: PrinterSettingsDialogProps) {
  const initial = readSettings();
  const [settings, setSettings] = useState<PrinterSettings>(initial.settings);
  const [message, setMessage] = useState<StatusMessage | null>(initial.error ? { ok: false, text: initial.error } : null);
  const [busy, setBusy] = useState(false);
  /** Whether kitchen tickets use a printer of their own (true as soon as one is chosen, and while choosing). */
  const [separateKitchenPrinter, setSeparateKitchenPrinter] = useState(initial.settings.kitchenPrinter !== undefined);

  /**
   * Runs an action while the buttons are disabled and shows a failure as a message.
   *
   * @param action Work to run.
   */
  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Saves new settings and shows them.
   *
   * @param next Settings to keep.
   */
  const update = (next: PrinterSettings) => {
    savePrinterSettings(next);
    setSettings(next);
  };

  /**
   * Opens the browser's USB picker and keeps the chosen printer.
   *
   * @param showAllDevices True to list every USB device, not only printers.
   */
  const choosePrinter = (showAllDevices: boolean) => withBusy(async () => {
    const device = await requestUsbPrinter(showAllDevices);
    if (!device) return;
    const printer = toSavedUsbPrinter(device);
    update({ ...settings, printer });
    setMessage({ ok: true, text: `Đã chọn máy in: ${printer.label}. Bấm "In thử" để kiểm tra.` });
  });

  /** Opens the browser's USB picker and keeps the chosen printer for kitchen tickets. */
  const chooseKitchenPrinter = () => withBusy(async () => {
    const device = await requestUsbPrinter(false);
    if (!device) return;
    const kitchenPrinter = toSavedUsbPrinter(device);
    update({ ...settings, kitchenPrinter });
    setMessage({ ok: true, text: `Đã chọn máy in phiếu bếp: ${kitchenPrinter.label}. Bấm "In thử phiếu bếp" để kiểm tra.` });
  });

  /**
   * Switches kitchen tickets between the receipt printer and a printer of their own.
   *
   * @param separate True for a printer of their own.
   */
  const useSeparateKitchenPrinter = (separate: boolean) => {
    setSeparateKitchenPrinter(separate);
    if (!separate && settings.kitchenPrinter) update({ ...settings, kitchenPrinter: undefined });
  };

  /** Prints a sample kitchen ticket on the printer kitchen tickets use. */
  const printKitchenTest = () => withBusy(async () => {
    await printReceipt(TEST_KITCHEN_TICKET, 'kitchen');
    setMessage({ ok: true, text: 'Đã gửi phiếu bếp in thử.' });
  });

  /** Forgets the chosen printers and the paper width. */
  const forget = () => {
    clearPrinterSettings();
    setSeparateKitchenPrinter(false);
    setSettings({ ...DEFAULT_PRINTER_SETTINGS });
    setMessage({ ok: true, text: 'Đã bỏ chọn máy in trên thiết bị này.' });
  };

  /** Prints the sample receipt. */
  const printTest = () => withBusy(async () => {
    await printReceipt(TEST_RECEIPT);
    setMessage({ ok: true, text: 'Đã gửi lệnh in. Nếu giấy không ra hoặc ra ký tự lạ, chụp ảnh và gửi lại để kiểm tra.' });
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-outline-variant flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-on-surface">Máy in hóa đơn</h3>
          <button onClick={onClose} className="m3-icon-btn" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {!isWebUsbSupported() ? (
            <p className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold">
              Trình duyệt này không in trực tiếp được. Hãy mở bằng Chrome hoặc Edge.
            </p>
          ) : (
            <>
              <section className="space-y-2">
                <h4 className="text-base font-bold text-on-surface">Máy in đang dùng</h4>
                <p className="text-sm text-on-surface-variant">
                  {settings.printer ? <strong className="text-on-surface">{settings.printer.label}</strong> : 'Chưa chọn máy in. Cắm dây USB, bật máy in rồi bấm "Chọn máy in".'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => choosePrinter(false)} className="m3-btn-filled !min-h-11 text-sm">Chọn máy in</button>
                  {settings.printer && (
                    <button type="button" disabled={busy} onClick={forget} className="m3-btn-outlined !min-h-11 text-sm">Bỏ chọn</button>
                  )}
                </div>
                <button type="button" disabled={busy} onClick={() => choosePrinter(true)} className="text-sm text-primary font-semibold underline cursor-pointer">
                  Không thấy máy in? Hiện mọi thiết bị USB
                </button>
              </section>

              <section className="space-y-2">
                <label htmlFor="paper-width" className="text-base font-bold text-on-surface block">Khổ giấy</label>
                <select
                  id="paper-width"
                  value={settings.paperWidth}
                  onChange={e => update({ ...settings, paperWidth: Number(e.target.value) as PaperWidthMm })}
                  className="m3-input"
                >
                  {(Object.keys(PAPER_WIDTH_DOTS) as unknown as PaperWidthMm[]).map(width => (
                    <option key={width} value={width}>{width} mm</option>
                  ))}
                </select>
              </section>

              <section className="space-y-2">
                <label htmlFor="shift-right" className="text-base font-bold text-on-surface block">Dịch nội dung sang phải (mm)</label>
                <input
                  id="shift-right"
                  type="number"
                  min={0}
                  max={MAX_SHIFT_RIGHT_MM}
                  step={0.5}
                  value={settings.shiftRightMm}
                  onChange={e => {
                    const value = Number(e.target.value);
                    if (value >= 0 && value <= MAX_SHIFT_RIGHT_MM) update({ ...settings, shiftRightMm: value });
                  }}
                  className="m3-input"
                />
                <p className="text-sm text-on-surface-variant">Tăng số này nếu chữ bị lệch về bên trái giấy. In thử lại để xem.</p>
              </section>

              <section className="space-y-3 border-t border-outline-variant pt-4">
                <h4 className="text-base font-bold text-on-surface">Phiếu bếp</h4>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.printKitchenTicket}
                    onChange={e => update({ ...settings, printKitchenTicket: e.target.checked })}
                    className="mt-1 w-5 h-5 accent-primary"
                  />
                  <span className="text-sm text-on-surface">
                    <strong className="block text-base">In phiếu bếp khi báo bếp</strong>
                    Mỗi lần báo bếp ở máy này, in một phiếu gồm bàn, món, số lượng và ghi chú.
                  </span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="radio" name="kitchen-printer" checked={!separateKitchenPrinter} onChange={() => useSeparateKitchenPrinter(false)} className="mt-1 w-5 h-5 accent-primary" />
                    <span className="text-sm text-on-surface">Dùng chung máy in hóa đơn</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="radio" name="kitchen-printer" checked={separateKitchenPrinter} onChange={() => useSeparateKitchenPrinter(true)} className="mt-1 w-5 h-5 accent-primary" />
                    <span className="text-sm text-on-surface">Máy in riêng cho phiếu bếp (dùng cùng khổ giấy)</span>
                  </label>
                </div>
                {separateKitchenPrinter && (
                  <div className="space-y-2 pl-8">
                    <p className="text-sm text-on-surface-variant">
                      {settings.kitchenPrinter ? <strong className="text-on-surface">{settings.kitchenPrinter.label}</strong> : 'Chưa chọn máy in bếp. Cắm dây USB, bật máy in rồi bấm "Chọn máy in bếp".'}
                    </p>
                    <button type="button" disabled={busy} onClick={chooseKitchenPrinter} className="m3-btn-outlined !min-h-11 text-sm">Chọn máy in bếp</button>
                  </div>
                )}
                <button type="button" disabled={busy || !(settings.kitchenPrinter ?? settings.printer)} onClick={printKitchenTest} className="m3-btn-tonal w-full !min-h-12 disabled:opacity-50">
                  In thử phiếu bếp
                </button>
              </section>

              <button type="button" disabled={busy || !settings.printer} onClick={printTest} className="m3-btn-tonal w-full !min-h-12 disabled:opacity-50">
                {busy ? 'Đang gửi...' : 'In thử'}
              </button>
            </>
          )}

          {message && (
            <p className={`text-sm font-semibold rounded-xl p-3 ${message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
