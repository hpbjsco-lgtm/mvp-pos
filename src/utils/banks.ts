/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BankInfo {
  code: string; // Tên viết tắt hiển thị (VCB, TCB...)
  name: string;
  /** Mã BIN 6 số trong hệ thống NAPAS, dùng để sinh QR VietQR. */
  bin: string;
}

/**
 * Danh sách ngân hàng phổ biến. Mã BIN ghi theo danh mục NAPAS công khai; nên quét thử một mã QR bằng app
 * ngân hàng sau khi thêm tài khoản để chắc chắn, và bổ sung ngân hàng khác tại đây khi cần.
 */
export const BANKS: BankInfo[] = [
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)', bin: '970436' },
  { code: 'CTG', name: 'Ngân hàng TMCP Công thương Việt Nam (VietinBank)', bin: '970415' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)', bin: '970418' },
  { code: 'AGR', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn (Agribank)', bin: '970405' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)', bin: '970407' },
  { code: 'MB', name: 'Ngân hàng TMCP Quân đội (MB Bank)', bin: '970422' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)', bin: '970416' },
  { code: 'VPB', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', bin: '970432' },
  { code: 'TPB', name: 'Ngân hàng TMCP Tiên Phong (TPBank)', bin: '970423' },
  { code: 'STB', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', bin: '970403' },
  { code: 'HDB', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', bin: '970437' },
  { code: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam (VIB)', bin: '970441' },
  { code: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)', bin: '970443' },
  { code: 'OCB', name: 'Ngân hàng TMCP Phương Đông (OCB)', bin: '970448' },
  { code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)', bin: '970426' },
  { code: 'SEAB', name: 'Ngân hàng TMCP Đông Nam Á (SeABank)', bin: '970440' },
  { code: 'LPB', name: 'Ngân hàng TMCP Lộc Phát Việt Nam (LPBank)', bin: '970449' },
  { code: 'EIB', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam (Eximbank)', bin: '970431' },
  { code: 'SCB', name: 'Ngân hàng TMCP Sài Gòn (SCB)', bin: '970429' },
];

export const findBank = (code: string) => BANKS.find(b => b.code === code);
