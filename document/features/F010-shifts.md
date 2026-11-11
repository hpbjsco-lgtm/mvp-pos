# F010 — Sổ quỹ ca làm việc (mở ca, đóng ca, đối soát tiền mặt)

| Trường | Nội dung |
|---|---|
| Mã chức năng | F010 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.10 |
| Actor | Chủ, Quản lý (màn **Ca làm việc**). Phục vụ/Thu ngân không có màn này trong menu hiện tại, chỉ có "Kiểm kho ca" |
| Mã nguồn | `src/components/ShiftSection.tsx`, `src/utils/payments.ts` (`getOrderPayments`), `StocktakeFlow.tsx` |
| Liên quan | F002, F024 (kiểm kho đầu/cuối ca), F026 (ví), F015 (sổ quỹ tổng) |

> Lưu ý phân quyền: theo `ROLE_SCREENS` hiện tại, màn `shifts` chỉ nằm trong danh sách của Chủ và Quản lý. Ca được mở/đóng cho **người đang đăng nhập** (`staffId = uid`). Nếu muốn thu ngân tự mở/đóng ca, cần thêm `shifts` vào vai trò `staff` (chưa làm; cần quyết định).

## 1. Mục tiêu
Ghi quỹ tiền mặt đầu ca, cuối ca đối soát tiền đếm thực tế với tiền hệ thống kỳ vọng để phát hiện thất thoát.

## 2. Use case

### UC-010-01 — Mở ca
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | Người dùng chưa có ca đang mở (`staffId = uid` và `status = open`) |
| Nhập | **Tiền quỹ đầu ca (đ)** ≥ 0 (bắt buộc, số âm bị đưa về 0) |
| Kết quả | Tạo ca `shift-<timestamp>`: `staffId, staffName, openingCash, status = 'open', openedAt` |
| Ràng buộc | Mỗi nhân viên **một ca mở** tại một thời điểm (form mở ca chỉ hiện khi chưa có ca mở) |

### UC-010-02 — Theo dõi ca đang mở
Khung "Sổ quỹ ca làm việc" hiển thị: trạng thái "Đang mở ca", thu ngân, giờ bắt đầu và các ô:
| Ô | Công thức |
|---|---|
| Tiền mặt | Σ khoản `cash` trong hóa đơn của ca |
| Chuyển khoản / QR | Σ khoản `qr` |
| Thẻ tín dụng | Σ khoản `card` |
| Ví điện tử | Σ khoản `wallet` |
| Quỹ đầu ca | `openingCash` |
| Tổng doanh thu tạm tính | tiền mặt + QR + thẻ + ví |
| **Tiền mặt trong két (dự kiến)** | `openingCash + tiền mặt` |
Hóa đơn của ca: của **đúng nhân viên mở ca**, `status != void`, `createdAt ≥ openedAt`. Thanh toán kết hợp được tách theo từng khoản (`getOrderPayments`).

### UC-010-03 — Kiểm kho trong ca
Xem F024: khung "Kiểm kho ca" (đầu ca) và khối cảnh báo khi đóng ca (cuối ca, không chặn).

### UC-010-04 — Đóng ca
1. Bấm **Đóng ca làm việc** → ô *Tiền mặt đếm thực tế (đ)* mặc định bằng số dự kiến.
2. Hiển thị **Chênh lệch** = thực tế − dự kiến (xanh nếu 0, đỏ nếu khác).
3. Bấm **Xác nhận đóng ca** → hộp xác nhận: `Xác nhận đóng ca? Tiền mặt kỳ vọng: x đ · Tiền mặt đếm thực tế: y đ · Chênh lệch: ±z đ`.
4. Đồng ý → ca `status = 'closed'`, lưu `closingCashExpected`, `closingCashActual`, `closedAt`. Nút **Hủy** quay về màn trước.

### UC-010-05 — Lịch sử đóng ca
Bảng tối đa **20** ca đóng gần nhất: thu ngân, thời gian mở, thời gian đóng, kỳ vọng, thực tế, kiểm kho (`Đầu ca: có/chưa · Cuối ca: có/chưa`), chênh lệch (±, xanh nếu 0, đỏ nếu khác). Trống: "Chưa có ca nào được đóng".

## 3. Dữ liệu (Database) — bảng `shifts`
`id, store_id, staff_id, staff_name, opening_cash, closing_cash_expected, closing_cash_actual, status ('open'/'closed'), note, opened_at, closed_at, created_at, updated_at, deleted_at, rev`.
Liên kết ca ↔ kiểm kho: `inventory_transactions.shift_id`.

## 4. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Hủy hóa đơn trong ca đang mở | Hóa đơn `void` bị loại khỏi tiền kỳ vọng ngay |
| Hủy hóa đơn sau khi đóng ca | Số kỳ vọng đã lưu không đổi |
| Phiếu thu/chi lập tay trong ca | **Không** nằm trong tiền kỳ vọng (chỉ tính doanh thu bán hàng) |
| Ca mở qua nhiều ngày | Vẫn một ca; tính mọi hóa đơn sau `openedAt` |
| Hai máy mở ca cho cùng người | Có thể có hai ca mở (kiểm tra chỉ dựa trên danh sách đã tải); đồng bộ F019 cần kiểm chứng |

## 5. Giới hạn
Chưa có chi/thu tiền mặt giữa ca, chưa có báo cáo ca theo người xem của quản lý ngoài bảng lịch sử, chưa in biên bản đóng ca.
