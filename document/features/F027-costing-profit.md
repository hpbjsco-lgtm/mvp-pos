# F027 — Giá vốn bán hàng, lợi nhuận và hao hụt

| Trường | Nội dung |
|---|---|
| Mã chức năng | F027 (G1, G2 trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động; chưa đối chiếu số liệu với dữ liệu thật của khách |
| Actor | Chủ, Quản lý (xem). Thu ngân tạo dữ liệu gián tiếp qua thanh toán |
| Mã nguồn | `src/utils/{costing,profit,recipes,endOfDay}.ts`, `POSScreen.tsx` (lưu giá vốn lúc thanh toán), `ReportsSection.tsx`, `EndOfDayReport.tsx` |
| Liên quan | F005 (công thức), F023 (kho), F024 (kiểm kho), F028 (hoa hồng kênh) |

## 1. Mục tiêu
Cho Chủ/Quản lý biết **lãi thật**: doanh thu chưa thuế trừ giá vốn món đã bán, trừ chiết khấu đối tác, trừ hao hụt (hư hỏng và lệch kiểm kho).

## 2. Quyết định nghiệp vụ (đã chốt)
| # | Nội dung |
|---|---|
| 1 | Giá vốn món **cố định theo thiết lập trên món** (không dùng giá nhập thực của lô FEFO) |
| 2 | Hao hụt **tách riêng**, không trộn vào giá vốn |
| 3 | Bỏ qua lô tồn kho âm khi tính giá |
| 4 | Món chế biến: giá vốn tính từ **công thức nguyên liệu** khi lưu món, nên không cần cơ chế khác |
| 5 | Hoa hồng kênh bán là **chi phí bán hàng riêng**, không nằm trong giá vốn (đề xuất của người phát triển, **chờ chủ dự án xác nhận**) |

## 3. Công thức
```
giá vốn 1 phần của dòng = cost(món) + Σ cost(topping) × SL topping       # size không đổi giá vốn; mục không tìm thấy tính 0
giá vốn đơn (totalCost) = Σ (giá vốn 1 phần × SL dòng)

doanh thu chưa thuế = Σ (totalAmount − taxAmount)          # chỉ đơn đã lưu giá vốn
lợi nhuận gộp       = doanh thu chưa thuế − Σ totalCost
chiết khấu đối tác  = Σ commissionAmount                    # F028
hao hụt = hư hỏng + kiểm kho thiếu − kiểm kho thừa
lợi nhuận sau chiết khấu và hao hụt = gộp − chiết khấu − hao hụt
```
Giá vốn của món chế biến: `recipeCost = round(Σ cost(nguyên liệu) × số lượng cơ bản)`, tính khi lưu công thức (F005).

### 3.1 Hao hụt (`summarizeProfit`)
Duyệt phiếu kho của kỳ (cả nguyên liệu và sản phẩm):
```
if (type == ADJUSTMENT && ghi chú KHÔNG bắt đầu bằng 'Hoàn kho do hủy '):  adjustments += totalAmount
    # phiếu hoàn kho (bếp hủy món, hủy hóa đơn) là đảo bút toán bán hàng, không phải mất mát
if (type == STOCKTAKE): với mỗi dòng: giá trị = price × quantity (có dấu)
        giá trị < 0 -> stocktakeShort += |giá trị|
        giá trị ≥ 0 -> stocktakeSurplus += giá trị
total = adjustments + stocktakeShort − stocktakeSurplus     # âm nếu kiểm kho thấy nhiều hơn mất
```

## 4. Use case

### UC-027-01 — Lưu giá vốn khi thanh toán
Trong `POSScreen` lúc tạo hóa đơn: mỗi dòng `order_items.cost = lineUnitCost(dòng)`, `orders.total_cost = orderCost(giỏ)`, `orders.cost_recorded = 1`. Giá vốn **đóng băng** tại thời điểm bán; đổi giá vốn món sau đó không làm lệch báo cáo cũ.

### UC-027-02 — Xem lợi nhuận (Báo cáo doanh thu)
Màn Báo cáo (Hôm nay / Tháng / Năm) hiển thị thẻ "Lợi nhuận sau chiết khấu và hao hụt" và khối **Lợi nhuận <kỳ>**:
Doanh thu (chưa thuế) → Giá vốn hàng bán → **Lợi nhuận gộp** → Chiết khấu đối tác (Grab, Shopee...) → Hao hụt (hư hỏng, chênh lệch kiểm kho) → **Lợi nhuận sau chiết khấu và hao hụt**.
Phiếu kho lọc theo khoảng thời gian của kỳ. Tài khoản **sysadmin** (dữ liệu toàn hệ thống): không có phiếu kho nên hao hụt = 0.

### UC-027-03 — Xem lợi nhuận (Báo cáo cuối ngày)
Mục **Lợi nhuận** gồm các dòng như trên, thêm chú thích số hóa đơn có giá vốn, chi tiết hao hụt (Hư hỏng · Kiểm kho thiếu · Kiểm kho thừa) và dòng **Chưa có giá vốn** nếu có hóa đơn cũ.

## 5. Quy tắc if/else
| Điều kiện | Xử lý |
|---|---|
| Đơn `status = void` | Không tính (bộ lọc đầu vào của báo cáo) |
| `cost_recorded = 0` (hóa đơn lập trước khi có tính năng, migration v19) | **Bị bỏ qua** cả doanh thu lẫn giá vốn trong khối lợi nhuận; đếm vào `ordersWithoutCost`, hiện dòng "Chưa có giá vốn: N" |
| Món/topping không có `cost` | Giá vốn 0 (lợi nhuận bị đánh giá cao; cần nhập giá vốn) |
| Lô kho âm | Không ảnh hưởng giá vốn (giá vốn cố định theo món) |
| Kỳ không có phiếu kho | Hao hụt = 0 |

## 6. Dữ liệu
| Bảng.cột | Ý nghĩa | Migration |
|---|---|---|
| `orders.total_cost REAL` | Tổng giá vốn đơn | từ trước (giá trị 0 với đơn cũ) |
| `orders.cost_recorded INTEGER DEFAULT 0` | 1 = đơn đã lưu giá vốn | v19 |
| `order_items.cost REAL` | Giá vốn 1 phần của dòng (đã gồm topping) | |
| `products.cost REAL` | Giá vốn thiết lập của món/topping/nguyên liệu | |
| `inventory_transactions` (`adjustment`, `stocktake`) | Nguồn hao hụt | |

## 7. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Giảm giá toàn đơn / theo món | Doanh thu chưa thuế đã trừ giảm giá; giá vốn không đổi → lãi giảm đúng |
| Hủy món ở bếp (hoàn kho) | Không tính hao hụt; hóa đơn chưa có nên không có doanh thu |
| Hủy hóa đơn | Đơn `void` bị loại khỏi lợi nhuận; phiếu hoàn kho không là hao hụt |
| Kiểm kho thừa lớn hơn hư hỏng | `hao hụt` âm → tăng lợi nhuận (hiển thị âm) |
| Xóa hàng hóa sau khi bán | Giá vốn đã lưu trên đơn vẫn giữ |

## 8. Kiểm thử
`costing.test.ts`, `profit.test.ts`, `endOfDay.test.ts`.

## 9. Giới hạn / việc chờ quyết định
- Hoa hồng kênh bán đang là chi phí riêng; chờ chủ dự án xác nhận (mục 2.5).
- Hoa hồng tính trên số tiền đã gồm VAT hay không: hiện lấy theo `totalAmount` của đơn (chờ xác nhận).
- Chưa có lợi nhuận theo món, theo chi nhánh.
