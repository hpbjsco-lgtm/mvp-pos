/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order } from '../types';
import { PAYMENT_LABELS } from '../utils/payments';

/** Horizontal alignment of a block. */
export type ReceiptAlign = 'left' | 'center' | 'right';

/** Text size steps; the renderer maps them to pixel sizes. */
export type ReceiptTextSize = 'small' | 'normal' | 'large';

/** One element of a receipt, from top to bottom. The renderer draws them; this module only decides what they say. */
export type ReceiptBlock =
  | { kind: 'text'; text: string; align: ReceiptAlign; size: ReceiptTextSize; bold?: boolean }
  | { kind: 'row'; left: string; right: string; size: ReceiptTextSize; bold?: boolean }
  | { kind: 'divider' }
  | { kind: 'spacer'; dots: number }
  | { kind: 'image'; dataUrl: string; widthDots: number; align: ReceiptAlign; smooth: boolean };

/** A receipt as a list of blocks, independent of paper width and printer. */
export interface ReceiptDocument {
  blocks: ReceiptBlock[];
}

/** Bank transfer details printed with a QR code on a provisional bill. */
export interface ReceiptTransfer {
  bankName: string;
  accountNumber: string;
  holder: string;
  /** Amount to pay; absent on a paid receipt, where the QR code only shows the store's account. */
  amount?: number;
  /** The QR code as a data URL; the caller generates it so this module stays free of I/O. */
  qrDataUrl: string;
}

/** Everything needed to lay out one receipt. */
export interface ReceiptInput {
  order: Order;
  storeInfo: { name: string; address: string; phone: string; storeType: 'fnb' | 'retail' };
  /** Name of the cashier shown on the bill. */
  staffName: string;
  /** `provisional` is the bill before payment: no tendered amount, change or points. */
  variant: 'final' | 'provisional';
  transfer?: ReceiptTransfer;
  /** Store logo as a data URL; omitted when the store has none. */
  logoDataUrl?: string;
}

/** Width of the logo in dots; the renderer shrinks it further if the paper is narrower. */
const LOGO_WIDTH_DOTS = 200;

/** Width of the transfer QR code in dots. */
const QR_WIDTH_DOTS = 220;

/**
 * Formats an amount of money the way the on-screen receipt does, for example "159.000 đ".
 *
 * @param amount Amount in dong.
 * @returns The formatted text.
 */
export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} đ`;
}

/**
 * Lays out a receipt as blocks, with the same content as the on-screen receipt (`ReceiptThermal`) except
 * for the decorative pseudo barcode, which is not scannable and is left out.
 *
 * @param input Order, store, cashier and print options.
 * @returns The receipt blocks, top to bottom.
 */
export function buildReceiptDocument(input: ReceiptInput): ReceiptDocument {
  const { order, storeInfo, staffName, variant, transfer, logoDataUrl } = input;
  const provisional = variant === 'provisional';
  const blocks: ReceiptBlock[] = [];
  const text = (value: string, options: { align?: ReceiptAlign; size?: ReceiptTextSize; bold?: boolean } = {}) => {
    blocks.push({ kind: 'text', text: value, align: options.align ?? 'left', size: options.size ?? 'normal', bold: options.bold });
  };
  const row = (left: string, right: string, options: { size?: ReceiptTextSize; bold?: boolean } = {}) => {
    blocks.push({ kind: 'row', left, right, size: options.size ?? 'normal', bold: options.bold });
  };
  const divider = () => blocks.push({ kind: 'divider' });
  const spacer = (dots = 8) => blocks.push({ kind: 'spacer', dots });

  if (logoDataUrl) {
    blocks.push({ kind: 'image', dataUrl: logoDataUrl, widthDots: LOGO_WIDTH_DOTS, align: 'center', smooth: true });
    spacer();
  }
  text(storeInfo.name.toUpperCase(), { align: 'center', size: 'large', bold: true });
  if (storeInfo.address) text(storeInfo.address, { align: 'center', size: 'small' });
  if (storeInfo.phone) text(`SĐT: ${storeInfo.phone}`, { align: 'center', size: 'small' });
  spacer(8);

  text(provisional ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN THANH TOÁN', { align: 'center', bold: true });
  text(`Số: ${order.orderNumber}`, { align: 'center', size: 'small' });
  text(`Ngày: ${new Date(order.createdAt).toLocaleString('vi-VN')}`, { align: 'center', size: 'small' });
  divider();

  row('Thu ngân:', staffName);
  if (order.tableNumber) row('Bàn:', order.tableNumber, { bold: true });
  if (order.orderType) row('Hình thức:', order.orderType === 'dine-in' ? 'Ăn tại bàn' : 'Mang về');
  row('Khách hàng:', order.customerName || (order.customerId && order.customerId !== 'walk-in' ? 'Thành viên' : 'Khách vãng lai'));
  divider();

  if (order.note) {
    text(`Ghi chú đơn: ${order.note}`, { size: 'small' });
    spacer(3);
  }

  for (const item of order.items) {
    text(item.name, { bold: true });
    row(`${item.quantity} x ${item.price.toLocaleString('vi-VN')}`, formatMoney(item.price * item.quantity));
    if (item.toppings && item.toppings.length > 0) {
      text(item.toppings.map(topping => `+ ${topping.quantity} ${topping.name}`).join(', '), { size: 'small' });
    }
    const modifiers = [item.size, item.sugarLevel && `Đường ${item.sugarLevel}`, item.iceLevel && `Đá ${item.iceLevel}`]
      .filter(Boolean)
      .join(' - ');
    if (modifiers) text(`Tùy chọn: ${modifiers}`, { size: 'small' });
    if (item.note) text(`Ghi chú: ${item.note}`, { size: 'small' });
    if (item.batchCode) text(`Lô: ${item.batchCode}`, { size: 'small' });
    spacer(3);
  }
  divider();

  if (order.subtotal !== undefined && (order.discountAmount || order.taxAmount)) {
    row('Tạm tính:', formatMoney(order.subtotal), { size: 'small' });
    if (order.discountAmount) row('Giảm giá:', `-${formatMoney(order.discountAmount)}`, { size: 'small' });
    if (order.taxAmount) row('Thuế VAT:', `+${formatMoney(order.taxAmount)}`, { size: 'small' });
  }
  row('TỔNG CỘNG:', formatMoney(order.totalAmount), { size: 'large', bold: true });

  if (!provisional) {
    if (order.payments && order.payments.length > 1) {
      for (const payment of order.payments) row(`${PAYMENT_LABELS[payment.method]}:`, formatMoney(payment.amount), { size: 'small' });
      row('Khách đưa (kết hợp):', formatMoney(order.paidAmount), { size: 'small' });
    } else {
      const methodLabel = order.paymentMethod === 'cash' ? 'Tiền mặt' : order.paymentMethod === 'qr' ? 'Chuyển khoản QR' : order.paymentMethod === 'wallet' ? 'Ví điện tử' : 'Thẻ ngân hàng';
      row(`Khách đưa (${methodLabel}):`, formatMoney(order.paidAmount), { size: 'small' });
    }
    row('Tiền trả lại:', formatMoney(order.changeAmount), { size: 'small' });
    if (order.customerPointsEarned && order.customerPointsEarned > 0) {
      row('Điểm tích lũy cộng thêm:', `+${order.customerPointsEarned} điểm`, { size: 'small' });
    }
  }
  divider();

  if (transfer) {
    text(provisional ? 'QUÉT MÃ ĐỂ CHUYỂN KHOẢN' : 'TÀI KHOẢN NGÂN HÀNG CỦA CỬA HÀNG', { align: 'center', size: 'small', bold: true });
    blocks.push({ kind: 'image', dataUrl: transfer.qrDataUrl, widthDots: QR_WIDTH_DOTS, align: 'center', smooth: false });
    text(transfer.bankName, { align: 'center', size: 'small' });
    text(transfer.accountNumber, { align: 'center', bold: true });
    text(transfer.holder, { align: 'center', size: 'small' });
    if (transfer.amount !== undefined) text(`Số tiền: ${formatMoney(transfer.amount)}`, { align: 'center', size: 'small', bold: true });
    spacer(6);
  }

  text(provisional ? 'Phiếu tạm tính, chưa phải hóa đơn thanh toán.' : 'Cảm ơn Quý Khách đã ủng hộ!', { align: 'center', size: 'small' });
  if (!provisional) text('Hẹn gặp lại quý khách lần sau.', { align: 'center', size: 'small' });
  return { blocks };
}
