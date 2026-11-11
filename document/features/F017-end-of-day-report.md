# F017 — Báo cáo cuối ngày (theo kỳ)

| Trường | Nội dung |
|---|---|
| Mã chức năng | F017 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.18. **Cập nhật:** giảm giá theo món, kênh bán, công nợ, lợi nhuận/hao hụt nay đã có dữ liệu (F027, F028); chưa có theo chi nhánh |
| Actor | Chủ, Quản lý |
| Mã nguồn | `src/components/EndOfDayReport.tsx`, `src/utils/endOfDay.ts` (`computeEndOfDay`, `eodRange`), `src/utils/profit.ts` |
| Liên quan | F013, F015, F026, F027, F028 |

## 1. Mục tiêu
Tổng kết một kỳ (thường là cuối ngày): bán hàng, thu chi, hàng hóa, phòng bàn, kèm tình hình đang phục vụ ngay lúc xem.

## 2. Cấu trúc màn hình
**Kỳ**: Hôm nay · Hôm qua · Tuần này (thứ Hai là đầu tuần) · Tháng này · Tùy chọn (hai ô ngày, từ 00:00:00 đến 23:59:59.999).
**Khối chỉ số nhanh**: số hóa đơn + doanh thu; F&B: số đơn đang phục vụ + giá trị tạm tính, bàn đang sử dụng (x / tổng), khách đang phục vụ; bán lẻ: số đơn đang mở.
**Bốn tab**: *Tổng hợp* · *Thu chi* · *Hàng hóa* · *Phòng bàn* (chỉ F&B).
**Mục "đang phục vụ" luôn là hiện tại**, không phụ thuộc kỳ đã chọn.

## 3. Công thức (đơn `void` không tính vào doanh thu; chỉ xuất hiện ở "Hủy / trả hàng")
| Chỉ số | Công thức |
|---|---|
| Doanh thu tổng | Σ `subtotal` (trước giảm giá; thiếu thì `totalAmount`) |
| Tổng giảm giá theo món | Σ `line_discount_amount` |
| Tổng giảm giá hóa đơn | Σ `discount_amount` |
| Doanh thu | Σ `total_amount` (đã gồm VAT) |
| Thuế VAT | Σ `tax_amount` |
| Thu khác | Σ phiếu thu lập tay `paid` trong kỳ |
| Hủy / trả hàng | Số lượng và Σ `total_amount` của đơn `void` trong kỳ |
| Doanh thu thuần (không gồm thu khác) | Doanh thu − Thuế VAT |
| Doanh thu thuần (gồm thu khác) | Doanh thu thuần + Thu khác |

### 3.1 Mục Lợi nhuận (tab Tổng hợp)
Doanh thu (chưa thuế) · Giá vốn hàng bán · Lợi nhuận gộp · Chiết khấu đối tác · Hao hụt (Hư hỏng · Kiểm kho thiếu · Kiểm kho thừa) · Lợi nhuận sau chiết khấu và hao hụt · dòng "Chưa có giá vốn: N" nếu có hóa đơn cũ (F027).

### 3.2 Các mục khác trong tab Tổng hợp
- **Kênh bán** (chỉ khi có đơn đi qua kênh): mỗi kênh `<n> đơn · Chiết khấu · Thực nhận`; đơn không chọn kênh = "Trực tiếp" (F028).
- **Công nợ khách hàng**: tổng nợ, số khách nợ, 10 khách nợ nhiều nhất.
- **Đang phục vụ** (F&B): số đơn mở, số món chưa thanh toán.

### 3.3 Tab Thu chi
- **Thu bán hàng** theo phương thức: Tiền mặt / Chuyển khoản / Thẻ / Ví điện tử (tách theo từng khoản của thanh toán kết hợp; `getOrderPayments`); điểm tích lũy cộng thêm.
- **Phiếu thu** và **phiếu chi** lập tay theo quỹ (Tiền mặt, Ngân hàng, Ví điện tử); chênh lệch thu − chi.

### 3.4 Tab Hàng hóa
- **Đang phục vụ** (món trong các giỏ chưa thanh toán, hiện tại) và **Đã bán** (trong kỳ): tổng giá trị, số món, danh sách món giảm dần theo giá trị, 5 món đầu + *Xem thêm* / *Thu gọn*.
- **Giảm giá theo món** (F028, mục 4): phân bổ giảm giá hóa đơn xuống từng món.
Giỏ chỉ tính khi hiển thị thật: bàn còn tồn tại, giỏ Mang về/Giao đi, giỏ bán lẻ. Giỏ của bàn đã xóa/đổi mã bị bỏ qua.

### 3.5 Tab Phòng bàn (F&B)
```
loại đơn: dineIn   nếu có tableId và không phải giỏ ảo
          delivery nếu tableNumber == 'Giao đi' hoặc tableId == DELIVERY_ID
          takeaway còn lại
```
Hai bảng: *Loại đơn hàng* (Ngồi tại bàn / Mang về / Giao đi: giá trị, số đơn) và *Phòng / Bàn* (mỗi bàn: giá trị, số đơn, khu vực; giảm dần theo giá trị). Không có đơn: "Chưa có đơn ngồi tại bàn trong kỳ."

## 4. Dữ liệu
Không có bảng riêng. Đọc `orders`, `order_items`, `cash_vouchers`, `bank_accounts`, `carts`, `products`, `dining_tables`, `zones`, `inventory_transactions`, `customers`.

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Kỳ không có đơn | Các số 0; mục danh sách hiện "Chưa có dữ liệu." |
| Hóa đơn hủy | Chỉ ở dòng Hủy / trả hàng |
| Hóa đơn lập trước khi lưu giá vốn | Không vào mục Lợi nhuận; hiện số "Chưa có giá vốn" |
| Đơn Giao đi nhưng lưu `orderType = 'takeaway'` | Phân biệt Giao đi bằng `tableNumber`/`tableId` |
| Khách nợ nhập tay | Báo cáo hiển thị theo giá trị hiện tại, không theo kỳ |
| Thay đổi máy chủ/nhiều máy | Dùng dữ liệu đã tải; làm mới theo F019 |

## 6. Chưa có
Báo cáo theo chi nhánh; xuất file; so sánh kỳ; in báo cáo.

## 7. Kiểm thử
`src/utils/endOfDay.test.ts`, `profit.test.ts`.
