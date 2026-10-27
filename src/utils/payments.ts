/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, PaymentPart } from '../types';

export type SimpleMethod = 'cash' | 'qr' | 'card';

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  qr: 'Chuyển khoản',
  card: 'Thẻ',
  mixed: 'Kết hợp',
};

/** Các khoản thanh toán thực tế của một đơn (đơn cũ chỉ có 1 phương thức thì coi như thanh toán trọn bằng phương thức đó). */
export function getOrderPayments(order: Pick<Order, 'payments' | 'paymentMethod' | 'totalAmount'>): PaymentPart[] {
  if (order.payments && order.payments.length > 0) return order.payments;
  const method = order.paymentMethod === 'qr' || order.paymentMethod === 'card' ? order.paymentMethod : 'cash';
  return [{ method, amount: order.totalAmount }];
}

export interface MixedInput { cash: number; qr: number; card: number }

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
 * Thanh toán kết hợp: chuyển khoản + thẻ không được vượt quá số cần trả; phần còn lại phải do tiền mặt đáp ứng,
 * tiền mặt đưa dư thì thừa được trả lại khách.
 */
export function applyMixedPayment(total: number, input: MixedInput): MixedResult {
  const cash = Math.max(0, input.cash || 0);
  const qr = Math.max(0, input.qr || 0);
  const card = Math.max(0, input.card || 0);
  const received = cash + qr + card;
  const nonCash = qr + card;

  if (nonCash > total) {
    return { valid: false, error: 'Chuyển khoản + thẻ vượt quá số tiền khách cần trả.', change: 0, received, parts: [] };
  }
  const cashNeeded = total - nonCash;
  if (cash < cashNeeded) {
    return { valid: false, error: `Còn thiếu ${(cashNeeded - cash).toLocaleString('vi-VN')} đ.`, change: 0, received, parts: [] };
  }
  const parts: PaymentPart[] = [];
  if (cashNeeded > 0) parts.push({ method: 'cash', amount: cashNeeded });
  if (qr > 0) parts.push({ method: 'qr', amount: qr });
  if (card > 0) parts.push({ method: 'card', amount: card });
  return { valid: true, change: cash - cashNeeded, received, parts };
}
