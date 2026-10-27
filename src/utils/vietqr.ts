/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sinh nội dung mã QR chuyển khoản VietQR / NAPAS 247 (chuẩn EMVCo) hoàn toàn offline.
 * Mã QR quét được bằng app của mọi ngân hàng trong nước; nếu có số tiền thì app tự điền sẵn số tiền + nội dung.
 */

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) theo yêu cầu của EMVCo. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bỏ dấu tiếng Việt và ký tự lạ để nội dung chuyển khoản mọi app ngân hàng đều nhận (tối đa 25 ký tự). */
export function sanitizeMemo(memo: string): string {
  return memo
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .trim()
    .slice(0, 25);
}

export interface VietQRInput {
  /** Mã BIN 6 số của ngân hàng thụ hưởng (vd Vietcombank 970436). */
  bin: string;
  accountNumber: string;
  /** Số tiền (VND). Bỏ trống / 0 = mã tĩnh, khách tự nhập số tiền. */
  amount?: number;
  /** Nội dung chuyển khoản (vd số hóa đơn / tên bàn). */
  memo?: string;
}

export function buildVietQRPayload({ bin, accountNumber, amount, memo }: VietQRInput): string {
  const amt = Math.round(amount || 0);
  const account = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', accountNumber)) + tlv('02', 'QRIBFTTA');
  const cleanMemo = memo ? sanitizeMemo(memo) : '';

  const body =
    tlv('00', '01') +
    tlv('01', amt > 0 ? '12' : '11') +
    tlv('38', account) +
    tlv('53', '704') +
    (amt > 0 ? tlv('54', String(amt)) : '') +
    tlv('58', 'VN') +
    (cleanMemo ? tlv('62', tlv('08', cleanMemo)) : '') +
    '6304';
  return body + crc16(body);
}
