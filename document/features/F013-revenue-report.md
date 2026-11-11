# F013 — Báo cáo doanh thu và chỉ số kinh doanh

| Trường | Nội dung |
|---|---|
| Mã chức năng | F013 |
| Trạng thái | Hoàn thiện. **Cập nhật so với spec cũ:** biểu đồ nay tổng hợp từ đơn thật (không còn hệ số minh họa); thêm khối lợi nhuận (F027) |
| Actor | Chủ, Quản lý. Sysadmin xem phần tổng quan hệ thống (đa cửa hàng) |
| Mã nguồn | `src/components/ReportsSection.tsx`, `src/utils/revenueReport.ts`, `src/utils/profit.ts` |
| Liên quan | F017 (báo cáo cuối ngày), F027 (lợi nhuận) |

## 1. Mục tiêu
Cho Chủ xem nhanh doanh thu và lợi nhuận hôm nay / tháng này / năm nay, số đơn, xu hướng và món bán chạy/chậm.

## 2. Use case

### UC-013-01 — Chọn kỳ
Ba nút lọc: **Hôm nay**, **Theo tháng**, **Theo năm**.
Phạm vi đơn: ngày hiện tại / tháng hiện tại / năm hiện tại theo giờ máy (`presetRange`). **Đơn đã hủy bị loại** trước mọi phép tính. Đơn có `createdAt` không hợp lệ → **báo lỗi** nêu số đơn (không bỏ qua âm thầm).

### UC-013-02 — Ba ô chỉ số (Doanh thu, Số đơn hàng, Lợi nhuận)
| Ô | Công thức |
|---|---|
| Doanh thu | Σ `totalAmount` (đã gồm VAT, đã trừ giảm giá) của đơn trong kỳ |
| Số đơn hàng | Số đơn trong kỳ |
| Lợi nhuận sau chiết khấu và hao hụt | `summarizeProfit` (F027) |

### UC-013-03 — Khối lợi nhuận
`Doanh thu (chưa thuế) → Giá vốn hàng bán → Lợi nhuận gộp → Chiết khấu đối tác → Hao hụt → Lợi nhuận sau chiết khấu và hao hụt` (số âm tô đỏ). Chi tiết công thức ở F027.

### UC-013-04 — Biến động doanh thu (biểu đồ cột)
`buildRevenueSeries`: cột tính từ **đơn thật**, đơn cũ nhất bên trái, hiện tại bên phải.
| Kỳ | Số cột | Nhãn |
|---|---|---|
| Hôm nay | 7 ngày gần nhất | CN, T2 … T7 |
| Theo tháng | 6 tháng | Th1 … Th12 |
| Theo năm | 4 năm | 2023 … |
Cột không có đơn = 0. (Biểu đồ dùng toàn bộ đơn hợp lệ, không giới hạn theo kỳ đã chọn ở trên.)

### UC-013-05 — Top sản phẩm bán chạy / bán chậm
- **Bán chạy**: gộp theo **tên món** các dòng đơn trong kỳ, sắp theo số lượng giảm dần, lấy 5; hiển thị tên, nhóm, SL, doanh thu ước tính.
- **Bán chậm / tồn nhiều**: lấy các sản phẩm đang kinh doanh có số lượng bán thấp nhất (3 món), kể cả 0.
- Doanh thu của món trong bảng bán chạy tính `SL × giá hiện tại của sản phẩm` (**không** theo giá thực tế trên đơn, nên lệch nếu có size/giảm giá/đổi giá) — là ước lượng.

### UC-013-06 — Sysadmin
Thấy thêm khối "Tổng quan hệ thống Multi-Tenant": tổng cửa hàng, tổng tài khoản, nhân sự từng cửa hàng; báo cáo gộp **mọi cửa hàng** nếu tải được; không có hao hụt vì không đọc phiếu kho.

## 3. Quy tắc
| Quy tắc | Chi tiết |
|---|---|
| Đơn hủy | Không tính vào doanh thu, số đơn, lợi nhuận, sản phẩm bán |
| Chấm công | Không còn ở màn này; nằm trong "Tài khoản của tôi" (F008) |
| Nguồn dữ liệu | Danh sách đơn đã tải (`simOrders`); với máy chủ là toàn cửa hàng |

## 4. Dữ liệu
Đọc từ `orders`, `order_items`, `products`, `inventory_transactions`. Không có bảng riêng.

## 5. Giới hạn
- Doanh thu theo món là ước lượng (UC-013-05).
- Chưa lọc tùy chọn khoảng ngày (báo cáo cuối ngày F017 có), chưa xuất file, chưa so sánh kỳ trước.
- Tên món trùng nhau bị gộp (khóa theo tên).
