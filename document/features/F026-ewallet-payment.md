# F026 — Thanh toán bằng ví điện tử và thanh toán kết hợp 4 phương thức

| Trường | Nội dung |
|---|---|
| Mã chức năng | F026 (A7 trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động |
| Actor | Thu ngân, Phục vụ (thanh toán); Chủ/Quản lý (xem sổ quỹ, báo cáo) |
| Mã nguồn | `src/utils/{payments,cashbook,endOfDay}.ts`, `src/types.ts` (`PaymentMethod`, `PaymentPart`, `FundType`), `KiotCheckoutDialog.tsx`, `CheckoutScreen.tsx`, `POSScreen.tsx`, `CashbookSection.tsx`, `ShiftSection.tsx`, `EndOfDayReport.tsx`, `printing/receiptDocument.ts` |
| Liên quan | F002 (thanh toán), F010 (ca), F015 (sổ quỹ), F016 (QR), F017 (báo cáo cuối ngày) |

## 1. Mục tiêu
Ghi nhận khách trả bằng ví (MoMo, ZaloPay…) như một phương thức riêng, tách bạch với tiền mặt, chuyển khoản và thẻ, để sổ quỹ, ca, báo cáo cuối ngày và hóa đơn đều thể hiện đúng.

## 2. Phương thức thanh toán
| Mã | Nhãn | Quỹ ghi sổ | Ghi chú |
|---|---|---|---|
| `cash` | Tiền mặt | `cash` | Có tiền thừa |
| `qr` | Chuyển khoản | `bank` | Gắn tài khoản ngân hàng (`bankAccountId`) |
| `card` | Thẻ | `bank` | Gắn tài khoản ngân hàng |
| `wallet` | Ví điện tử | `wallet` | **Không** gắn tài khoản ngân hàng |
| `mixed` | Kết hợp | tách theo từng khoản | `orders.payment_method = 'mixed'` |

Ví điện tử là **xác nhận thủ công**: thu ngân kiểm tra ví đã nhận tiền rồi mới bấm Thanh toán (hệ thống không kết nối cổng ví).

## 3. Use case

### UC-026-01 — Thanh toán trọn bằng ví
| Mục | Nội dung |
|---|---|
| Luồng | Mở thanh toán (PC: `KiotCheckoutDialog`; điện thoại: `CheckoutScreen`) → chọn **Ví điện tử** → thấy dòng "Khách thanh toán <số tiền> đ bằng ví điện tử. Thu ngân xác nhận khi đã nhận tiền rồi bấm Thanh toán." → Thanh toán |
| Kết quả | Đơn lưu `paymentMethod = 'wallet'`, `payments = [{method:'wallet', amount: tổng}]`; **tiền thừa = 0** |

### UC-026-02 — Thanh toán kết hợp
Nút **Kết hợp** mở hộp *Kết hợp phương thức* có 4 dòng (Tiền mặt, Chuyển khoản, Thẻ, Ví điện tử), mỗi dòng một ô tích + ô số tiền + nút điền phần còn thiếu; báo thiếu/vượt. Mặc định tick: Tiền mặt và Chuyển khoản theo giá trị khởi tạo, Thẻ và Ví tick khi đã có số tiền.

### UC-026-03 — Hiển thị
| Nơi | Cách thể hiện |
|---|---|
| Hóa đơn / phiếu in | `Khách đưa (Ví điện tử)` hoặc liệt kê từng khoản khi từ 2 khoản |
| Sổ quỹ ca (F010) | Ô "Ví điện tử" riêng; **không** cộng vào "Tiền mặt trong két" |
| Sổ quỹ & Dòng tiền (F015) | Quỹ "Ví điện tử" là một loại quỹ; khoản bán hàng bằng ví tự lên quỹ này |
| Báo cáo cuối ngày (F017) | Dòng "Ví điện tử" ở *Bán hàng theo phương thức*, *Thu* và *Chi* |

## 4. Logic `applyMixedPayment(total, {cash, qr, card, wallet})`
```
cash, qr, card, wallet = max(0, giá trị nhập || 0)
received = cash + qr + card + wallet
nonCash  = qr + card + wallet
if (nonCash > total)        -> invalid: "Chuyển khoản + thẻ + ví điện tử vượt quá số tiền khách cần trả."
cashNeeded = total - nonCash
if (cash < cashNeeded)      -> invalid: "Còn thiếu <cashNeeded - cash> đ."
parts: cash cashNeeded (nếu > 0), qr, card, wallet (mỗi khoản > 0)
change = cash - cashNeeded        # tiền thừa chỉ từ phần tiền mặt
```
Số tiền tiền mặt ghi nhận là `cashNeeded` (đã trừ tiền thừa) nên tổng các khoản luôn bằng tổng hóa đơn.

### 4.1 Gắn tài khoản ngân hàng khi lưu đơn (POSScreen)
```
mixed:   mỗi khoản: method là cash hoặc wallet -> giữ nguyên;  khoản còn lại (qr/card) -> thêm bankAccountId
đơn một phương thức: method khác cash và khác wallet và có bankAccountId -> thêm bankAccountId
```

### 4.2 Đơn cũ
`getOrderPayments`: đơn không có `payments` thì coi như thanh toán trọn bằng `paymentMethod` (qr/card/wallet, còn lại tiền mặt). Vì vậy dữ liệu trước khi có ví vẫn hiển thị đúng.

### 4.3 Sổ quỹ (`buildLedger`)
Mỗi khoản thanh toán của đơn là một dòng sổ: `fund = cash` nếu tiền mặt, `wallet` nếu ví, còn lại `bank` (tài khoản = `bankAccountId` hoặc tài khoản mặc định). Đơn **đã hủy** không còn dòng thu. Phiếu thu/chi lập tay chọn được quỹ Ví điện tử (đã có từ trước).

## 5. Dữ liệu (Database)
Không thêm cột/migration riêng:
| Bảng.cột | Giá trị liên quan |
|---|---|
| `orders.payment_method` | `cash` / `qr` / `card` / `wallet` / `mixed` |
| `orders.payments` | JSON `[{method, amount, bankAccountId?}]` (migration v7) |
| `cash_vouchers.fund` | `cash` / `bank` / `wallet` |

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Ví + tiền mặt, ví nhập lớn hơn tổng | Báo vượt, không cho thanh toán |
| Ví trả đủ, tiền mặt đưa 0 | Hợp lệ (`cashNeeded = 0`, `change = 0`) |
| Hủy hóa đơn trả ví | Khoản thu mất khỏi sổ quỹ; **không có hoàn tiền tự động** (thu ngân hoàn thủ công trên ví) |
| Ca có doanh thu ví | Tăng "Tổng doanh thu tạm tính" nhưng không tăng tiền mặt kỳ vọng trong két |

## 7. Kiểm thử
`payments.test.ts`, `cashbook.test.ts`, `endOfDay.test.ts`.

## 8. Giới hạn
- Chưa tích hợp cổng ví để tự xác nhận giao dịch; chưa đối soát với sao kê ví.
- Không có tài khoản ví riêng theo từng ví (MoMo/ZaloPay…): gộp một quỹ "Ví điện tử".
