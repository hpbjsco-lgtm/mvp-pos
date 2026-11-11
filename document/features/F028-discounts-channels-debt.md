# F028 — Giảm giá theo món, kênh bán và chiết khấu đối tác, công nợ khách hàng

| Trường | Nội dung |
|---|---|
| Mã chức năng | F028 (A9 trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động. Báo cáo theo chi nhánh **chưa làm** (để sau) |
| Actor | Thu ngân/Phục vụ (giảm giá, chọn kênh), Chủ/Quản lý (cấu hình kênh, nhập công nợ, xem báo cáo) |
| Mã nguồn | `src/utils/{saleAdjustments,endOfDay,profit}.ts`, `POSScreen.tsx`, `KiotCheckoutDialog.tsx`, `CheckoutScreen.tsx`, `SalesChannelSettings.tsx`, `CustomersSection.tsx`, `EndOfDayReport.tsx`, `ReportsSection.tsx`, `printing/receiptDocument.ts`, `db/useAppData.ts`, `db/auth.ts` |
| Liên quan | F002 (thanh toán), F007 (khách hàng), F017 (báo cáo cuối ngày), F022 (in), F027 (lợi nhuận) |

## 1. Mục tiêu
- Giảm giá **từng món** lúc thanh toán (ngoài giảm giá cả hóa đơn đã có).
- Ghi nhận đơn đi qua **kênh bán** (Grab, Shopee, Be…) có % chiết khấu mà đối tác giữ lại, để biết tiền cửa hàng thực nhận.
- Hiển thị **công nợ khách hàng** (chưa có luồng ghi nợ/thu nợ tự động).

## 2. Quyết định nghiệp vụ
| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | Giảm giá theo món là **theo từng dòng tại thời điểm thanh toán** | đã chốt |
| 2 | Hoa hồng kênh bán là chi phí bán hàng **riêng**, không vào giá vốn (F027) | đề xuất, **chờ xác nhận** |
| 3 | Công nợ: chỉ **hiển thị**, nhập tay | đã chốt |
| 4 | Giảm giá theo %, phân quyền duyệt giảm giá, danh sách kênh mặc định, nợ tự sinh từ "ghi nợ"/"thu nợ", báo cáo theo chi nhánh | chưa quyết/để sau |

## 3. Use case

### UC-028-01 — Giảm giá theo món khi thanh toán
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | Mở hộp thanh toán có dòng món |
| Luồng | Mỗi dòng có ô **Giảm giá món** (nhập số tiền cho **cả dòng**, không phải mỗi phần). Thành tiền dòng hiển thị `giá × SL − giảm` và `-giảm` màu đỏ. Dòng tổng thêm "Giảm giá theo món" |
| Giới hạn | `clampLineDiscount(amount, giá×SL)`: không số, ≤ 0 → 0; làm tròn; **không vượt giá trị dòng** |
| Lưu | `order_items.discount` (mỗi dòng), `orders.line_discount_amount` (tổng) |
| Hóa đơn | Dòng `  Giảm giá món: -x` dưới dòng món; ở phần tổng: `Giảm giá theo món`, `Giảm giá`, `Thuế VAT` (F022) |

### UC-028-02 — Công thức tổng tiền
```
cartSubtotal      = Σ (giá dòng × SL)             # giá dòng đã gồm topping
lineDiscountTotal = Σ giảm giá từng dòng (đã kẹp)
discountAmount    = max(0, min(giảm giá hóa đơn nhập, cartSubtotal − lineDiscountTotal))
taxableAmount     = cartSubtotal − lineDiscountTotal − discountAmount
taxAmount         = round(taxableAmount × VAT% / 100)
grandTotal        = taxableAmount + taxAmount
```
Giảm giá theo món áp dụng **trước**, giảm giá hóa đơn áp dụng trên phần còn lại.

### UC-028-03 — Cấu hình kênh bán
| Mục | Nội dung |
|---|---|
| Vị trí | Màn Tài khoản → khối "Kênh bán" (`SalesChannelSettings`), **chỉ Chủ/Quản lý** (`isAdminRole`) |
| Dữ liệu | Danh sách `{name, commissionPercent}` lưu JSON ở `stores.sales_channels` (chuỗi rỗng nếu không có kênh) |
| Kiểm tra (`validateSalesChannels`) | Tên trống → "Tên kênh bán không được để trống." · Trùng tên (không phân biệt hoa thường) → `Kênh "x" bị trùng tên.` · Chiết khấu không nằm trong 0–100 → `Chiết khấu của kênh "x" phải từ 0 đến 100%.` |
| Lưu | `UPDATE stores SET sales_channels…, rev = rev + 1`; thông báo "Đã lưu danh sách kênh bán." (đồng bộ qua F019) |
| Mặc định | Chưa có kênh nào (danh sách rỗng) |

### UC-028-04 — Chọn kênh bán khi thanh toán
```
channelOffered = có ít nhất 1 kênh  &&  (cửa hàng bán lẻ  ||  giỏ ảo Mang về/Giao đi)
if (!channelOffered): không hiện ô "Kênh bán"
else: ô chọn "Kênh bán" liệt kê  "<tên> (<x>%)"  (giá trị trống = bán trực tiếp)
commissionPercent = kênh đã chọn ? kênh.commissionPercent : 0
commissionAmount  = commissionOf(grandTotal, commissionPercent)
        = (grandTotal ≤ 0 hoặc % ≤ 0) ? 0 : round(grandTotal × min(%, 100) / 100)
```
Hộp thanh toán hiển thị: `Chiết khấu <kênh> (<x>%) -<số tiền>` và `Cửa hàng thực nhận <grandTotal − hoa hồng>`. Đơn lưu `channel_name`, `commission_percent`, `commission_amount`; phần trăm được **chụp lại** tại thời điểm bán (đổi % sau này không đổi đơn cũ).
**Cơ sở tính hoa hồng là `grandTotal`, tức đã gồm VAT** (chờ chủ dự án xác nhận).
Bàn ăn tại chỗ không có ô chọn kênh.

### UC-028-05 — Báo cáo
Báo cáo cuối ngày (`EndOfDayReport`, F017):
| Khối | Nội dung |
|---|---|
| Lợi nhuận | Dòng "Chiết khấu đối tác" (tổng hoa hồng) và "Lợi nhuận sau chiết khấu và hao hụt" (F027) |
| **Kênh bán** | Chỉ hiện khi có ít nhất một đơn thuộc một kênh: mỗi kênh `<n> đơn · Chiết khấu x · Thực nhận y`; đơn không chọn kênh gộp vào "Trực tiếp" |
| Tab Hàng hóa → **Giảm giá theo món** | Mỗi món: tổng giảm = giảm theo món + phần giảm hóa đơn **phân bổ** theo tỷ lệ giá trị còn lại của từng dòng; chú thích số phần, giá trị, giảm theo món, phân bổ, còn lại. Không có giảm giá: "Không có giảm giá" |
| Doanh thu | Dòng "Tổng giảm giá theo món" (`lineDiscount`) |
| **Công nợ khách hàng** | Tổng công nợ, số khách đang nợ, 10 khách nợ nhiều nhất |

### UC-028-06 — Công nợ khách hàng
- Màn Khách hàng: ô **Công nợ (đ)** (số nguyên ≥ 0) trong form; cột "Công nợ" trong bảng, tô đỏ khi > 0.
- **Nhập tay**; thanh toán "ghi nợ" và "thu nợ" chưa có (xem 2.4).
- Báo cáo cuối ngày tổng hợp: khách có `debt > 0`, sắp xếp giảm dần.

## 4. Phân bổ giảm giá hóa đơn xuống từng món (báo cáo)
```
với mỗi hóa đơn hoàn tất:
    base[i] = giá dòng i × SL − giảm theo món dòng i
    baseTotal = Σ base
    phần chia hóa đơn của dòng i = baseTotal > 0 ? round(discountAmount × base[i] / baseTotal) : 0
    net[i] = giá trị gốc − giảm theo món − phần chia
gộp theo tên món; chỉ liệt kê món có (giảm theo món + phần chia) > 0, giảm dần
```
Phân bổ chỉ để báo cáo; giá trị gốc lưu trên đơn không đổi. Do làm tròn, tổng phần chia có thể lệch tối đa vài đồng so với giảm giá hóa đơn.

## 5. Dữ liệu (Database, migration v21)
| Bảng.cột | Kiểu | Ý nghĩa |
|---|---|---|
| `order_items.discount` | REAL NOT NULL DEFAULT 0 | Giảm giá của cả dòng |
| `orders.line_discount_amount` | REAL NOT NULL DEFAULT 0 | Tổng giảm giá theo món |
| `orders.channel_name` | TEXT | Tên kênh (rỗng = trực tiếp) |
| `orders.commission_percent` | REAL | % tại thời điểm bán |
| `orders.commission_amount` | REAL | Số tiền hoa hồng |
| `stores.sales_channels` | TEXT NOT NULL DEFAULT '' | JSON danh sách kênh |
| `customers.debt` | REAL | Công nợ |
Cột mới đã có nhãn trong `conflictPresenter` (F020).

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Giảm dòng lớn hơn giá trị dòng | Bị kẹp bằng giá trị dòng |
| Giảm giá món + giảm giá hóa đơn > tạm tính | Giảm giá hóa đơn bị kẹp phần còn lại, tổng không âm |
| Tổng = 0 (giảm hết) | Vẫn thanh toán được; hoa hồng = 0 |
| % kênh > 100 trong dữ liệu | `commissionOf` kẹp ở 100% |
| Danh sách kênh JSON hỏng | `parseSalesChannels` trả danh sách rỗng (không có thông báo) — lưu ý khác nguyên tắc "báo lỗi rõ", cần cân nhắc |
| Hủy hóa đơn có hoa hồng | Đơn `void` bị loại khỏi báo cáo, hoa hồng cũng bị loại |

## 7. Kiểm thử
`saleAdjustments.test.ts`, `saleAdjustmentColumns.test.ts` (cột DB), `endOfDay.test.ts`, `profit.test.ts`, `receiptDocument` (in).

## 8. Việc chờ quyết định
Xem mục 2: hoa hồng trong giá vốn hay chi phí riêng, cơ sở tính (có VAT hay không), danh sách kênh mặc định, giảm giá theo %, quyền duyệt giảm giá, ghi nợ/thu nợ tự động, báo cáo chi nhánh.
