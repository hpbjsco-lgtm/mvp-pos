# F009 — Lịch sử hóa đơn: tra cứu, in lại, hủy hóa đơn

| Trường | Nội dung |
|---|---|
| Mã chức năng | F009 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.9 |
| Actor | Chủ, Quản lý (màn **Hóa đơn** chỉ có trong danh sách màn hình của hai vai trò này). Phục vụ/Thu ngân không vào màn này |
| Mã nguồn | `src/components/OrderHistorySection.tsx`, `src/utils/stockRestore.ts`, `ReceiptThermal.tsx` |
| Liên quan | F002, F007 (trừ điểm), F023 (hoàn kho), F027/F017 (đơn hủy bị loại khỏi báo cáo) |

## 1. Mục tiêu
Tìm lại hóa đơn cũ, in lại, và hủy hóa đơn nhập sai sao cho kho, điểm khách và sổ sách khớp.

## 2. Giao diện
Hai khung: trái **Lịch sử hóa đơn** (danh sách), phải **Chi tiết hóa đơn**.
- Tìm: "Tìm số hóa đơn, khách, thu ngân, số bàn...". Lọc trạng thái: *Tất cả / Hoàn tất / Đã hủy*.
- Thẻ trong danh sách: `#<số hóa đơn>` (gạch ngang nếu hủy), nhãn *Hoàn thành* / *Đã hủy*, bàn hoặc tên khách ("Khách vãng lai" nếu trống), ngày giờ + "- Bởi <thu ngân>", tổng tiền.
- Chi tiết: số hóa đơn, phương thức thanh toán (liệt kê từng khoản `Tiền mặt 50.000đ + Chuyển khoản …`), ngày, thu ngân, bàn, hình thức (*Mang về* nếu `orderType = takeaway`, *Ăn tại bàn* nếu có bàn, còn lại *Bán trực tiếp*), khách; bảng món (tên, tùy chọn: size/nhóm tùy chọn (F030)/ghi chú/topping, đơn giá, SL, thành tiền) và tổng.
- Danh sách trống: "Không tìm thấy hóa đơn nào"; chưa chọn: "Chọn một hóa đơn để xem chi tiết".
- Hóa đơn đã hủy **vẫn hiển thị** (gạch ngang, trạng thái "Đã hủy") để đối soát.

## 3. Use case

### UC-009-01 — In lại hóa đơn
Nút **In phiếu** mở `ReceiptThermal` với đúng đơn đã chọn (F022: in thẳng máy in nếu có, không thì hộp in trình duyệt). Thu ngân trên phiếu là người lập đơn gốc.

### UC-009-02 — Hủy hóa đơn
| Mục | Nội dung |
|---|---|
| Quyền | Nút **Hủy phiếu** chỉ hiện cho Chủ/Quản lý (`simUserRole = 'admin'` khi `isAdminRole`) và chỉ với đơn chưa hủy |
| Xác nhận | `Bạn có chắc muốn HỦY hóa đơn "<số>"? Hệ thống sẽ hoàn lại tồn kho và trừ lại điểm tích lũy đã cộng cho khách.` |

```
handleVoidOrder(order):
    if (!canVoid || order đã hủy) return
    ghi nhật ký "Hủy hóa đơn"
    if (bán lẻ):  với mỗi dòng có batchId: cộng lại SL vào đúng lô (b.quantity += SL)
    if (order.customerId && order.customerPointsEarned): trừ điểm của khách, tối thiểu 0
    if (F&B):  stockMessage = restoreFnbStock(order)        # F023, UC-023-05
    order.status = 'void'
    bíp thành công;  nếu stockMessage không rỗng -> alert(stockMessage)
```
- Hủy là **đổi trạng thái** (`status = 'void'`), không xóa dòng.
- Tiền, sổ quỹ: đơn `void` không còn dòng thu trong Sổ quỹ (F015) và bị loại khỏi báo cáo doanh thu/lợi nhuận (F013, F017, F027). Báo cáo cuối ngày liệt kê dưới "Hủy / trả hàng" (số hóa đơn và giá trị).
- Không có hoàn tiền tự động cho khách (thu ngân tự xử lý).

## 4. Quy tắc
| Quy tắc | Chi tiết |
|---|---|
| Không hủy hai lần | Đơn đã `void` không có nút hủy |
| Hoàn kho bán lẻ | Chỉ hoàn lô đầu tiên đã trừ lúc bán (đơn có `batchId` trên dòng) |
| Hoàn kho F&B | Theo phiếu xuất gắn `order_id`, trừ đi phần đã hoàn bởi bếp (F023); không hoàn đôi |
| Điểm | Trừ đúng `customerPointsEarned`, không xuống dưới 0 |

## 5. Dữ liệu (Database)
`orders.status` (`completed` / `void`), `orders.points_earned`; hoàn kho tạo phiếu `inventory_transactions` loại `adjustment` ghi chú `Hoàn kho do hủy <số HD>` có `order_id`; hoàn điểm cập nhật `customers.points`.

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Hóa đơn tạo bằng mã tạm (offline) | Hiển thị mã tạm đến khi đồng bộ, sau đó số chính thức (F021) |
| Phiếu xuất của đơn không tìm thấy (F&B) | Cảnh báo: "Không có phiếu xuất kho nào liên kết với hóa đơn này nên chưa hoàn kho..." (khi công tắc tự trừ kho bật) |
| Lô đã bị xóa | Báo dòng không hoàn được, chỉnh tay |
| Hủy cùng lúc trên hai máy | Xung đột (F020) nếu cùng sửa `orders` |
| Hủy hóa đơn của ca đã đóng | Ca đã đóng không tính lại tiền kỳ vọng (số đã lưu) |
