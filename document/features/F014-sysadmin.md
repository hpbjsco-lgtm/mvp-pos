# F014 — Quản trị hệ thống (SysAdmin): cửa hàng, tài khoản, xóa dữ liệu

| Trường | Nội dung |
|---|---|
| Mã chức năng | F014 |
| Trạng thái | Hoàn thiện về mã; chưa kiểm thử trên thiết bị thật. Nguồn đặc tả cũ: FEATURES.md mục 5.14 |
| Actor | Quản trị hệ thống (`sysadmin`, tài khoản cứng) |
| Mã nguồn | `src/authConfig.ts`, `src/db/admin.ts`, `src/components/{SysAdminStores,SysAdminAccounts,SysAdminShared}.tsx` (`SysAdminDashboard.tsx` cũ không dùng) |
| Liên quan | F001, F011, F008 |

## 1. Mục tiêu
Một tài khoản kỹ thuật quản lý toàn bộ cửa hàng và tài khoản có trên CSDL mà app đang dùng.

## 2. Tài khoản sysadmin
- Tên và mật khẩu đặt trong `src/authConfig.ts` (mặc định `sysadmin` / `Sysadmin@2026` — **phải đổi**), hoặc ghi đè bằng biến môi trường `VITE_SYSADMIN_USERNAME`, `VITE_SYSADMIN_PASSWORD` trong `.env.local` (không commit).
- Tên này **bị cấm** dùng khi tạo tài khoản thường (F001).
- Đăng nhập: so khớp trực tiếp với cấu hình, không đọc bảng `users`. Menu chỉ có **Cửa hàng** và **Tài khoản**.
- **Rủi ro đã biết:** giá trị nằm trong gói mã ứng dụng web, ai tải trang đều đọc ra được. Nhóm việc bảo mật (D) chưa xử lý; cần thay bằng tài khoản cấp từ máy chủ.

## 3. Use case

### UC-014-01 — Quản lý cửa hàng
Bảng: tên, loại (F&B / Bán lẻ), số tài khoản, trạng thái (*Hoạt động* / *Tạm khóa*).
| Thao tác | Quy tắc |
|---|---|
| Thêm | Tên bắt buộc: "Vui lòng nhập tên cửa hàng."; chọn loại, SĐT, địa chỉ, trạng thái; tùy chọn **tạo kèm dữ liệu mẫu** (F011). Có thể tạo kèm tài khoản chủ cửa hàng |
| Sửa | Tên, loại, SĐT, địa chỉ, trạng thái (`rev + 1`) |
| Khóa / mở nhanh | Đổi `status` giữa `active` và `rejected` ("Tạm khóa (không đăng nhập được)"). Cửa hàng bị khóa: mọi tài khoản của nó không đăng nhập được |
| Xóa | **Xóa mềm** cửa hàng và toàn bộ tài khoản của nó; dữ liệu nghiệp vụ còn trong CSDL nhưng không truy cập được |

### UC-014-02 — Quản lý tài khoản
Xem theo cửa hàng, tìm kiếm.
| Thao tác | Quy tắc |
|---|---|
| Thêm | Phải có ít nhất một cửa hàng: "Hãy tạo ít nhất một cửa hàng trước khi thêm tài khoản."; cửa hàng phải tồn tại ("Cửa hàng không tồn tại."); mật khẩu ≥ 6 ("Mật khẩu cần tối thiểu 6 ký tự."); tên tài khoản hợp lệ và duy nhất ("Tên tài khoản này đã tồn tại."); email hợp lệ và duy nhất ("Email này đã được dùng cho một tài khoản khác.") |
| Sửa | Cửa hàng, họ tên (bắt buộc: "Vui lòng nhập họ tên."), tên tài khoản, email, vai trò, lương giờ, khóa/mở (`is_active`) |
| Đặt mật khẩu | ≥ 6 ký tự |
| Xóa | **Xóa mềm**: gắn `deleted_at`, đổi `username` và `email` thành `<giá trị>~del~<timestamp>~<uid>` để **giải phóng** tên/email dùng lại (các cột có chỉ mục duy nhất) |

### UC-014-03 — Vùng nguy hiểm: Xóa toàn bộ dữ liệu
1. Nút **Xóa toàn bộ dữ liệu** mở hộp xác nhận, bắt buộc gõ đúng `XOA HET`; nút **Xóa tất cả** khóa đến khi gõ đúng.
2. `wipeAllData`: xóa **cứng** (DELETE) mọi dòng ở các bảng đồng bộ (bảng con trước), cùng `sync_outbox`, `sync_state`; xóa phiên và `active_store_id`; ghi xuống ổ; đăng xuất và nạp lại ứng dụng.
3. Giữ cấu trúc bảng và lịch sử migration.
- Không thể hoàn tác. **Khi app dùng máy chủ dùng chung, thao tác này xóa dữ liệu của mọi thiết bị** (các thiết bị khác sẽ nhận trạng thái rỗng khi đồng bộ). Chỉ dùng cho môi trường thử/demo; cần cân nhắc khóa chức năng này trên máy chủ thật.

## 4. Dữ liệu (Database)
Thao tác trên `stores` (`status`, `deleted_at`, `rev`), `users` (`role`, `is_active`, `username`, `email`, `deleted_at`, `rev`) và, khi xóa toàn bộ, mọi bảng đồng bộ.

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Khóa cửa hàng khi nhân viên đang đăng nhập | Phiên hiện tại vẫn chạy đến khi đăng nhập lại |
| Xóa cửa hàng rồi tạo lại với tên tài khoản cũ | Được (tên cũ đã được giải phóng) |
| Tạo tài khoản role `sysadmin` | Không hợp lệ; `normalizeRole` loại |
| Dữ liệu mẫu tạo lỗi | `seedStore` trả false, cửa hàng vẫn được tạo (F011) |
