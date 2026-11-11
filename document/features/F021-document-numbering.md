# F021 — Cấp số chứng từ (HD, PNK, PXK, PT, PC, KK) và mã tạm khi offline

| Trường | Nội dung |
|---|---|
| Mã chức năng | F021 |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động |
| Mã nguồn | Máy chủ: `numbering.mjs`, `syncPolicy.mjs` (`NUMBERED_TABLES`), `syncApplier.mjs`. Thiết bị: `src/sync/{documentNumberer,documentNumbers,numberedTables}.ts` |
| Liên quan | F019, F006 (kho), F015 (sổ quỹ), F024 (kiểm kho) |

## 1. Mục tiêu
- Số chứng từ **tăng dần theo cửa hàng và không trùng**, dù nhiều máy cùng bán.
- Thu ngân **không bị chặn** khi mất mạng: chứng từ lập offline nhận **mã tạm**, đổi sang số chính thức khi đồng bộ.

## 2. Các loại số
| `kind` | Tiền tố | Số chữ số tối thiểu | Ví dụ | Bảng / điều kiện tìm số đã dùng |
|---|---|---|---|---|
| `order` | `HD` | 5 | `HD00012` | `orders.order_number` |
| `import` | `PNK` | 4 | `PNK0003` | `inventory_transactions.transaction_number`, `type='import'` |
| `export` | `PXK` | 4 | `PXK0007` | cùng bảng, `type='export'` |
| `receipt` | `PT` | 4 | `PT0002` | `cash_vouchers.code`, `voucher_type='receipt'` |
| `payment` | `PC` | 4 | `PC0001` | `cash_vouchers.code`, `voucher_type='payment'` |
| `stocktake` | `KK` | 4 | `KK0001` | `inventory_transactions`, `type='stocktake'` |

Phiếu kho `adjustment` (điều chỉnh/hao hụt, hoàn kho) **không đánh số** chính thức (`kindOf` trả null).

## 3. Use case

### UC-021-01 — Lập chứng từ khi có mạng
1. Ứng dụng gọi `POST /api/sync/next-number {storeId, kind}` (chờ tối đa **4 giây** trên native).
2. Máy chủ trong một transaction: `giá_trị = max(sync_counters.last_value, số lớn nhất đang dùng) + 1`; ghi lại bộ đếm; trả `{number}` đệm số 0 bên trái.
3. Chứng từ lưu với số chính thức; `temp_*` để trống.

### UC-021-02 — Lập chứng từ khi không có mạng (chỉ native)
1. Gọi số quá 4 giây hoặc lỗi bất kỳ (mạng, máy chủ lỗi) → dùng mã tạm.
2. Mã tạm có dạng **`TAM-<4 ký tự mã thiết bị>-<số thứ tự>`**. Mã được lưu vào **cả hai** cột: cột số (`order_number`...) và cột mã tạm (`temp_order_number` / `temp_code`) để in hóa đơn vẫn có số hiển thị.
3. Hóa đơn in ra mang mã tạm; khi đồng bộ, số chính thức thay vào (hóa đơn in cũ giữ mã tạm; đối chiếu bằng cột mã tạm).

### UC-021-03 — Máy chủ đổi mã tạm thành số chính thức
`SyncApplier.applyGroup` với bảng đánh số:
```
alreadyNumbered = dòng đã có trên máy chủ VÀ cột mã tạm không rỗng
if alreadyNumbered:   cột số và cột mã tạm là cột máy chủ sở hữu -> thiết bị không đổi được nữa
numberKind = (!alreadyNumbered && thiết bị gửi mã tạm không rỗng) ? kindOf(row) : null
if numberKind: row[cột số] = numbering.next(storeId, numberKind)   # cấp ngay trước khi ghi
```
Kết quả push trả `{number, tempNumber}`; thiết bị ghi số chính thức vào bản của mình và giữ mã tạm.
- Xung đột **không** tiêu tốn số (số chỉ cấp khi ghi thật).
- Gửi lại cùng chứng từ (đã đánh số) → `unchanged`, không cấp số mới.

### UC-021-04 — Web (không offline)
Không có mã tạm: nếu máy chủ lỗi thì **báo lỗi** và không lập chứng từ.

### UC-021-05 — Dữ liệu cũ
Khi bộ đếm của cửa hàng chưa có hoặc thấp hơn số đã dùng (CSDL có sẵn chứng từ), máy chủ lấy `max(bộ đếm, số lớn nhất đang dùng)`, nên tiếp tục sau số cuối cùng.

## 4. Dữ liệu
| Nơi | Cột | Ghi chú |
|---|---|---|
| Máy chủ `sync_counters` | `store_id`, `kind`, `last_value` (PK = store_id + kind) | |
| `orders` | `order_number`, `temp_order_number` | migration v14 |
| `inventory_transactions` | `transaction_number`, `temp_code` | v14 |
| `cash_vouchers` | `code`, `temp_code` | v14 |
| Thiết bị `sync_state` | khóa `tempCounter` (bộ đếm mã tạm) và mã thiết bị 4 ký tự | |

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Hai máy offline cùng lập chứng từ | Mã tạm khác nhau (có mã thiết bị); số chính thức cấp theo thứ tự đến máy chủ |
| Mạng chậm 4–10 giây | Dùng mã tạm dù máy chủ có thể đã cấp một số bị bỏ phí (khoảng trống số được chấp nhận) |
| `kind` lạ | 400 "kind must be one of: ..." |
| Cửa hàng không tồn tại | 404 |
| Người dùng sửa tay cột số trên máy sau khi có số chính thức | Máy chủ bỏ qua (cột do máy chủ sở hữu) |

## 6. Kiểm thử
`numbering.test.mjs`, `syncApplier.test.mjs` (cấp số khi ghi, không cấp khi xung đột), `src/sync/documentNumberer.test.ts`, `documentNumbers.test.ts`.

## 7. Giới hạn
- Khoảng trống trong dãy số có thể xuất hiện (nhanh/chậm mạng, hủy sau khi cấp).
- Chưa có định dạng số theo năm/chi nhánh.
