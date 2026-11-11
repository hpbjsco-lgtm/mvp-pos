# F012 — Quản lý nhà cung cấp

| Trường | Nội dung |
|---|---|
| Mã chức năng | F012 |
| Trạng thái | Hoàn thiện (danh bạ). Nguồn đặc tả cũ: FEATURES.md mục 5.12 |
| Actor | Chủ, Quản lý |
| Mã nguồn | `src/components/SuppliersSection.tsx` |
| Liên quan | F006 (cột `supplier_id` của lô và phiếu kho) |

## 1. Mục tiêu
Danh bạ nhà cung cấp phục vụ nghiệp vụ nhập kho.

## 2. Use case
### UC-012-01 — Xem danh sách
Bảng nhà cung cấp theo cửa hàng, có tìm kiếm và nút thêm/sửa/xóa (bộ thành phần chung `ListToolbar`, `DataTable`).

### UC-012-02 — Thêm / sửa
Trường: **tên** (bắt buộc), SĐT, email, địa chỉ.
| Điều kiện | Kết quả |
|---|---|
| Tên trống | Bíp lỗi + "Vui lòng nhập tên nhà cung cấp!" |
| Thêm mới | id `SUP-<timestamp>`; ghi nhật ký "Thêm nhà cung cấp" |
| Sửa | Giữ `createdAt`; ghi nhật ký "Sửa nhà cung cấp" |
| Lỗi lưu | "Lỗi lưu trữ dữ liệu!" |

### UC-012-03 — Xóa
Hỏi `Bạn có chắc muốn xóa nhà cung cấp "<tên>" khỏi hệ thống?` → xóa mềm. Lỗi: "Lỗi xóa nhà cung cấp!".

## 3. Dữ liệu (Database) — bảng `suppliers`
`id, store_id, name, phone, email, address, tax_code, note, created_at, updated_at, deleted_at, rev`. Màn hình hiện chỉ sửa tên, SĐT, email, địa chỉ; `tax_code`, `note` có cột nhưng chưa có ô nhập.
Dữ liệu mẫu có 2 nhà cung cấp (F011).

## 4. Trường hợp biên / giới hạn
- Xóa nhà cung cấp đã gắn lô/phiếu: lô vẫn giữ `supplier_id` (không có ràng buộc, không chặn xóa).
- Màn Nhập lô thủ công (F006) chưa chọn nhà cung cấp.
- Không có công nợ nhà cung cấp hay lịch sử mua theo nhà cung cấp.
