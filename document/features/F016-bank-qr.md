# F016 — Tài khoản ngân hàng và mã QR chuyển khoản (VietQR)

| Trường | Nội dung |
|---|---|
| Mã chức năng | F016 |
| Trạng thái | Hoàn thiện. **Cần quét thử bằng app ngân hàng thật** cho từng ngân hàng sau khi thêm tài khoản (mã BIN ghi theo danh mục NAPAS công khai, chưa kiểm chứng từng cái). Nguồn đặc tả cũ: FEATURES.md mục 5.17 |
| Actor | Chủ, Quản lý (quản lý tài khoản); Thu ngân (hiển thị QR khi thanh toán) |
| Mã nguồn | `src/components/{BankAccountsDialog,QrCodeImage,KiotCheckoutDialog,CheckoutScreen}.tsx`, `src/utils/{vietqr,banks,transferInfo}.ts` |
| Liên quan | F002, F015, F022 |

## 1. Mục tiêu
Hiện mã QR chuyển khoản đúng số tiền và nội dung ngay lúc thanh toán, in lên phiếu tạm tính để khách quét.

## 2. Use case

### UC-016-01 — Quản lý tài khoản ngân hàng
Vào từ *Sổ quỹ → Tài khoản ngân hàng*, hoặc nút *+ Thêm tài khoản / Quản lý* ngay trong hộp thanh toán.
| Trường | Quy tắc |
|---|---|
| Số tài khoản | Bỏ khoảng trắng; phải là **4–20 chữ số**: "Số tài khoản chỉ gồm chữ số (4-20 số)." |
| Ngân hàng | Chọn từ danh sách `BANKS` (mã, tên, BIN): "Vui lòng chọn ngân hàng." |
| Chủ tài khoản | Tùy chọn |
| Tên gợi nhớ (`accountName`) | Trống → dùng chủ tài khoản, rồi mã ngân hàng |
| Ghi chú | Tùy chọn |
| Mặc định | Tài khoản **đầu tiên** tự là mặc định; đặt tài khoản khác mặc định thì các tài khoản còn lại bị bỏ cờ |
| Xóa | Hỏi `Xóa tài khoản <tên> (<số>)? Các khoản đã ghi sổ trước đó vẫn giữ nguyên.` ; khoản đã ghi sổ giữ `bank_account_id` cũ |
Thêm ngân hàng chưa có trong danh sách: bổ sung vào `src/utils/banks.ts`.

### UC-016-02 — QR trong hộp thanh toán
```
chọn "Chuyển khoản" (hoặc có phần chuyển khoản trong thanh toán kết hợp):
    account = tài khoản mặc định, nếu không có thì tài khoản đầu tiên
    nếu chưa có tài khoản -> không có QR; hiện nút thêm tài khoản
    payload = buildVietQRPayload({bin của ngân hàng, số tài khoản, amount = số tiền chuyển khoản, memo = tên bàn})
    hiển thị QR + nút "Hiện mã QR" để phóng to cho khách
thu ngân bấm Thanh toán sau khi tự xác nhận đã nhận tiền
```
Hệ thống **không tự đối soát** giao dịch ngân hàng.

### UC-016-03 — QR trên phiếu in
| Phiếu | QR |
|---|---|
| Tạm tính | Tài khoản mặc định, **đúng số tiền** của đơn, tiêu đề "QUÉT MÃ ĐỂ CHUYỂN KHOẢN" |
| Hóa đơn đã thanh toán | Chỉ thông tin tài khoản của cửa hàng (không số tiền trong mã), tiêu đề "TÀI KHOẢN NGÂN HÀNG CỦA CỬA HÀNG" |
In ESC/POS: QR vẽ thành ảnh 440px, không làm mịn để quét được (F022).

## 3. Nội dung QR (`buildVietQRPayload`)
Chuẩn VietQR / NAPAS 247 (EMVCo), sinh **offline**:
```
00 02 "01"                      phiên bản
01 02 "12" nếu có số tiền | "11" nếu không (mã tĩnh)
38 ..  [00 "A000000727"][01 [00 BIN][01 số tài khoản]][02 "QRIBFTTA"]
53 03 "704"                     tiền tệ VND
54 ..  số tiền (nếu > 0, làm tròn)
58 02 "VN"
62 ..  [08 nội dung]            nếu có memo
63 04  CRC16-CCITT-FALSE (poly 0x1021, khởi tạo 0xFFFF)
```
Nội dung chuyển khoản (`sanitizeMemo`): bỏ dấu, chỉ giữ `A-Z a-z 0-9 khoảng trắng . _ -`, cắt còn **25 ký tự**.

## 4. Dữ liệu (Database) — bảng `bank_accounts`
`id, store_id, account_name, account_number, bank_code, bank_name, holder, note, is_default, created_at, updated_at, deleted_at, rev` (migration v8). Khoản thanh toán lưu `bankAccountId` trong `orders.payments`.

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Có nhiều tài khoản | Hộp thanh toán ghi tài khoản nhận (`bankAccountId`) theo khoản chuyển khoản; phiếu in luôn dùng tài khoản mặc định |
| Không có tài khoản | Không in/hiện QR |
| Mã BIN ngân hàng sai | QR không quét được ở một số app; kiểm tra bằng quét thử |
| Tên bàn có tiếng Việt | Được bỏ dấu trong nội dung chuyển khoản |
| Xóa tài khoản đã dùng | Báo cáo/sổ quỹ vẫn giữ các khoản cũ |
