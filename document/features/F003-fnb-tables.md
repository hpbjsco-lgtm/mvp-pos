# F003 — Bán hàng F&B theo bàn: danh sách bàn, gộp/chuyển bàn, tách/ghép đơn, đặt bàn trước, sơ đồ bàn

| Trường | Nội dung |
|---|---|
| Mã chức năng | F003 |
| Trạng thái | Hoàn thiện về mã; logic thuần có test. Giao diện **chưa kiểm thử trên thiết bị thật**. Nguồn đặc tả cũ: FEATURES.md mục 5.3 |
| Actor | Thu ngân/Phục vụ (vận hành), Chủ/Quản lý (thiết kế sơ đồ) |
| Mã nguồn | `src/utils/tableOps.ts`, `src/components/{TableBoard,TableDialogs,KiotTableGrid,TableMap,POSScreen,DragScrollRow}.tsx`, `src/assets/icons/table*.svg` |
| Liên quan | F002, F004, F023 (hoàn kho khi di chuyển/hủy món) |

## 1. Mục tiêu
Nhìn danh sách bàn biết ngay bàn trống/đang dùng/đã gộp/đã đặt, và thao tác gộp, chuyển, tách, ghép đơn nhanh.

## 2. Mô hình dữ liệu (mỗi bàn một đơn mở)
| Khái niệm | Cách lưu |
|---|---|
| Đơn đang mở | Giỏ (`carts`) khóa theo id bàn. Giỏ ảo `takeaway`, `delivery` |
| Bàn gộp | Bàn phụ có `merged_into_id` trỏ về bàn chính. **Chỉ bàn chính giữ giỏ** |
| Bàn "đang dùng" | Có món trong giỏ **hoặc** trạng thái *Phục vụ* **hoặc** là bàn phụ của nhóm gộp |
| Thời gian ngồi | `opened_at`; số khách `guest_count` |
| Đặt trước | `reservation_name/phone/time/note` trên bàn, độc lập với trạng thái Trống/Phục vụ |

## 3. Use case

### UC-003-01 — Xem danh sách bàn
- Lọc theo **khu vực**; theo trạng thái **Tất cả / Đang dùng / Còn trống** (kèm số lượng); tìm theo tên.
- Thẻ "Mang về", "Giao đi" ở đầu danh sách.
- Màu: trống = trắng, đang dùng = xanh lá, gộp = cam, đang chọn = xanh dương đậm; nhãn đặt trước ở góc thẻ; thời gian ngồi làm mới **30 giây**.
- PC (≥1024px): 2 khung — trái tab *Phòng bàn / Thực đơn*, phải đơn của bàn. Chọn bàn trống → tự sang Thực đơn nếu bật ô *Mở thực đơn khi chọn bàn* (mặc định tắt, nhớ lựa chọn); chọn bàn đang dùng → giữ sơ đồ, đơn hiện bên phải.
- Điện thoại (<1024px): 3 bước Danh sách bàn → Đơn của bàn → Thực đơn.
- Menu ⋯: Lịch sử báo bếp · Gộp bàn · Chuyển bàn · Tách đơn · Ghép đơn · Phiếu đặt bàn · Thông tin đơn hàng · Hủy đơn hàng.

### UC-003-02 — Gộp bàn (`mergeTables`)
```
primary = bàn chính của bàn hiện tại
targets = các bàn chọn, loại: bàn ảo, chính bàn chính, bàn đã thuộc nhóm, id không tồn tại
if (targets rỗng) không đổi gì
for mỗi target:
    nếu target là bàn chính của nhóm khác -> kéo CẢ NHÓM đó sang
    món của bàn chính nhóm kia -> gộp vào giỏ bàn chính (dòng cùng lineKey thì cộng số lượng); xóa giỏ cũ
    số khách cộng dồn;  openedAt = sớm nhất
bàn chính: status = SERVING, openedAt = sớm nhất, guestCount = tổng (hoặc trống nếu 0)
bàn phụ: status = SERVING, mergedIntoId = bàn chính, openedAt/guestCount xóa
```
Tên nhóm hiển thị, ví dụ "Bàn 02 + Bàn 03", ghi vào hóa đơn và phiếu bếp; các phiếu bếp cũ được **đổi nhãn** theo tên nhóm mới.
**Bỏ gộp**: từng bàn phụ (`unmergeTable`: bàn phụ về trống, món vẫn ở bàn chính) hoặc cả nhóm (`unmergeAll`).

### UC-003-03 — Chuyển bàn (`transferTable`)
```
canTransferTo(from, to): to là bàn thật (không ảo), không thuộc nhóm của from, và KHÔNG đang dùng (không món, không Phục vụ, không gộp)
if (!canTransferTo) không đổi gì
chuyển cả giỏ, openedAt, guestCount sang `to`; `to` -> SERVING
bàn nguồn -> trống; các bàn phụ trỏ về bàn nguồn được trỏ lại về `to`
phiếu bếp: đổi nhãn bàn sang bàn mới
```

### UC-003-04 — Tách đơn / Ghép đơn (`moveItems`)
```
fromKey, toKey = bàn chính của hai bên; nếu giống nhau -> không đổi gì
đích: bàn đang có đơn, bàn trống, hoặc giỏ ảo Mang về / Giao đi
với mỗi dòng nguồn: want = clamp(số chọn, 0, SL dòng)
    phần đã báo bếp đi theo phần được chuyển trước:
        movedSent = min(sentQuantity, want);  keptSent = min(sentQuantity − movedSent, SL còn lại)
phần chuyển gộp vào giỏ đích (cộng dồn dòng trùng)
nếu chuyển hết món -> bàn nguồn trả trống (bỏ gộp)
```
**Tách** = chọn số lượng từng dòng; **Ghép** = chuyển toàn bộ đơn sang đích. Phiếu bếp được tách theo số phần (kèm `stockPortions/stockPicks`, F023).

### UC-003-05 — Đặt bàn trước
| Mục | Nội dung |
|---|---|
| Nhập | Menu ⋯ → *Phiếu đặt bàn*: tên khách, SĐT, giờ hẹn, ghi chú; sửa/hủy được |
| Khi gọi món đầu tiên | Hỏi xác nhận thông tin khách đặt (F002, UC-002-01). Không xác nhận → không thêm món |
| Báo bếp | Chuyển bàn (cả nhóm) sang *Phục vụ* |
| Thanh toán | Xóa phiếu đặt trước của bàn/nhóm bàn |

### UC-003-06 — Số khách
Nút − / + trên đơn; gộp bàn thì cộng dồn.

### UC-003-07 — Thanh toán/hủy đơn có nhóm bàn
`releaseGroup`: cả nhóm (bàn chính + bàn phụ) về trống, bỏ gộp.

### UC-003-08 — Sơ đồ bàn (Chủ/Quản lý)
Màn **Sơ đồ bàn**, chế độ **Thiết kế**: thêm/xóa khu vực và bàn, kéo-thả vị trí (`x, y, width, height`), nút ✎ sửa **tên bàn và số chỗ** (không cần xóa tạo lại). Chỉ `isAdminRole`.

## 4. Quy tắc
- Mỗi bàn một đơn: không có nhiều tab đơn trên cùng bàn, không có đơn gọi qua QR, không chọn thu ngân.
- Hàng nút cuộn ngang (khu vực, danh mục, bộ lọc) ẩn thanh cuộn và kéo được bằng chuột (`DragScrollRow`).
- Thẻ bàn PC vẽ dạng mặt bàn + ghế (tiền, thời gian, số món/khách trong mặt bàn, tên bàn ở dưới).

## 5. Dữ liệu (Database)
| Bảng.cột | Ý nghĩa |
|---|---|
| `zones` | `id, store_id, name, sort_order` |
| `dining_tables` | `id, store_id, zone_id, name, status ('empty'/'serving'...), capacity, x, y, width, height, merged_into_id, opened_at, guest_count, reservation_name, reservation_phone, reservation_time, reservation_note` (cột bàn gộp: migration v4) |
| `carts`, `cart_items` | Đơn mở (F002) |
| `kitchen_items.table_number` | Nhãn bàn/nhóm trên phiếu bếp |

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Gộp bàn đang trống | Bàn thành SERVING dù chưa có món; trả về trống khi thanh toán/hủy |
| Chuyển sang bàn đang có đơn | Không cho (dùng *Ghép đơn*) |
| Gộp một bàn phụ vào bàn khác | Kéo cả nhóm của bàn đó |
| Tách hết món | Bàn nguồn trống, mất gộp |
| Hai thu ngân thao tác cùng một bàn | Giỏ thuộc nhóm ghi đè trong đồng bộ (F019): bản gửi sau thắng, có thể mất thay đổi của người trước |
| Xóa bàn đang có đơn | Chưa có chặn riêng được ghi nhận trong spec này; cần kiểm chứng |

## 7. Kiểm thử
`src/utils/tableOps.test.ts`; `kitchenSync.test.ts` (nhãn phiếu theo bàn/nhóm).
