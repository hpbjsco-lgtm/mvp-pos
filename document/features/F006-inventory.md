# F006 — Quản lý kho hàng: danh mục, lô hàng, nhập/xuất kho, quy đổi đơn vị

| Trường | Nội dung |
|---|---|
| Mã chức năng | F006 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.6 (đã cập nhật: trừ kho tự động, kho âm, CSV, kiểm kho nay có ở F023, F024, F025) |
| Actor | Chủ, Quản lý |
| Mã nguồn | `src/components/{InventoryScreen,InventoryCatalog,IngredientDialog,UnitPickerDialog}.tsx`, `src/utils/{inventoryItems,inventoryCsv}.ts` |
| Liên quan | F005, F012 (NCC), F021 (số phiếu), F023, F024, F025 |

## 1. Mục tiêu
Theo dõi tồn kho **theo lô** (mã lô, hạn dùng, giá nhập) với nguyên tắc **FEFO**; lập phiếu nhập/xuất/điều chỉnh; quản lý danh mục nguyên vật liệu, công cụ dụng cụ (F&B) hoặc hàng hóa (bán lẻ).

## 2. Khái niệm
| Thuật ngữ | Ý nghĩa |
|---|---|
| Lô (`inventory_batches`) | Một đợt nhập của một hàng: mã lô, hạn dùng, ngày sản xuất, giá nhập, SL ban đầu, SL hiện tại |
| Tồn của hàng | `stockOf` = tổng SL các lô (có thể âm, F023) |
| Đơn vị cơ bản | `products.unit`; tồn luôn lưu theo đơn vị này |
| Đơn vị quy đổi | `unit_conversions` `[{name, ratio}]`, ví dụ 1 Thùng = 24 Chai |
| Nhóm quản lý (`item_group`) | `ingredient` Nguyên vật liệu, `tool` Công cụ dụng cụ; "Món bán" là sản phẩm thực đơn (chỉ xem) |
| Trạng thái tồn (`stockStatus`) | `untracked` (không quản lý tồn), `out` (≤ 0), `low` (< tồn thấp nhất), `high` (> tồn cao nhất), `ok` |
| Trạng thái hạn | `expired` (hạn ≤ hôm nay), `near_expiry` (còn ≤ **90 ngày**), `healthy` |

## 3. Use case

### UC-006-01 — Màn Kho: hai chế độ (F&B)
- **Hàng hóa** (danh mục) và **Lô hàng & Lịch sử** (lô, hạn dùng, phiếu); tab **Lịch sử kiểm kho** (F024). Bán lẻ không có chế độ Hàng hóa.
- Thẻ tổng: giá trị tồn (Σ giá nhập lô × SL; lô thiếu giá lấy giá vốn hàng; lô âm tính âm), tổng SL, số lô hết/cận hạn.
- Nút: **Nhập lô**, **Xuất kho**, **Kiểm kho** (F024), **Xuất/Nhập file** (F025), công tắc **Tự động trừ kho khi bán** (F023).

### UC-006-02 — Danh mục hàng (F&B)
Bảng: Mã hàng · Tên hàng · Nhóm quản lý (kèm Topping) · Giá vốn · Tồn kho (cảnh báo *Dưới định mức / Hết hàng*) · Định mức tồn. Hàng *Tổng tồn* đầu bảng. Lọc: nhóm quản lý, nhóm hàng, thương hiệu, tồn (còn / dưới định mức / hết), vị trí, trạng thái (đang / ngừng kinh doanh); tìm theo mã/tên. Món bán chỉ xem (sửa ở Thực đơn).

### UC-006-03 — Tạo / sửa nguyên vật liệu, công cụ dụng cụ
**Thêm mới ▾**: *Nguyên vật liệu*, *Công cụ dụng cụ* (hộp thoại tại Kho), *Món*, *Topping* (chuyển sang Thực đơn).
| Trường | Quy tắc |
|---|---|
| Tên | Bắt buộc: "Vui lòng nhập tên hàng." |
| Mã hàng | Trống → tự sinh `NL0001…` / `CC0001…` (`nextItemCode`) |
| Nhóm hàng, thương hiệu | Chọn hoặc nhập mới |
| Giá vốn | Số ≥ 0 |
| **Quản lý tồn kho** | Bật/tắt. Bật: nhập **tồn đầu kỳ** (tạo lô `TON-DAU-<SKU>`, hạn 2099-12-31, giá nhập = giá vốn, kèm phiếu nhập ghi chú "Tồn kho ban đầu") và định mức. Tắt: `track_stock = 0`, cờ "kiểm kho mỗi ca" bị đặt lại |
| Định mức | Thấp nhất ≤ cao nhất: "Định mức tồn thấp nhất không được lớn hơn định mức cao nhất." |
| Đơn vị tính & quy đổi | Hộp *Chọn đơn vị tính* theo nhóm Đồ ăn / Đồ uống / Dịch vụ & Khác, tạo đơn vị mới, đơn vị cơ bản + tỉ lệ |
| Vị trí, trọng lượng, mô tả | Tùy chọn |
| Kiểm kho mỗi ca | F024 |
| Đang kinh doanh | `is_active` |
| Ảnh | Như F005 |

### UC-006-04 — Xóa hàng khỏi danh mục
```
if (tồn hiện tại > 0): bíp lỗi + 'Hàng này còn tồn kho. Hãy xuất kho hết hoặc chọn "Ngừng kinh doanh" thay vì xóa.'
else hỏi 'Xóa "<tên>" khỏi danh mục kho?' -> xóa
```

### UC-006-05 — Nhập lô thủ công
| Trường | Quy tắc |
|---|---|
| Hàng | Chọn từ danh sách hoặc **+ Thêm … mới** (tên, đơn vị) ngay trong form; hàng mới F&B: id `ING-…`, SKU `NL-<6 số>`, nhóm "Nguyên liệu"; bán lẻ: `P-…`, `SP-…`, nhóm "Khác" |
| Mã lô | Bắt buộc, lưu **HOA** |
| Hạn dùng | Bắt buộc |
| Ngày sản xuất | Tùy chọn |
| Giá nhập | Trống → dùng giá vốn hàng |
| Số lượng | > 0; chọn **đơn vị quy đổi** thì quy về cơ bản (`toBaseQuantity`) trước khi cộng |
| Lỗi | "Vui lòng điền đầy đủ tên, mã lô, hạn dùng và số lượng lớn hơn 0!" |
| Kết quả | Thêm lô; tạo phiếu **nhập** số `PNK` (F021), ghi chú "Nhập tay lô mới <mã lô>", `totalAmount = giá × SL` |

### UC-006-06 — Xuất kho thủ công (FEFO)
| Mục | Nội dung |
|---|---|
| Lý do | *Dùng chế biến / bán* (phiếu xuất), *Hư hỏng / vỡ* (phiếu **điều chỉnh**), *Hết hạn - hủy bỏ* (**điều chỉnh**), *Lý do khác* (phiếu xuất) |
| Nhập | Chọn hàng, SL (theo đơn vị cơ bản hoặc quy đổi; ghi chú tự thêm "xuất 2 Thùng"), ghi chú |
| Kiểm tra | Chưa chọn hàng/SL ≤ 0: "Vui lòng chọn hàng cần xuất và nhập số lượng lớn hơn 0!" · Thiếu tồn: "Tồn kho không đủ: chỉ còn x <đv>, cần xuất y <đv>." (**chặn**, khác với bán hàng) |
| Kết quả | Trừ lần lượt các lô hạn gần nhất còn hàng; phiếu số `PXK`; mỗi dòng phiếu ứng một lô, giá = giá nhập lô; ghi nhật ký |
Phiếu điều chỉnh do hao hụt được tính vào **hao hụt** của báo cáo lợi nhuận (F027).

### UC-006-07 — Hủy bỏ lô
Nút xóa lô: "Bạn có chắc chắn muốn hủy bỏ lô hàng tồn kho này khỏi danh sách?" → **xóa lô** khỏi danh sách và ghi nhật ký. **Không sinh phiếu kho** (xem 6).

### UC-006-08 — Lịch sử nhập/xuất
Danh sách phiếu: số phiếu, loại (Nhập / Xuất / Điều chỉnh / Kiểm kho), thời gian, người lập, ghi chú, dòng chi tiết (mã lô, SL, đơn giá). Xuất CSV (F025).

## 4. Cảnh báo hạn dùng
Lọc lô theo trạng thái: *Hết hạn*, *Cận hạn (≤ 90 ngày)*, *Bình thường*. Tìm theo tên/ SKU/ mã lô.

## 5. Dữ liệu (Database)
| Bảng | Cột chính |
|---|---|
| `products` (hàng kho) | `sku, name, cost, unit, category, track_stock, min_stock, max_stock, item_group, brand, location, weight, unit_conversions, is_active, image_url, note, check_each_shift` (v12) |
| `inventory_batches` | `product_id, product_kind ('product'/'ingredient'), batch_code, expiry_date, manufacture_date, import_price, quantity, original_quantity, transaction_id, supplier_id` |
| `inventory_transactions` | `transaction_number, type ('import','export','adjustment','stocktake'), kind, supplier_id, supplier_name, total_amount, staff_id, staff_name, note, order_id, kitchen_batch_id, shift_id, stocktake_kind, temp_code` |
| `inventory_transaction_items` | `transaction_id, product_id, product_name, batch_id, batch_code, quantity, price, line_no, system_quantity, counted_quantity` |
Có hai kho tách biệt trong ứng dụng: **nguyên liệu** (`product_kind = ingredient`) và **sản phẩm bán lẻ** (`product`).

## 6. Giới hạn và điểm cần lưu ý
- **Hủy bỏ lô không để lại dấu vết kho** (không có phiếu): lượng mất không vào báo cáo hao hụt. Nên thay bằng phiếu điều chỉnh/kiểm kho.
- Chưa có xuất kho theo đơn vị quy đổi ở CSV; thuộc tính (size, màu) và chi nhánh chưa có.
- Chưa có chuyển kho giữa cửa hàng.
- Nhập NCC: phiếu nhập thủ công chưa gắn nhà cung cấp trên giao diện (cột `supplier_id` có sẵn).
