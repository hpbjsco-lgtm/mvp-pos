# F015 — Sổ quỹ và dòng tiền (phiếu thu, phiếu chi)

| Trường | Nội dung |
|---|---|
| Mã chức năng | F015 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.16. **Cập nhật:** ví điện tử có phương thức thanh toán riêng (F026); số phiếu `PT`/`PC` do máy chủ cấp (F021) |
| Actor | Chủ, Quản lý (màn **Sổ quỹ**) |
| Mã nguồn | `src/components/CashbookSection.tsx`, `src/utils/cashbook.ts`, `src/components/BankAccountsDialog.tsx` |
| Liên quan | F010 (khác: đối soát két theo ca), F016, F017, F021, F026 |

## 1. Mục tiêu
Theo dõi dòng tiền theo **quỹ** (Tiền mặt / Ngân hàng / Ví điện tử / Tổng quỹ) và **loại thu chi**, gồm tiền bán hàng tự động và phiếu thu/chi lập tay.

## 2. Nguồn dữ liệu (không nhân đôi)
| Nguồn | Cách vào sổ |
|---|---|
| Hóa đơn bán hàng | **Tự động**, mỗi khoản thanh toán một dòng thu: `cash` → quỹ Tiền mặt; `wallet` → quỹ Ví điện tử; `qr`/`card` → quỹ Ngân hàng (đúng tài khoản đã chọn, nếu thiếu lấy tài khoản mặc định, rồi tài khoản đầu tiên). Loại "Thu tiền bán hàng". Mã = số hóa đơn |
| Phiếu thu/chi lập tay | Bảng `cash_vouchers` |
Hủy hóa đơn → khoản thu tự mất khỏi sổ (đơn `void` không sinh dòng đang hiệu lực). Phiếu lập tay hủy bằng **Hủy phiếu**.

## 3. Use case

### UC-015-01 — Xem sổ theo kỳ
Kỳ: Hôm nay / Tuần này (thứ Hai là đầu tuần) / Tháng này / Năm nay / Tùy chọn. Lọc theo quỹ, theo tài khoản ngân hàng, chỉ thu / chỉ chi, tìm kiếm; ô "Hiện phiếu đã hủy".
Bốn số tổng (`summarize`), chỉ tính khoản `paid` khớp quỹ/tài khoản:
```
Quỹ đầu kỳ = Σ (thu − chi) của mọi khoản trước mốc bắt đầu kỳ     # tích lũy
Tổng thu   = Σ thu trong kỳ
Tổng chi   = Σ chi trong kỳ
Tồn quỹ    = Quỹ đầu kỳ + Tổng thu − Tổng chi
```

### UC-015-02 — Dòng tiền theo loại thu chi
Biểu đồ thanh theo từng loại (`breakdownByCategory`): tổng và số khoản, chỉ khoản đã thanh toán; thu trước chi, mỗi nhóm giảm dần theo tiền.
Loại gợi ý: Thu — *Thu khác*, *Vốn góp / Số dư đầu kỳ*, *Hoàn tiền từ nhà cung cấp*; Chi — *Chi nhập hàng / nguyên liệu*, *Chi lương nhân viên*, *Chi mặt bằng, điện nước*, *Chi marketing*, *Chi sửa chữa, vật tư*, *Chi khác*. Nhập loại mới tự do.

### UC-015-03 — Lập phiếu thu / chi
Trường: quỹ (Tiền mặt / Ngân hàng / Ví điện tử), tài khoản ngân hàng (khi quỹ Ngân hàng; mặc định tài khoản mặc định), **giá trị**, loại thu chi, người nộp/nhận, điện thoại, ghi chú, thời gian (mặc định bây giờ).
| Điều kiện | Kết quả |
|---|---|
| Giá trị ≤ 0 | "Vui lòng nhập số tiền lớn hơn 0." |
| Quỹ Ngân hàng mà chưa có tài khoản | "Chưa có tài khoản ngân hàng. Hãy thêm tài khoản trước." |
| Loại trống | Thu: "Thu khác"; Chi: "Chi khác" |
| Mã phiếu | `createDocumentNumber('receipt'|'payment')` → `PT0001` / `PC0001` từ máy chủ; mất mạng (native) → mã tạm; không dùng máy chủ → `nextVoucherCode` (số lớn nhất + 1) |
| Lưu | `status = 'paid'`, `createdBy` = tên người lập |
Số dư đầu của một quỹ: lập **phiếu thu** loại "Vốn góp / Số dư đầu kỳ".

### UC-015-04 — Hủy phiếu
Chỉ phiếu lập tay đang `paid`: hỏi "Hủy phiếu này? Phiếu hủy không còn được tính vào sổ quỹ." → `status = 'cancelled'` (không xóa; hiện khi bật "Hiện phiếu đã hủy", mờ). Dòng bán hàng không có nút hủy (hủy ở Lịch sử hóa đơn, F009).

### UC-015-05 — Tài khoản ngân hàng
Quản lý tại *Sổ quỹ → Tài khoản ngân hàng* (F016).

## 4. Dữ liệu (Database) — bảng `cash_vouchers`
`id, store_id, code, temp_code, voucher_type ('receipt'/'payment'), fund ('cash'/'bank'/'wallet'), bank_account_id, amount, category, counterparty, phone, note, status ('paid'/'cancelled'), created_by, created_at, updated_at, deleted_at, rev` (migration v8; `temp_code` v14). `orders.payments` cung cấp khoản bán hàng.

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Hóa đơn thanh toán kết hợp | Nhiều dòng thu, mỗi khoản một quỹ |
| Hóa đơn cũ không có `payments` | `getOrderPayments` coi như trả trọn bằng `payment_method` |
| Khoản chuyển khoản không ghi tài khoản (đơn cũ) | Vào tài khoản mặc định |
| Phiếu có thời gian trong quá khứ | Tính vào kỳ tương ứng; ảnh hưởng quỹ đầu kỳ các kỳ sau |
| Hủy phiếu thu vốn đầu kỳ | Quỹ đầu kỳ giảm tương ứng |
| Hai máy lập phiếu cùng lúc | Mỗi phiếu một id riêng, số chính thức do máy chủ cấp, không trùng (F021) |
| Sổ quỹ và két ca | Phiếu thu/chi **không** nằm trong tiền kỳ vọng của ca (F010) |

## 6. Kiểm thử
`cashbook.test.ts`.
