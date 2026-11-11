# F001 — Xác thực, phân quyền và tạo cửa hàng

| Trường | Nội dung |
|---|---|
| Mã chức năng | F001 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.1 và 4 |
| Actor | Chủ cửa hàng (đăng ký), mọi vai trò (đăng nhập), Quản trị hệ thống |
| Mã nguồn | `src/db/auth.ts`, `src/authConfig.ts`, `src/utils/permissions.ts`, `src/db/password.ts`, `src/components/LoginScreen.tsx`, `src/App.tsx` |
| Liên quan | F008 (nhân viên), F011 (dữ liệu mẫu), F014 (SysAdmin), F029 (quên mật khẩu) |

## 1. Mục tiêu
Đăng nhập bằng tên tài khoản (offline được), tạo cửa hàng mới dùng ngay, mỗi vai trò chỉ thấy đúng màn hình công việc.

## 2. Vai trò và màn hình được vào
| Vai trò (`role`) | Nhãn | Màn hình (`ROLE_SCREENS`) | Màn mặc định |
|---|---|---|---|
| `sysadmin` | Quản trị hệ thống | `stores`, `accounts` | Cửa hàng |
| `owner` | Chủ cửa hàng | Tất cả: `reports, eod, pos, kitchen, menu, tables, orders, shifts, cashbook, inventory, customers, employees, suppliers, account, conflicts` | Báo cáo |
| `manager` | Quản lý cửa hàng | Giống `owner` (có thể giới hạn sau tại `ROLE_SCREENS`) | Báo cáo |
| `staff` | Phục vụ / Thu ngân | `pos`, `stockcheck` | Bán hàng |
| `kitchen` | Nhân viên bếp (chỉ F&B) | `kitchen`, `stockcheck` | Màn bếp |
- `isAdminRole` = `owner` hoặc `manager`: dùng cho tính năng chỉ chủ/quản lý (thiết kế sơ đồ bàn, kênh bán, hủy hóa đơn...).
- Mục `conflicts` chỉ hiện khi app dùng máy chủ (F020).
- Mở màn hình không được phép → chuyển về màn mặc định. Thanh điều hướng chỉ liệt kê mục được phép.

## 3. Use case

### UC-001-01 — Đăng nhập
| Mục | Nội dung |
|---|---|
| Đầu vào | Tên tài khoản **hoặc email** (khớp không phân biệt hoa thường) + mật khẩu |
| Luồng | Tìm tài khoản → kiểm tra hoạt động → xác minh mật khẩu → kiểm tra vai trò và cửa hàng → cập nhật `last_login_at` → lưu phiên → ghi `meta.active_store_id` → vào màn mặc định của vai trò |
| Phiên | Lưu cục bộ; mở lại ứng dụng không phải đăng nhập (`restoreSession`) |

```
if (login khớp tài khoản sysadmin cứng):
    mật khẩu khác cấu hình -> "Mật khẩu không đúng."   else vào với store = null
row = tìm theo username/email
if (!row)                          -> "Tài khoản không tồn tại trên thiết bị này."
if (!row.is_active)                -> "Tài khoản đã bị vô hiệu hoá."
if (mật khẩu sai)                  -> "Mật khẩu không đúng."
if (role không hợp lệ || role == 'sysadmin' || không có store_id)
                                   -> "Tài khoản này không còn được hỗ trợ trên thiết bị."
store = cửa hàng của tài khoản
if (!store)                        -> "Cửa hàng của tài khoản này không còn tồn tại."
if (store.status != 'active')      -> "Cửa hàng đang bị tạm khóa. Vui lòng liên hệ quản trị hệ thống."
```
Trên web dùng máy chủ hoặc app native đã đồng bộ, "thiết bị này" nghĩa là CSDL mà app đang dùng.

### UC-001-02 — Đăng ký cửa hàng (tạo Chủ cửa hàng)
| Mục | Nội dung |
|---|---|
| Tab | "Tạo cửa hàng" |
| Trường | Tên tài khoản, email, mật khẩu, họ tên, tên cửa hàng, loại (F&B / Bán lẻ), SĐT, địa chỉ |
| Luồng | Kiểm tra tên tài khoản và email → tạo `stores` (`id = store-<timestamp>`, `status = active`) → tạo `users` (role `owner`) → **tạo dữ liệu mẫu** (F011) → đăng nhập luôn |
| Lỗi | `Tên tài khoản gồm 3-32 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.` · `Tên tài khoản này được dành riêng cho hệ thống.` · `Email không hợp lệ.` · `Tên tài khoản này đã được sử dụng trên thiết bị.` · `Email này đã được đăng ký trên thiết bị.` |
| Không phê duyệt | Cửa hàng dùng được ngay |

### UC-001-03 — Tab Demo
Tab "Demo Sandbox" tạo/đăng nhập một cửa hàng demo (`ensureDemoStore`) để trình diễn cho khách; thanh bên ghi thêm "· Demo". Giữ lại có chủ đích.

### UC-001-04 — Đổi mật khẩu của mình
Hộp "Tài khoản của tôi": nhập mật khẩu hiện tại + mật khẩu mới. `Mật khẩu mới cần tối thiểu 6 ký tự.` · `Không tìm thấy tài khoản.` · `Mật khẩu hiện tại không đúng.` (sysadmin đổi trong cấu hình, không có chức năng này).

### UC-001-05 — Đặt lại mật khẩu người khác
Xem F008 (Chủ: mọi tài khoản; Quản lý: trừ Chủ; Sysadmin: mọi tài khoản). Quên mật khẩu qua email: F029.

### UC-001-06 — Đăng xuất
Xóa phiên cục bộ, về màn đăng nhập.

## 4. Quy tắc dữ liệu
| Quy tắc | Chi tiết |
|---|---|
| Mật khẩu | PBKDF2-SHA256, 100.000 vòng, salt ngẫu nhiên; không lưu thô |
| Tên tài khoản | 3–32 ký tự: chữ thường không dấu, số, `.`, `_`, `-`; duy nhất; không trùng tên sysadmin |
| Tài khoản cũ | Migration v5 gán `username = email` nên vẫn đăng nhập được |
| Email | Bắt buộc khi tạo; chỉ để liên hệ/nhận thư khôi phục |
| Sysadmin | Cấu hình cứng trong `src/authConfig.ts` (biến `VITE_SYSADMIN_USERNAME/PASSWORD`), không lưu trong `users` |

## 5. Dữ liệu (Database)
| Bảng | Cột chính |
|---|---|
| `stores` | `id, name, address, phone, store_type ('fnb'/'retail'), status ('active'/khóa), tax_code, currency, receipt_footer, logo_url, order_seq, import_seq, export_seq, auto_stock_deduction, sales_channels, rev, deleted_at` |
| `users` | `uid, username, email, password_hash, password_salt, pin_code, store_id, role, name, phone, hourly_rate, is_active, last_login_at, rev, deleted_at` |
| `meta` | `active_store_id`, `schema_version`, phiên đăng nhập |

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Tài khoản `role = 'sysadmin'` còn sót trong bảng `users` | Không đăng nhập được |
| Cửa hàng bị khóa giữa phiên | Lần đăng nhập sau bị từ chối |
| Cùng email cho hai tài khoản | Bị chặn khi tạo |
| Web, hai thiết bị | Dữ liệu cùng nằm trên máy chủ, đăng nhập được ở cả hai (F018) |
| Không dùng máy chủ, hai trình duyệt | Mỗi trình duyệt một CSDL; tài khoản không có ở máy khác |
| Nhiều tab cùng cửa hàng khi không dùng máy chủ | Có thể lệch/ghi đè dữ liệu: chỉ mở một tab |

## 7. Giới hạn đã biết (bảo mật, chưa xử lý)
- Mật khẩu sysadmin nằm trong gói mã ứng dụng web (đọc ra được).
- Chưa khóa tài khoản sau nhiều lần nhập sai.
- Phiên đăng nhập chỉ là `uid` lưu cục bộ, chưa có token máy chủ theo người dùng.
