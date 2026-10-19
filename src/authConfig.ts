/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TÀI KHOẢN SYSADMIN CỨNG (tạm thời, chỉ dùng trên thiết bị này).
 *
 * - Không lưu trong SQLite: đăng nhập được so khớp trực tiếp với cấu hình dưới đây.
 * - Đổi tài khoản / mật khẩu bằng cách sửa giá trị mặc định bên dưới, hoặc đặt biến môi trường
 *   VITE_SYSADMIN_USERNAME / VITE_SYSADMIN_PASSWORD trong file `.env.local` (file này không được commit).
 * - LƯU Ý BẢO MẬT: mọi giá trị đặt ở client đều có thể bị đọc ra từ mã ứng dụng. Phù hợp để quản trị tạm thời;
 *   khi lên Cloud sẽ thay bằng tài khoản cấp từ máy chủ.
 */
export const SYSADMIN_CONFIG = {
  USERNAME: (import.meta.env.VITE_SYSADMIN_USERNAME as string | undefined) || 'sysadmin',
  PASSWORD: (import.meta.env.VITE_SYSADMIN_PASSWORD as string | undefined) || 'Sysadmin@2026',
  DISPLAY_NAME: 'Quản trị hệ thống',
} as const;
