# F007 — Khách hàng, tích điểm thành viên và công nợ

| Trường | Nội dung |
|---|---|
| Mã chức năng | F007 |
| Trạng thái | Hoàn thiện (đổi điểm thành tiền **chưa có**). Nguồn đặc tả cũ: FEATURES.md mục 5.7 |
| Actor | Chủ, Quản lý (màn Khách hàng); Thu ngân (thêm nhanh/chọn khách khi bán) |
| Mã nguồn | `src/components/CustomersSection.tsx`, `POSScreen.tsx` (thêm nhanh khách, cộng điểm), `OrderHistorySection.tsx` (trừ điểm khi hủy), `src/utils/endOfDay.ts` (công nợ) |
| Liên quan | F002, F009, F017, F028 (công nợ) |

## 1. Mục tiêu
Lưu hồ sơ khách, tích điểm tự động theo chi tiêu, phân hạng thành viên, theo dõi công nợ.

## 2. Quy tắc điểm và hạng
| Quy tắc | Chi tiết |
|---|---|
| Cộng điểm | `floor(Tổng thanh toán / 10.000)` — tính trên số tiền sau giảm giá, sau thuế. Chỉ khi đơn có chọn khách |
| Hạng | `points ≥ 500` Kim cương · `≥ 200` Vàng · `≥ 50` Bạc · còn lại Đồng. Khách vãng lai không có hạng |
| Hủy hóa đơn | Trừ lại đúng số điểm đã cộng, `max(0, điểm − đã cộng)` (F009) |
| Đổi điểm | Cột `orders.points_used` có nhưng **chưa có chức năng sử dụng điểm** |

## 3. Use case

### UC-007-01 — Xem và tìm khách
Bảng: Tên · SĐT ("Chưa cập nhật SĐT" nếu trống) · Hạng · Điểm tích lũy · Công nợ. Lọc theo hạng (Tất cả / Kim cương / Vàng / Bạc / Đồng); tìm theo tên, SĐT hoặc email ("Tìm tên hoặc số điện thoại...").

### UC-007-02 — Thêm / sửa khách
Trường: tên (bắt buộc), SĐT, email, địa chỉ, sinh nhật, điểm, ghi chú, **công nợ**. Công nợ là số nguyên ≥ 0 nhập tay.
| Điều kiện | Thông báo |
|---|---|
| Tên trống | "Vui lòng nhập tên khách hàng!" |
| Sửa khách vãng lai mặc định (`khach-vang-lai`) | "Không thể chỉnh sửa thông tin khách vãng lai mặc định!" |
| Lưu lỗi | "Lỗi lưu trữ dữ liệu!" |

### UC-007-03 — Xóa khách
Khách vãng lai: "Không được xóa khách vãng lai mặc định!". Khác: hỏi `Bạn có chắc muốn xóa khách hàng "<tên>" khỏi hệ thống?` → xóa mềm. Lỗi: "Lỗi xóa khách hàng!".

### UC-007-04 — Thêm nhanh ở quầy POS
Trên đơn: nút **+ thêm khách hàng**: bắt buộc **tên và SĐT** (thiếu một trong hai: bỏ qua, không lưu). Khách lưu chung danh sách khách hàng của cửa hàng.

### UC-007-05 — Gắn khách vào đơn
Ô *Tìm khách hàng (F4)*; khách được chọn: tên chụp vào đơn (`customer_name`), điểm cộng khi thanh toán, `points_earned` ghi trên đơn.

### UC-007-06 — Công nợ
Chỉ **hiển thị/nhập tay** (F028). Báo cáo cuối ngày gom tổng nợ và 10 khách nợ nhiều nhất (F017).

## 4. Dữ liệu (Database) — bảng `customers`
`id, store_id, name, phone, email, address, birthday, points, total_spent, visit_count, note, debt, created_at, updated_at, deleted_at, rev`.
Khách vãng lai mặc định tạo khi tạo cửa hàng (F011). `total_spent`, `visit_count` có cột nhưng **chưa được cập nhật khi thanh toán** (kiểm tra mã: thanh toán chỉ cộng `points`).

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Hai khách trùng SĐT | Cho phép (không có ràng buộc duy nhất) |
| Sửa điểm tay | Cho phép (không có nhật ký riêng ngoài nhật ký thao tác chung) |
| Hủy hóa đơn mà khách đã bị xóa | Không trừ điểm (không tìm thấy khách) |
| Đồng bộ | Hai máy sửa cùng khách → xung đột (F020) |
