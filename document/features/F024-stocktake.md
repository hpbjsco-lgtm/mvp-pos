# F024 — Kiểm kho, lịch sử kiểm kho và kiểm kho theo ca

| Trường | Nội dung |
|---|---|
| Mã chức năng | F024 (K3a, K3b, K3c trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động; chưa chạy thử trên màn hình thật |
| Actor | Chủ/Quản lý (kiểm bất kỳ lúc nào, xem lịch sử); Phục vụ/Thu ngân và Nhân viên bếp (kiểm đầu/cuối ca, **chỉ ghi, không xem lịch sử**) |
| Mã nguồn | `src/utils/{stocktake,stocktakeHistory}.ts`; `StocktakeDialog.tsx`, `StocktakeFlow.tsx`, `StocktakeHistory.tsx`, `ShiftStockCheck.tsx`, `ShiftSection.tsx`, `InventoryScreen.tsx`, `IngredientDialog.tsx` |
| Liên quan | F006 (kho), F010 (ca), F021 (số `KK`), F023 (kho âm), F027 (hao hụt trong lợi nhuận) |

## 1. Mục tiêu
- Đếm hàng thực tế và **đưa tồn kho hệ thống về đúng số đếm**, ghi lại chênh lệch (thừa/thiếu) thành một phiếu có số.
- Xem lại lịch sử kiểm kho: ai kiểm, lúc nào, ca nào, lệch bao nhiêu, giá trị bao nhiêu.
- Với cửa hàng tắt "tự động trừ kho" (F023) thì **kiểm kho là cách duy nhất làm tồn giảm** theo mức tiêu thụ.
- Kiểm nhanh một số mặt hàng quan trọng ở đầu ca và cuối ca.

## 2. Khái niệm
| Thuật ngữ | Ý nghĩa |
|---|---|
| Phiếu kiểm kho | `inventory_transactions.type = 'stocktake'`, số `KK0001…` (F021) |
| Dòng phiếu | Chỉ gồm hàng **có chênh lệch**. `quantity` = **số có dấu** (đếm − hệ thống; dương = thừa, âm = thiếu). `systemQuantity`, `countedQuantity` lưu cả hai số |
| `stocktakeKind` | `open` (Đầu ca), `close` (Cuối ca), `periodic` (Định kỳ) |
| `shiftId` | Ca đang mở của người kiểm tại thời điểm kiểm, có thể trống |
| "Kiểm mỗi ca" | Cờ `products.check_each_shift` trên nguyên vật liệu/công cụ |
| Giá trị chênh lệch | `quantity × price`, `price` = giá nhập trung bình của các lô bị thay đổi |

## 3. Use case

### UC-024-01 — Kiểm kho (Chủ/Quản lý)
| Mục | Nội dung |
|---|---|
| Vào | Màn Kho → nút **Kiểm kho** |
| Danh sách đếm | Hàng có `trackStock != false`, `isActive != false` và không phải topping. Lọc theo nhóm hàng ("Tất cả" + các nhóm) và tìm theo tên/mã |
| Nhập | Mỗi hàng một ô "Số đếm" (chấp nhận số thập phân `0,5`). **Ô trống = không kiểm hàng đó**, tồn giữ nguyên. Hàng có số đếm không phải số bị tô đỏ và chặn ghi |
| Loại | Chọn Đầu ca / Cuối ca / Định kỳ (mặc định theo nơi mở) |
| Ghi chú | Tùy chọn |
| Xác nhận | Nếu không có hàng nào lệch: lỗi "Chưa có chênh lệch nào để ghi. Nhập số đếm thực tế của các hàng đã kiểm." Ngược lại hộp xác nhận: `Ghi phiếu kiểm kho cho N hàng chênh lệch (a thừa, b thiếu)? Tồn kho sẽ được điều chỉnh theo số đếm.` |
| Kết quả | Tồn các lô được sửa (xem 4), 1 phiếu `KK` được tạo, nút ghi hiện "Đang ghi...", báo beep thành công |

### UC-024-02 — Kiểm kho đầu ca / cuối ca (từ màn Ca làm việc)
- **Đầu ca** (ca đang mở, chưa kiểm): khung "Kiểm kho ca" hiển thị "Đầu ca: đã kiểm / chưa kiểm" và nút "Kiểm kho đầu ca" (ẩn khi đã kiểm).
- **Cuối ca**: khi bấm "Đóng ca làm việc", nếu chưa kiểm cuối ca hiện khối cảnh báo "Chưa kiểm kho cuối ca – Nên đếm các hàng 'kiểm mỗi ca' trước khi đóng ca để ghi lại hao hụt trong ca. Bạn vẫn đóng ca được nếu bỏ qua." kèm nút "Kiểm kho cuối ca". **Không chặn** đóng ca.
- Hộp đếm mở với `shiftItemsFirst`: nếu có hàng gắn cờ "kiểm mỗi ca" thì mặc định **chỉ hiển thị các hàng đó** (có thể bỏ lọc để xem tất cả).
- Bảng lịch sử ca có cột "Kiểm kho": `Đầu ca: có/chưa · Cuối ca: có/chưa`.
- Một ca chỉ cần một phiếu mỗi loại; đã kiểm thì trạng thái "đã kiểm" (kiểm theo `shiftId` + `stocktakeKind`).

### UC-024-03 — Nhân viên kiểm kho ca (màn "Kiểm kho ca")
Vai trò Phục vụ/Thu ngân và Bếp có thêm mục menu **Kiểm kho ca** (`ScreenId 'stockcheck'`):
```
flagged = hàng có checkEachShift && trackStock != false && isActive
if (flagged rỗng): thông báo chưa có hàng nào được đánh dấu "kiểm mỗi ca"
if (có ca đang mở): "Bạn đang trong ca mở lúc <giờ>. Lần kiểm kho sẽ được ghi vào ca này."
else               : "Bạn chưa mở ca nên lần kiểm kho sẽ được ghi không gắn với ca nào."
```
Chỉ ghi phiếu; **không xem được lịch sử**, không thấy màn Kho.

> Lưu ý: ca (`shifts`) chỉ mở/đóng được ở màn *Ca làm việc*, mà màn này hiện chỉ có trong menu của Chủ/Quản lý (F010). Vì vậy một nhân viên phục vụ/bếp thường **không có ca mở**, và phiếu kiểm kho của họ ghi không gắn ca. Nếu muốn kiểm kho gắn ca cho nhân viên, cần cho vai trò `staff` mở/đóng ca (chưa làm, chờ quyết định).

### UC-024-04 — Lịch sử kiểm kho (Chủ/Quản lý)
Màn Kho → tab **Lịch sử kiểm kho** (`StocktakeHistory`):
| Bộ lọc | Giá trị |
|---|---|
| Thời gian | Hôm nay / 7 ngày / 30 ngày / Tất cả |
| Ca | Chọn một ca (tên ca: `describeShift` = ngày + nhân viên + giờ mở) hoặc tất cả |
| Người kiểm | Theo tên |
| Tìm | Mã hoặc tên hàng đã kiểm |
Mỗi dòng: số phiếu, giờ, loại, ca, người kiểm, số hàng lệch, **giá trị thiếu**, **giá trị thừa**. Mở rộng để xem từng hàng (mã, tên, đơn vị, tồn hệ thống, đếm thực tế, chênh lệch, giá trị; hàng đã xóa hiển thị "Hàng đã xóa").
**Xuất CSV**: cột `Số phiếu, Thời gian, Loại kiểm, Ca, Người kiểm, Mã hàng, Tên hàng, Đơn vị, Tồn hệ thống, Đếm thực tế, Chênh lệch, Giá trị chênh lệch, Ghi chú`. Lỗi lưu file: alert "Không lưu được file: <lý do>".

### UC-024-05 — Gắn cờ "Kiểm kho mỗi ca"
Hộp **Nguyên vật liệu / Công cụ dụng cụ** (`IngredientDialog`), phần Quản lý tồn kho: ô "Kiểm kho mỗi ca". Chỉ lưu khi bật **Quản lý tồn kho**; tắt quản lý tồn thì cờ bị đặt lại `false`.

## 4. Thuật toán `planStocktake` (đưa tồn về số đếm)

Với từng hàng có số đếm `counted ≥ 0`:
```
system = tổng tồn các lô (tính cả lô âm)
delta  = counted − system
if (|delta| < 1e-9): bỏ qua (không có dòng phiếu)

if (delta < 0):  # thiếu
    lấy lần lượt từ các lô có quantity > 0, hạn gần nhất trước (FEFO), tới khi đủ |delta|
else:            # thừa
    1) bù trước vào lô ÂM (id NEG-…, mã 'ÂM'), rồi các lô âm khác theo hạn
    2) phần còn lại: cộng vào lô có hạn xa nhất của hàng
    3) hàng chưa có lô nào: tạo lô mới  id KK-<productId>-<time>, mã KK-<yyyymmdd>,
       hạn 2099-12-31, giá nhập = giá vốn hàng, quantity = phần thừa

dòng phiếu: productId, batchCode = các mã lô bị đổi (nối ', '), quantity = delta,
            price = (Σ giá nhập × lượng đổi) / delta,
            systemQuantity = system, countedQuantity = counted
tổng phiếu (totalAmount) = Σ price × quantity   # giá trị có dấu
```
Lỗi: số đếm âm hoặc không phải số → `Số đếm của hàng "<id>" phải là số từ 0 trở lên.` Không có dòng lệch → `Không có chênh lệch nào để ghi.`

## 5. Dữ liệu (Database)
| Bảng | Cột | Migration |
|---|---|---|
| `inventory_transactions` | `type='stocktake'`, `transaction_number` (KK…), `temp_code`, `shift_id`, `stocktake_kind` (`open`/`close`/`periodic`), `staff_id`, `staff_name`, `note` (`Kiểm kho` hoặc `Kiểm kho - <ghi chú>`), `total_amount`, `created_at` | `shift_id`, `stocktake_kind`: v20 |
| `inventory_transaction_items` | `product_id`, `batch_code`, `quantity` (**có dấu**), `price`, `system_quantity`, `counted_quantity` | v20 |
| `inventory_batches` | `quantity` bị sửa; lô mới `KK-…` | |
| `products` | `check_each_shift INTEGER NOT NULL DEFAULT 0` | v20 |
Số `KK` do máy chủ cấp (F021); offline dùng mã tạm.

## 6. Quyền
| Vai trò | Kiểm kho | Lịch sử | Gắn cờ kiểm mỗi ca |
|---|---|---|---|
| Chủ, Quản lý | Có (màn Kho, màn Ca) | Có | Có |
| Phục vụ/Thu ngân, Bếp | Có chỉ hàng gắn cờ (màn "Kiểm kho ca") | Không | Không |

## 7. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Đếm đúng bằng hệ thống | Không tạo dòng; nếu không hàng nào lệch thì không tạo phiếu |
| Hàng đang âm (-3), đếm 0 | `delta = 3`: bù lô ÂM về 0 → dòng "thừa" +3 |
| Hàng không có lô, đếm 5 | Tạo lô `KK-<ngày>` 5 đơn vị |
| Người kiểm chưa mở ca | Phiếu vẫn ghi, `shift_id` trống (ca được tìm theo `staffId` = người kiểm và `status = open`) |
| Mất mạng | Phiếu mang mã tạm `TAM-…` (F021) |
| Hàng bị xóa sau khi kiểm | Lịch sử hiển thị "Hàng đã xóa" |
| Lô bị đổi bởi nhiều bước | `batch_code` liệt kê tất cả mã |

## 8. Giới hạn
- Kiểm kho không chọn riêng từng lô; phần thiếu luôn lấy FEFO.
- Phiếu kiểm kho không thể sửa/hủy; kiểm lại để bù.

## 9. Kiểm thử
`stocktake.test.ts`, `stocktakeHistory.test.ts`; hàm xuất CSV kiểm bằng test chuỗi.
