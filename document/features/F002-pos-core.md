# F002 — Quầy bán hàng (POS): giỏ hàng, tùy chọn món, giảm giá, VAT, thanh toán

| Trường | Nội dung |
|---|---|
| Mã chức năng | F002 |
| Trạng thái | Hoàn thiện. Bố cục PC kiểu KiotViet **chưa kiểm thử trên thiết bị thật**. Nguồn đặc tả cũ: FEATURES.md mục 5.2 |
| Actor | Thu ngân, Phục vụ, Chủ, Quản lý |
| Mã nguồn | `src/components/{POSScreen,KiotCheckoutDialog,CheckoutScreen,KiotTableGrid}.tsx`, `src/utils/{payments,sizes,costing,saleAdjustments,tableOps,recipes}.ts`, `src/printing/*` |
| Liên quan | F003 (bàn), F004 (bếp), F005 (thực đơn), F006/F023 (kho), F007 (khách), F016 (QR), F022 (in), F026 (ví), F027 (giá vốn), F028 (giảm giá, kênh bán) |

## 1. Mục tiêu
Thu ngân chọn món, chỉnh số lượng/ghi chú/tùy chọn, tính tiền (giảm giá, VAT), thanh toán và in hóa đơn thật nhanh; giao diện tự đổi theo mô hình **F&B** hoặc **Bán lẻ**.

## 2. Giỏ hàng
- Mỗi "đơn đang mở" là một giỏ (`carts` + `cart_items`) khóa theo id bàn; hai giỏ ảo `takeaway` (Mang về) và `delivery` (Giao đi); bán lẻ có một giỏ riêng (`RETAIL_CART_ID`).
- **Định danh dòng** `lineKey` = sản phẩm + ghi chú + size + đường + đá + topping. Hai dòng cùng sản phẩm nhưng khác bất kỳ phần nào là **hai dòng riêng**.

## 3. Use case

### UC-002-01 — Thêm món vào giỏ
```
handleAddToCart(product):
    if (!product.isAvailable)              -> bíp lỗi + "Sản phẩm này hiện đang báo hết hàng!"
    mods = {}
    if (F&B && món có size)                -> mods.size = size mặc định (đầu tiên)
    if (F&B && món là đồ uống)             -> mods.sugarLevel = mặc định, mods.iceLevel = mặc định (100%)
    if (F&B && giỏ rỗng && bàn có phiếu đặt trước):
         hỏi xác nhận "Bàn này đã được đặt trước, hãy xác nhận thông tin khách. Khách đặt: <tên - SĐT - hẹn giờ> [Ghi chú]"
         không xác nhận -> không thêm
    if (bán lẻ):
         batch = lô còn tồn có hạn gần nhất (FIFO/FEFO)
         không có lô -> "Cảnh báo! Sản phẩm này đã hết hàng tồn kho trong hệ thống Lô!"
    if (đã có dòng cùng lineKey) quantity += 1   else thêm dòng mới (SL 1)
    nếu là món đầu tiên của bàn F&B và bàn chưa có openedAt -> ghi openedAt = bây giờ
```
Nhập mã vạch/SKU (ô quét tay): khớp **SKU chính xác** → thêm như trên; không khớp → "Không tìm thấy sản phẩm nào có SKU/Mã vạch: <mã>". (Chưa quét bằng camera.)

### UC-002-02 — Chỉnh dòng
- `+` / `−`: tăng/giảm 1; giảm xuống dưới 1 thì xóa dòng. Thùng rác: xóa cả dòng.
- Ghi chú dòng, ghi chú cả đơn (lưu vào `orders.note`), chọn size (đổi đơn giá theo size), mức đường/đá, topping (F005).
- Với F&B, thay đổi dòng đã báo bếp đi qua `changeKitchenItems` (F023/F004).

### UC-002-03 — Chọn khách
Ô *Tìm khách hàng (F4)* hoặc nút **+ thêm khách hàng**. Thêm nhanh cần **tên và SĐT** (thiếu một trong hai: không lưu). Khách mới vào cùng danh sách khách hàng của cửa hàng. Không chọn: "Khách vãng lai".

### UC-002-04 — Tính tiền
```
cartSubtotal      = Σ (đơn giá dòng × SL)        # đơn giá dòng = giá theo size + Σ giá topping × SL topping
lineDiscountTotal = Σ giảm giá từng dòng (F028)
discountAmount    = max(0, min(giảm giá nhập, cartSubtotal − lineDiscountTotal))   # không vượt tạm tính
taxableAmount     = cartSubtotal − lineDiscountTotal − discountAmount
taxAmount         = round(taxableAmount × VAT% / 100)
grandTotal        = taxableAmount + taxAmount
điểm tích lũy     = floor(grandTotal / 10.000)    # 1 điểm / 10.000đ, chỉ khi có chọn khách
```
Thứ tự đúng: Tạm tính → giảm giá theo món → giảm giá hóa đơn → VAT.

### UC-002-05 — Thanh toán
Mở hộp thanh toán (PC: `KiotCheckoutDialog` 2 khung; điện thoại: `CheckoutScreen`). Phím tắt PC: F3 tìm món, F4 tìm khách, F8 ô khách thanh toán, F9 thanh toán, F10 thông báo bếp.
| Phương thức | Hành vi |
|---|---|
| Tiền mặt | Ô *Khách thanh toán* gõ trực tiếp hoặc bàn phím ảo (0–9, 000, xóa, C, *Vừa đủ*) và gợi ý mệnh giá. Tiền thừa = khách đưa − cần trả. Nút khóa nếu chưa đủ |
| Chuyển khoản | Hiện QR VietQR (F016); thu ngân xác nhận khi đã nhận tiền |
| Thẻ | Quẹt thẻ ở máy POS ngân hàng rồi xác nhận |
| Ví điện tử | F026 |
| Kết hợp | Hộp *Kết hợp phương thức*; luật ở F026 |
Giỏ trống: "Giỏ hàng trống! Hãy chọn món trước khi thanh toán." Đang xử lý: nút khóa chống bấm đúp.

### UC-002-06 — Hoàn tất đơn (`handleCheckoutSubmit`)
Thứ tự thực hiện khi bấm Thanh toán:
1. Cấp **số hóa đơn** `HD00001…` từ máy chủ; mất mạng (native) → mã tạm (F021).
2. Dựng dòng đơn: giá theo size, **giá vốn dòng** (F027), giảm giá dòng (F028), topping, lô (bán lẻ), ghi chú, tùy chọn.
3. **Bán lẻ**: trừ tồn **lô đầu tiên còn hàng của từng sản phẩm** theo số lượng bán (không dưới 0).
4. **F&B**: trừ kho theo công thức cho phần chưa báo bếp; gắn phiếu xuất lúc báo bếp vào đơn; khóa tồn của phiếu bếp (F023).
5. Cộng điểm cho khách đã chọn.
6. Tạo `orders` + `order_items`: `payments` luôn ghi chi tiết (quỹ/tài khoản); `paymentMethod = mixed` chỉ khi từ 2 khoản; `paidAmount`, `changeAmount`; `customerName` chụp lại tên; `tableNumber`, `orderType` (`dine-in`, hoặc `takeaway` cho cả Mang về lẫn Giao đi), `tableId`; `costRecorded = true`; kênh bán/hoa hồng (F028).
7. F&B có bàn: trả cả nhóm bàn về trống, **xóa phiếu đặt bàn** của các bàn đó.
8. Xóa giỏ và ghi chú đơn; mở hộp hóa đơn để in (F022).
9. Ghi nhật ký thao tác "Thanh toán đơn hàng".

### UC-002-07 — Phiếu tạm tính
Nút **In tạm tính** (không cần thanh toán): phiếu 80mm có tạm tính/giảm giá/VAT/tổng, QR của tài khoản mặc định với đúng số tiền; không có khách đưa, tiền thừa, điểm (F022). Giỏ trống: "Đơn hàng trống! Hãy chọn món trước khi in tạm tính."

## 4. Bán lẻ khác F&B ở đâu
| Nội dung | Bán lẻ | F&B |
|---|---|---|
| Kho | Trừ theo lô lúc thanh toán | Trừ theo công thức lúc báo bếp/thanh toán (F023) |
| Bàn / bếp / đặt bàn | Không có | Có (F003, F004) |
| Tùy chọn size/đường/đá/topping | Không | Có |
| Kênh bán | Có (nếu có kênh) | Chỉ Mang về/Giao đi |

## 5. Dữ liệu (Database)
| Bảng | Cột chính |
|---|---|
| `carts` | `id, store_id, cart_key, customer_id, note` |
| `cart_items` | `cart_id, cart_key, product_id, quantity, note, size, sugar_level, ice_level, toppings (JSON), sent_quantity, line_no` |
| `orders` | `order_number, temp_order_number, store_type, order_type ('dine-in'/'takeaway'), status ('completed'/'void'), table_id, table_number, customer_id, customer_name, staff_id, staff_name, subtotal, discount_amount, line_discount_amount, tax_amount, total_amount, total_cost, cost_recorded, payment_method, payments (JSON), paid_amount, change_amount, points_earned, points_used, channel_name, commission_percent, commission_amount, note` |
| `order_items` | `order_id, product_id, product_name, quantity, price, cost, discount, batch_id, batch_code, note, size, sugar_level, ice_level, toppings (JSON)` |
| `customers` | `points` (cộng khi thanh toán) |

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Đơn có tổng bằng 0 (giảm hết) | Thanh toán được |
| Đổi size sau khi thêm | Đơn giá đổi theo size (cộng topping) |
| Món không có size | Một giá (không có nút S/M/L cố định) |
| Bán lẻ, hai lô cùng sản phẩm, SL lớn hơn tồn lô đầu | Chỉ trừ lô đầu, tối đa về 0; phần dư **không** chuyển sang lô sau (giới hạn hiện tại) |
| `points_used` | Cột có nhưng **chưa có chức năng đổi điểm** |
| Mất mạng khi cấp số HD (web) | Báo lỗi, không lập hóa đơn; native dùng mã tạm |

## 7. Kiểm thử
`payments.test.ts`, `tableOps.test.ts`, `sizes.test.ts`, `costing.test.ts`, `saleAdjustments.test.ts`, `kitchenStock.test.ts`, `printing.test.ts`.
