/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, PaymentMethod, PaymentPart } from '../types';

export type SimpleMethod = 'cash' | 'qr' | 'card' | 'wallet';

/** Giá trị `PaymentMethod` ghi trên hóa đơn ứng với từng phương thức thanh toán đơn. */
export const PAYMENT_METHOD_OF: Record<SimpleMethod, PaymentMethod> = {
  cash: PaymentMethod.CASH, qr: PaymentMethod.QR, card: PaymentMethod.CARD, wallet: PaymentMethod.WALLET,
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  qr: 'Chuyển khoản',
  card: 'Thẻ',
  wallet: 'Ví điện tử',
  mixed: 'Kết hợp',
};

/** Các khoản thanh toán thực tế của một đơn (đơn cũ chỉ có 1 phương thức thì coi như thanh toán trọn bằng phương thức đó). */
export function getOrderPayments(order: Pick<Order, 'payments' | 'paymentMethod' | 'totalAmount'>): PaymentPart[] {
  if (order.payments && order.payments.length > 0) return order.payments;
  const method: SimpleMethod = order.paymentMethod === 'qr' || order.paymentMethod === 'card' || order.paymentMethod === 'wallet' ? order.paymentMethod : 'cash';
  return [{ method, amount: order.totalAmount }];
}

/** Số tiền theo từng phương thức khi thanh toán kết hợp; `wallet` bỏ trống = 0. */
export interface MixedInput { cash: number; qr: number; card: number; wallet?: number }

export interface MixedResult {
  valid: boolean;
  error?: string;
  /** Tiền thừa trả khách (chỉ phát sinh từ phần tiền mặt). */
  change: number;
  /** Tổng tiền khách đưa ra. */
  received: number;
  /** Các khoản được ghi nhận cho đơn (tiền mặt đã trừ tiền thừa). */
  parts: PaymentPart[];
}

/**
 * Thanh toán kết hợp: chuyển khoản + thẻ + ví điện tử không được vượt quá số cần trả; phần còn lại phải do tiền mặt đáp ứng,
 * tiền mặt đưa dư thì thừa được trả lại khách.
 */
export function applyMixedPayment(total: number, input: MixedInput): MixedResult {
  const cash = Math.max(0, input.cash || 0);
  const qr = Math.max(0, input.qr || 0);
  const card = Math.max(0, input.card || 0);
  const wallet = Math.max(0, input.wallet || 0);
  const received = cash + qr + card + wallet;
  const nonCash = qr + card + wallet;

  if (nonCash > total) {
    return { valid: false, error: 'Chuyển khoản + thẻ + ví điện tử vượt quá số tiền khách cần trả.', change: 0, received, parts: [] };
  }
  const cashNeeded = total - nonCash;
  if (cash < cashNeeded) {
    return { valid: false, error: `Còn thiếu ${(cashNeeded - cash).toLocaleString('vi-VN')} đ.`, change: 0, received, parts: [] };
  }
  const parts: PaymentPart[] = [];
  if (cashNeeded > 0) parts.push({ method: 'cash', amount: cashNeeded });
  if (qr > 0) parts.push({ method: 'qr', amount: qr });
  if (card > 0) parts.push({ method: 'card', amount: card });
  if (wallet > 0) parts.push({ method: 'wallet', amount: wallet });
  return { valid: true, change: cash - cashNeeded, received, parts };
}
