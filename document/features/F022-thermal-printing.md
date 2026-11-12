# F022 — In hóa đơn, phiếu tạm tính và phiếu bếp (ESC/POS qua USB hoặc Bluetooth)

| Trường | Nội dung |
|---|---|
| Mã chức năng | F022 |
| Trạng thái | USB (WebUSB) và Bluetooth Classic (Web Serial) trên Chrome/Edge đã có test tự động. **Chưa kiểm chứng với máy in thật** (Bluetooth chưa in thử với MPT-II); app Android/iOS chưa in trực tiếp được; chưa có in qua mạng IP |
| Actor | Thu ngân, Phục vụ (in), Chủ/Quản lý (cấu hình máy in) |
| Mã nguồn | `src/printing/{escpos,dither,receiptRenderer,receiptDocument,kitchenTicketDocument,receiptPrinting,kitchenPrinting,printerSettings,printerTransport,usbTransport,serialTransport,wrapText}.ts`, `src/components/{ReceiptThermal,PrinterSettingsDialog}.tsx`, CSS `@media print` trong `src/index.css` |
| Liên quan | F002 (thanh toán), F004 (báo bếp), F016 (QR chuyển khoản), F028 (giảm giá theo món, hiển thị trên hóa đơn) |

## 1. Mục tiêu
- In hóa đơn, phiếu tạm tính và phiếu bếp **thẳng ra máy in nhiệt** bằng lệnh ESC/POS, không phụ thuộc driver hệ điều hành (nguyên nhân lỗi `window.print()` trên máy SUPERISC S31 / macOS).
- Cho phép **hai máy in**: một ở quầy (hóa đơn), một ở bếp (phiếu bếp).
- Nếu không in trực tiếp được thì quay lại hộp thoại in của trình duyệt (chỉ với hóa đơn).

## 2. Cách in (tổng quan)
```
ReceiptDocument (danh sách khối)  ->  vẽ lên canvas (chữ Việt có dấu, logo, QR)
   -> đổi sang ảnh đen trắng (dither) -> đóng gói ESC/POS raster (GS v 0, dải 128 dòng)
   -> ghi qua WebUSB (endpoint OUT) -> cắt giấy
```
In bằng **ảnh** (không dùng bảng mã chữ của máy in) để hiển thị đúng tiếng Việt trên mọi máy in.

| Thông số | Giá trị |
|---|---|
| Khổ giấy | 58 mm = 384 chấm, hoặc 80 mm = 576 chấm. 8 chấm/mm |
| Dịch phải (`shiftRightMm`) | 0–10 mm (mặc định 1,5) cho máy in lệch đầu in |
| Logo | rộng cố định (`LOGO_WIDTH_DOTS`), làm mịn (smooth) |
| QR | rộng `QR_WIDTH_DOTS`, không làm mịn (giữ nét để quét được) |

## 3. Use case

### UC-022-01 — Chọn và lưu máy in
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | USB: trình duyệt hỗ trợ WebUSB (Chrome/Edge), máy in cắm USB và bật nguồn. Bluetooth: trình duyệt hỗ trợ Web Serial (Chrome/Edge), máy in đã **ghép đôi và kết nối** trong cài đặt Bluetooth của hệ điều hành (máy in Bluetooth Classic hiện thành cổng nối tiếp) |
| Luồng | Menu tài khoản → "Máy in hóa đơn" (`PrinterSettingsDialog`) → chọn khổ giấy, độ dịch phải → "Chọn máy in USB" (trình duyệt hỏi quyền USB) hoặc "Chọn máy in Bluetooth" (trình duyệt liệt kê cổng nối tiếp, người dùng chọn máy in) → lưu. Máy in bếp riêng có hai nút tương tự |
| Tùy chọn | Bật "In phiếu bếp khi báo bếp". Chọn thêm **máy in bếp riêng** (`kitchenUsb`); bỏ trống thì phiếu bếp dùng máy in hóa đơn |
| Kiểm tra | Nút in thử hóa đơn (`TEST_RECEIPT`) và in thử phiếu bếp (`TEST_KITCHEN_TICKET`) |
| Lưu | `localStorage` khóa `smartpos.printer`, **theo từng trình duyệt** (mỗi quầy một máy in) |

### UC-022-02 — In hóa đơn sau thanh toán / in tạm tính
Hộp `ReceiptThermal` (hai biến thể `variant`: hóa đơn, `provisional`).
```
bấm In:
  if (!canPrintDirectly('receipt')):          # trình duyệt không có WebUSB hoặc chưa chọn máy in
        window.print()                          # in qua hộp thoại trình duyệt (vùng #print-area)
  else:
        nếu có thông tin chuyển khoản -> tạo ảnh QR 440px
        printReceipt(buildReceiptDocument(...))  # xếp hàng theo từng máy in
  lỗi bất kỳ -> hiện thông báo lỗi trong hộp, không đóng hộp
```

### UC-022-03 — In phiếu bếp khi báo bếp
Gọi sau khi gửi món (`handleSendToKitchen` trong `POSScreen`):
```
if (!settings.printKitchenTicket || !canPrintDirectly('kitchen')) -> không in, trả false
else printReceipt(buildKitchenTicketDocument(...), 'kitchen')
lỗi in -> alert "Đã báo bếp nhưng không in được phiếu bếp: <lý do>"
```
Món **đã được gửi bếp** dù in lỗi; lỗi in chỉ báo, không hoàn tác.

### UC-022-04 — Xếp hàng in
Mỗi máy in (khóa `usb:<vendorId>:<productId>:<serial>` hoặc `serial:<usbVendorId>:<usbProductId>`) có hàng đợi riêng: các lệnh in **cùng một máy** chạy lần lượt (USB chỉ cho một lệnh giữ giao diện); hai máy khác nhau in song song. Lỗi của một lệnh không chặn lệnh sau.

## 4. Quy tắc nội dung

### 4.1 Hóa đơn / phiếu tạm tính (`buildReceiptDocument`)
Thứ tự khối:
1. Logo cửa hàng (nếu có `logoUrl`), tên cửa hàng IN HOA, địa chỉ, `SĐT: …` (khối nào rỗng thì bỏ).
2. Tiêu đề: `PHIẾU TẠM TÍNH` (tạm tính) hoặc `HÓA ĐƠN THANH TOÁN`; `Số: <order_number>`; `Ngày: <giờ vi-VN>`.
3. `Thu ngân`; `Bàn` (nếu có); `Hình thức` (nếu có `orderType`: `dine-in` → "Ăn tại bàn", còn lại "Mang về"); `Khách hàng` = tên khách, hoặc "Thành viên" nếu có id khách khác `walk-in` mà không có tên, hoặc "Khách vãng lai".
4. `Ghi chú đơn` (nếu có).
5. Từng dòng: tên (đậm); dòng `SL x đơn giá` ở trái, thành tiền (đơn giá × SL) ở phải; **`  Giảm giá món: -x` nếu dòng có giảm giá**; topping `+ n Tên`; `Tùy chọn: size - <các tùy chọn đã chọn, F030>`; `Ghi chú`; `Lô` (bán lẻ).
6. Tổng: nếu có `subtotal` và (giảm giá hóa đơn hoặc giảm giá theo món hoặc VAT) thì in `Tạm tính`, `Giảm giá theo món`, `Giảm giá`, `Thuế VAT`. Luôn in `TỔNG CỘNG`.
7. **Chỉ hóa đơn thật** (không in ở tạm tính): thanh toán kết hợp (từ 2 khoản trở lên) liệt kê từng khoản + `Khách đưa (kết hợp)`; thanh toán một phương thức in `Khách đưa (<nhãn>)` với nhãn `Tiền mặt`, `Chuyển khoản QR`, `Ví điện tử`, còn lại `Thẻ ngân hàng`; `Tiền trả lại`; `Điểm tích lũy cộng thêm: +n điểm` (khi > 0).
8. QR chuyển khoản (khi có tài khoản): tạm tính → "QUÉT MÃ ĐỂ CHUYỂN KHOẢN", hóa đơn → "TÀI KHOẢN NGÂN HÀNG CỦA CỬA HÀNG"; kèm ngân hàng, số tài khoản, chủ tài khoản, `Số tiền`.
9. Cuối: tạm tính → "Phiếu tạm tính, chưa phải hóa đơn thanh toán."; hóa đơn → "Cảm ơn Quý Khách đã ủng hộ!" và "Hẹn gặp lại quý khách lần sau."

Không in hoa hồng kênh bán, giá vốn, công nợ (chỉ dùng nội bộ, F027/F028).

### 4.2 Phiếu bếp (`buildKitchenTicketDocument`)
```
if (không có món) throw "Phiếu bếp không có món nào để in."   # lỗi của nơi gọi
in: PHIẾU BẾP (lớn, đậm), tên bàn (rỗng -> "Mang về"), giờ + ngày, "Nhân viên: <tên>" (nếu có)
mỗi món: "<SL> x <tên>" (lớn, đậm); dòng tùy chọn: size - <các tùy chọn đã chọn, F030, vd `Đường 50%, Đá 70%`> (bỏ phần trống);
         "+ <topping>" nếu có; "Ghi chú: <ghi chú>" (đậm) nếu có
cuối: "Tổng: <tổng SL> phần"
```
Không có giá tiền.

## 5. Thông báo lỗi
| Tình huống | Thông báo |
|---|---|
| Chưa chọn máy in | "Chưa chọn máy in. Mở "Máy in hóa đơn" trong menu tài khoản để chọn." |
| Trình duyệt không có WebUSB | "Trình duyệt này không in trực tiếp được. Hãy dùng Chrome hoặc Edge." |
| Máy in không còn kết nối | "Không thấy máy in "<tên>". Cắm dây USB, bật máy in hoặc chọn lại máy in." |
| Không mở/claim được USB | "Không mở được máy in (<chi tiết>). Kiểm tra dây USB và nguồn máy in." |
| Bluetooth: không mở được cổng | "Không mở được máy in (<chi tiết>). Kiểm tra máy in đã bật và đã kết nối Bluetooth với thiết bị này." |
| Bluetooth: ghi giữa chừng thất bại | "Gửi dữ liệu tới máy in thất bại (<chi tiết>)." |
| Bluetooth: không thấy máy in | "Không thấy máy in "<tên>". Bật máy in, kết nối Bluetooth với thiết bị này hoặc chọn lại máy in." |
| Thiết bị không có endpoint OUT | "Thiết bị USB này không có cổng nhận dữ liệu in. Hãy chọn đúng máy in." |
| Máy in từ chối | "Máy in từ chối dữ liệu (trạng thái <x>)." |
| Cấu hình lưu bị hỏng | "Cấu hình máy in bị hỏng (<lý do>). Hãy chọn lại máy in." (không dùng máy in sai âm thầm) |
| Không đọc được logo/QR | "Không đọc được ảnh (logo hoặc mã QR) để in." |

## 6. Dữ liệu
Không lưu trong CSDL. Cấu hình `PrinterSettings` trong `localStorage` của từng trình duyệt:
`{ paperWidth: 58|80, shiftRightMm: 0..10, printKitchenTicket: boolean, printer?: SavedPrinter, kitchenPrinter?: SavedPrinter }`, với `SavedPrinter = SavedUsbPrinter | SavedSerialPrinter`: `{ type: 'usb', vendorId, productId, serialNumber?, label }` hoặc `{ type: 'serial', usbVendorId?, usbProductId?, label }`. Cấu hình lưu trước đây (trường `usb`/`kitchenUsb`, không có `type`) được đọc như máy in USB và ghi ở dạng mới lần lưu kế tiếp.

## 7. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Có máy in bếp riêng nhưng đang tắt | Phiếu bếp lỗi "Không thấy máy in..." (alert); món vẫn gửi bếp |
| Không chọn máy in bếp | Phiếu bếp in ở máy in hóa đơn |
| Hai máy in giống hệt nhau | Phân biệt bằng số serial (nếu máy báo); không có serial thì coi là một máy |
| Hóa đơn tạm tính nhưng chưa có tài khoản ngân hàng | Không có khối QR |
| In từ điện thoại/app native | Chưa hỗ trợ in trực tiếp; dùng in trình duyệt (nếu có) |
| Hai thu ngân bấm in cùng lúc ở một quầy | Xếp hàng, in lần lượt |

## 8. Kiểm thử
`printing.test.ts`, `kitchenTicket.test.ts`, `printerRouting.test.ts` (chọn máy in theo mục đích, hàng đợi theo máy), `usbPrinting.test.ts`, `serialPrinting.test.ts` (cổng nối tiếp giả), `dither.test.ts`.

## 9. Giới hạn
- Chưa in được từ app Android/iOS (cần plugin Bluetooth/USB/TCP riêng); chưa in qua mạng IP (cổng 9100 cần chương trình cầu nối hoặc plugin native, đã bàn nhưng chưa làm).
- Bluetooth qua Web Serial: cổng không cho biết tên máy in nên nhãn là "Máy in Bluetooth (cổng nối tiếp)"; hai máy in Bluetooth cùng lúc không phân biệt được và app báo lỗi "Có nhiều cổng nối tiếp giống nhau...". Không có trên Safari/iPhone/Firefox.
- In bằng ảnh nên chậm hơn lệnh chữ; với hóa đơn dài khoảng vài giây.
- Chưa có tùy chọn in nhiều liên, in lại phiếu bếp.
