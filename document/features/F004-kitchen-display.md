# F004 — Màn hình bếp (KDS) và báo bếp

| Trường | Nội dung |
|---|---|
| Mã chức năng | F004 |
| Trạng thái | Hoàn thiện về mã. Chưa kiểm thử trên thiết bị thật. Nguồn đặc tả cũ: FEATURES.md mục 5.4 |
| Actor | Nhân viên bếp/pha chế (xử lý, hủy món), Thu ngân/Phục vụ (báo bếp, xem lịch sử báo bếp), Chủ/Quản lý |
| Mã nguồn | `src/components/{KitchenDisplay,TableDialogs,POSScreen}.tsx` (`KitchenHistoryDialog`), `src/utils/{kitchenSync,kitchenHistory,kitchenStock}.ts`, `src/App.tsx` (`cancelDishInKitchen`), `src/printing/kitchen*.ts` |
| Liên quan | F002, F003, F022 (in phiếu bếp), F023 (kho khi báo/hủy) |

## 1. Mục tiêu
Chuyển món từ quầy xuống bếp kèm đầy đủ yêu cầu (bàn, size, đường, đá, topping, ghi chú) để bếp làm đúng; theo dõi trạng thái từng món; bếp hủy được món chưa làm.

## 2. Phiếu bếp và trạng thái
Mỗi dòng của một lần báo bếp tạo một phiếu `kitchen_items`.
```
Chờ làm (pending)  --Làm món-->  Đang nấu (preparing)  --Xong-->  Xong, chờ bưng (completed)  --Đã bưng-->  Đã lên bàn (served)
        \________ Hủy món (chỉ ở pending/preparing) ________/  -> Đã hủy (cancelled)
```
- Nút **Hủy món** chỉ hiện khi phiếu ở *Chờ làm* hoặc *Đang nấu* (`canCancelFromKitchen`).
- Phiếu đã *Đã lên bàn* hoặc *Đã hủy* gọi là "đóng" (`isClosed`).

## 3. Use case

### UC-004-01 — Báo bếp (Thông báo, F10)
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | Giỏ có dòng chưa báo (`quantity − sentQuantity > 0`) |
| Luồng | Chỉ gửi **phần chênh lệch** (món mới/số lượng tăng). Mỗi lần bấm sinh mã lô báo `NB-<timestamp>` dùng chung cho các phiếu của lần đó (`order_id`). Cập nhật `sentQuantity = quantity` cho từng dòng. Trừ kho nếu bật (F023). In phiếu bếp nếu bật (F022). Bàn → Phục vụ |
| Lỗi | Giỏ trống: "Giỏ hàng trống! Không thể gửi yêu cầu xuống bếp." · Không còn gì mới: "Tất cả món trong đơn đã được báo bếp. Hãy thêm món mới rồi báo bếp lại." |
| Nhãn | Dòng giỏ hiện "Đã báo bếp x/y"; thanh nhắc "Bạn vừa cập nhật đơn hàng… Thông báo" khi còn món chưa báo |
| Thông báo xong | "Đã báo bếp N món mới!" |
Phiếu ghi: món, SL, bàn/nhóm bàn (`table_number`), size, đường, đá, topping (chuỗi), ghi chú, người báo (`staff_name`), giờ.

### UC-004-02 — Bếp xử lý món
- Hai cách xem: **Theo món** và **Theo phòng bàn**.
- Bộ lọc: *Đang hoạt động*, *Chờ làm*, *Đang làm*, *Chờ phục vụ*, *Đã hủy*, *Tất cả* (kèm số lượng).
- Thẻ hiển thị món, giờ tạo, size/đường/đá, `+ topping` (đậm), ghi chú, bàn ("Mang đi" nếu không có bàn), số phút kể từ lúc tạo (cập nhật mỗi 15 giây).
- **Cảnh báo trễ**: phiếu chưa đóng và đã ≥ **10 phút** → chữ đỏ "· Quá giờ".
- Đổi trạng thái bằng nút hành động; mỗi lần có tiếng bíp thành công.
- **Dọn hàng đợi**: hộp xác nhận "Bạn có muốn xóa các món đã phục vụ xong và các món đã hủy ra khỏi hàng đợi bếp?" → xóa mọi phiếu đóng khỏi danh sách.

### UC-004-03 — Bếp hủy món
Chi tiết ở F023 (UC-023-03): xác nhận, đặt `cancelled` + `cancelledAt/By`, hoàn kho đúng lô, gỡ món khỏi giỏ bàn.

### UC-004-04 — Thu ngân hủy/giảm món đã báo
- Xóa một dòng đã báo bếp, *Xóa hết* hoặc *Hủy đơn hàng* → phiếu chưa phục vụ tương ứng thành **Đã hủy**; giảm số lượng → phiếu giảm theo (hoàn kho F023).
- Màn bếp: món hủy ẩn khỏi "Đang hoạt động", xem ở tab "Đã hủy".

### UC-004-05 — Lịch sử báo bếp (kiểu KiotViet)
Nút biểu tượng đồng hồ ở chân khung đơn hoặc menu ⋯ → ngăn bên phải **LỊCH SỬ BÁO BẾP**:
- Mỗi lần *Thông báo* là một mục: ngày giờ, "<tên người> thông báo bếp", các món `+ 1 Tên món` kèm dòng phụ (size, `+ 1 topping`, `50% đường, 70% đá`, ghi chú trong ngoặc kép).
- Món bị hủy sau đó là mục riêng `− 1 Tên món` (đỏ, ghi giờ + người hủy).
- Mới nhất ở trên; chỉ gồm phiếu của đơn hiện tại (từ lúc mở bàn; Mang về/Giao đi: trong ngày). Mã: `utils/kitchenHistory.ts`.

### UC-004-06 — Nhận phiếu giữa các thiết bị
Dùng máy chủ: web đọc/ghi chung CSDL (làm mới vài giây một lần, `LIVE_REFRESH_INTERVAL_MS = 3000`); native đồng bộ nền (F019). Phiếu bếp thuộc nhóm **ghi đè** (không xung đột).

## 4. Quy tắc
| Quy tắc | Chi tiết |
|---|---|
| Không báo trùng | `cart_items.sent_quantity` (migration v6) |
| Nhãn bàn gộp | "Bàn 02 + Bàn 03" ghi vào phiếu; đổi nhãn khi gộp/chuyển bàn (`relabelKitchenTickets`) |
| Khớp phiếu ↔ dòng giỏ | `ticketMatchesLine`: cùng sản phẩm, ghi chú, size, đường, đá, topping |
| Vai trò bếp | Chỉ thấy màn Bếp và Kiểm kho ca (F001, F024) |

## 5. Dữ liệu (Database) — bảng `kitchen_items`
`id, store_id, order_id (mã lần báo NB-…), product_id, product_name, quantity, table_id, table_number, status ('pending','preparing','completed','served','cancelled'), note, served_at, size, sugar_level, ice_level, toppings, staff_name, cancelled_at, cancelled_by, stock_portions, stock_picks, created_at, updated_at, deleted_at, rev`.
Migration: `staff_name, cancelled_at, cancelled_by` v11; `stock_portions, stock_picks` v17.

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Thêm món sau khi báo rồi báo lại | Chỉ phần mới tạo phiếu mới |
| Giảm SL món đã báo | Phiếu liên quan giảm hoặc hủy, hoàn kho |
| Bếp hủy khi thu ngân đã thanh toán | Sau thanh toán phiếu không còn hoàn kho (F023), và nút hủy chỉ ở pending/preparing |
| Hai bếp cùng bấm một phiếu | Bản ghi gửi sau thắng (ghi đè) |
| Món chế biến ở bán lẻ | Bán lẻ không có màn bếp |
