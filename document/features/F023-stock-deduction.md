# F023 — Trừ kho khi báo bếp / thanh toán, hoàn kho, kho âm, công tắc tự động trừ kho

| Trường | Nội dung |
|---|---|
| Mã chức năng | F023 (K1, K2, K4 trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động; **chưa kiểm chứng trên màn hình thật** |
| Phạm vi | Cửa hàng **F&B**. Bán lẻ vẫn trừ lô lúc thanh toán như trước (xem F002) |
| Actor | Thu ngân/Phục vụ (báo bếp, thanh toán), Nhân viên bếp (hủy món), Chủ/Quản lý (công tắc, hủy hóa đơn) |
| Mã nguồn | `src/utils/{kitchenStock,kitchenSync,kitchenRestore,stockRestore,recipes}.ts`; `POSScreen.tsx` (`handleSendToKitchen`, `recordKitchenExport`, thanh toán), `KitchenDisplay.tsx`, `App.tsx` (`cancelDishInKitchen`), `OrderHistorySection.tsx` (`restoreFnbStock`), `InventoryScreen.tsx` (công tắc) |
| Liên quan | F004 (bếp), F005 (công thức), F006 (kho), F021 (số phiếu), F024 (kiểm kho), F027 (giá vốn) |

## 1. Mục tiêu
Tồn kho nguyên liệu giảm **ngay khi món được báo bếp** (lúc nguyên liệu thực sự bị dùng), hoàn lại nếu bếp hủy món, và vẫn đúng khi bán thiếu tồn (cho âm, chỉ cảnh báo).

## 2. Quyết định nghiệp vụ (đã được chủ dự án chốt)
| # | Quyết định |
|---|---|
| 1 | Bấm **Thông báo bếp** → kiểm tra tồn và trừ kho ngay. Bếp **Hủy món** thì hoàn kho |
| 2 | Thanh toán mà còn món **chưa báo bếp** → trừ nốt phần đó lúc thanh toán. Cần cờ/ghi nhận để không trừ hai lần |
| 3 | Có công tắc **"Tự động trừ kho khi bán"**: tắt thì bán hàng không đụng vào kho, kho chỉ thay đổi bằng nhập/xuất/kiểm kho (F024) |
| 4 | Thiếu tồn: **cảnh báo, không chặn**. Kho hiển thị số âm |
| 5 | Công tắc áp dụng **cho cả cửa hàng**, đặt trong màn Kho |
| 6 | Không áp dụng cho bán lẻ |

## 3. Khái niệm
| Thuật ngữ | Ý nghĩa |
|---|---|
| Lần báo bếp (send) | Mọi phiếu bếp trong cùng một lần bấm Thông báo dùng chung `orderId` dạng `NB-<timestamp>` (cũng là `kitchenBatchId` của phiếu kho) |
| `stockPortions` (trên phiếu bếp) | Số phần đã trừ kho cho phiếu đó |
| `stockPicks` | Danh sách các lô đã lấy: `{kind: 'ingredient'|'product', batchId, productId, batchCode, take, price}` |
| Bất biến | `stockPortions == quantity` của phiếu còn sống (chưa phục vụ, chưa hủy). Giảm số lượng/hủy thì hoàn phần chênh |
| Lô "ÂM" | Lô tạm `batchCode = 'ÂM'`, id `NEG-<productId>`, hạn `2099-12-31`, số lượng âm, dùng để ghi phần thiếu |
| Phiếu hoàn | Phiếu kho `adjustment`, ghi chú bắt đầu `Hoàn kho do hủy món ` |

## 4. Use case

### UC-023-01 — Báo bếp có trừ kho
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | Cửa hàng F&B, công tắc bật, giỏ có dòng chưa báo bếp (`quantity - sentQuantity > 0`) |
| Luồng chính | 1) Chỉ lấy **phần chênh** chưa báo của từng dòng. 2) Tính nhu cầu: công thức món chế biến + công thức topping chế biến (số topping × số phần) + tồn trực tiếp của món/topping thường có quản lý lô. 3) Trừ theo FEFO (lô hết hạn sớm trước) từng dòng một, dòng sau thấy kết quả dòng trước. 4) Tạo phiếu bếp kèm `stockPortions`, `stockPicks`. 5) Tạo **phiếu xuất kho** theo từng loại (nguyên liệu / sản phẩm) với ghi chú `Báo bếp <tên bàn>`, `kitchenBatchId = NB-…`, số phiếu `PXK` (F021). 6) In phiếu bếp nếu bật (F022). 7) Bàn chuyển trạng thái Phục vụ. 8) Thông báo "Đã báo bếp N món mới!". |
| Thay thế | Không còn gì chưa báo → "Tất cả món trong đơn đã được báo bếp. Hãy thêm món mới rồi báo bếp lại." |
| Thay thế | Giỏ trống → "Giỏ hàng trống! Không thể gửi yêu cầu xuống bếp." |
| Thay thế | **Thiếu tồn**: hộp xác nhận "Thiếu tồn kho: - <nguyên liệu>: cần x <đv>, còn y <đv> ... Vẫn báo bếp? Kho sẽ hiển thị số âm." Hủy → không làm gì. Đồng ý → phần thiếu ghi vào lô ÂM; phiếu xuất có ghi chú ` (thiếu tồn)` |
| Thay thế | Công tắc tắt → không tính, không trừ; phiếu bếp không có `stockPortions` |
| Lỗi | Không ghi được phiếu xuất kho → alert "Đã báo bếp nhưng không ghi được phiếu xuất kho: <lý do>" (món vẫn được báo) |

### UC-023-02 — Thanh toán (trừ nốt phần chưa báo bếp)
```
if (F&B):
    tickets = phiếu bếp của đơn mà chưa bị hủy
    remaining = công tắc bật ? unstockedLines(giỏ, tickets) : []     # SL dòng - tổng stockPortions của các phiếu khớp dòng
    deduct(remaining)  -> phiếu xuất "Bán hàng <số HD>" (ghi chú ' (thiếu tồn)' nếu thiếu), mang orderId
    # các phiếu xuất ở lúc báo bếp (kitchenBatchId thuộc các phiếu của đơn, chưa có orderId) được GẮN orderId của đơn này
    # (để hủy hóa đơn hoàn được cả hai)
    # phiếu bếp của đơn bị xóa stockPortions/stockPicks: từ nay chúng không bao giờ hoàn kho nữa
```
Công tắc tắt lúc thanh toán nhưng đã trừ lúc báo bếp (khi còn bật) thì phiếu cũ vẫn được gắn `orderId` như trên.

### UC-023-03 — Bếp hủy món
| Mục | Nội dung |
|---|---|
| Actor | Nhân viên bếp (và vai trò xem màn bếp) |
| Tiền điều kiện | Phiếu ở trạng thái **Chờ chế biến** hoặc **Đang chế biến** (`canCancelFromKitchen`). Đã "Chờ bưng"/"Đã phục vụ"/đã hủy thì không còn nút |
| Luồng | 1) Bấm **Hủy món**. 2) Hộp xác nhận: `Hủy món? "<tên món>" x<SL> (<bàn hoặc Mang đi>) Món sẽ bị bỏ khỏi đơn của bàn và hoàn lại kho nếu đã trừ. Không thể hoàn tác.` 3) Phiếu → `cancelled` (+`cancelledAt`, `cancelledBy`). 4) `settleKitchenStock` tính phần hoàn. 5) `applyKitchenRestores`: cộng số lượng về **đúng lô đã lấy**, tạo phiếu `adjustment` ghi chú `Hoàn kho do hủy món <bàn>` với `kitchenBatchId` của lần báo. 6) Món bị bỏ khỏi giỏ của bàn (`removeCancelledTicketFromCart`: giảm SL dòng khớp, giảm `sentQuantity`; hết thì xóa dòng). |
| Lỗi hoàn kho | alert "Đã hủy món nhưng không hoàn được kho: <lý do>" |
| Ghi chú | Bàn hoặc nhóm bàn được tìm theo nhãn trên phiếu (`"Bàn 01"`, `"Bàn 01 + Bàn 02"`, `"Mang về"`, `"Giao đi"`); không tìm được bàn thì chỉ hủy phiếu |

### UC-023-04 — Thu ngân giảm/xóa món đã báo bếp
Mọi thay đổi phiếu bếp từ màn bán hàng (giảm số lượng, xóa dòng, *Xóa hết*, *Hủy đơn hàng*, sửa tùy chọn dòng, chuyển/tách/ghép bàn) đi qua `changeKitchenItems`: nó chạy `settleKitchenStock` rồi `applyKitchenRestores`, nên phần nguyên liệu của món bị giảm/hủy luôn được hoàn cùng một đường với UC-023-03. Lỗi hoàn: alert "Không hoàn được kho cho món đã hủy: <lý do>".

### UC-023-05 — Hủy hóa đơn
(`restoreFnbStock`, `planStockRestore`) Với mỗi loại kho (nguyên liệu, sản phẩm):
```
took = tổng các dòng của phiếu EXPORT có orderId = hóa đơn, gộp theo lô (khớp lô theo batchId, hoặc theo mã lô + sản phẩm với phiếu cũ)
putBack = tổng các dòng của phiếu ADJUSTMENT 'Hoàn kho do hủy …' đã có cho hóa đơn
remaining = took - putBack theo từng lô;  chỉ hoàn nếu remaining > 0
lô không còn tồn tại -> skipped (báo cho người dùng chỉnh tay)
tạo phiếu ADJUSTMENT 'Hoàn kho do hủy <số HD>' cộng vào lô (cộng, không thay thế)
```
Thông báo: `<loại>: đã hoàn N lô.` / `<loại>: không hoàn được N dòng vì lô đã bị xóa (mã lô ...). Hãy chỉnh kho thủ công.` / khi không có phiếu xuất nào: nếu công tắc tắt → im lặng; nếu bật → "Không có phiếu xuất kho nào liên kết với hóa đơn này nên chưa hoàn kho. ..."

Vì phần đã hoàn khi bếp hủy món được trừ ra (`putBack`), **hủy hóa đơn không hoàn hai lần**.

### UC-023-06 — Bật/tắt công tắc
Màn Kho (chỉ F&B) → ô "Tự động trừ kho khi bán". Bật: "Báo bếp trừ kho theo công thức, hủy món thì hoàn lại. Món chưa báo bếp được trừ lúc thanh toán." Tắt: "Đang tắt: bán hàng không đụng vào kho. Tồn kho chỉ thay đổi khi nhập kho, xuất kho hoặc kiểm kho." Lưu `stores.auto_stock_deduction` (`rev + 1`, đồng bộ). Mặc định **bật**.

## 5. Logic chi tiết

### 5.1 Nhu cầu nguyên liệu của một dòng (`deductForLine`)
```
need = {}
if (món.dishKind == 'prepared'): need += công thức món × số phần
for mỗi topping chọn kèm mỗi phần:
    if (topping.isTopping && topping.toppingKind == 'prepared'): need += công thức topping × (SL topping × số phần)
trừ từng nguyên liệu theo FEFO (lô hết hạn trước, chỉ lô quantity > 0)
nếu còn thiếu: shortage {needed, available}; ghi phần thiếu vào lô ÂM (overdraw)
-- trực tiếp (tồn của chính món/topping) --
if (món.dishKind == 'regular') cộng SL vào nhu cầu của món
if (topping.toppingKind in {'regular','made'}) cộng (SL topping × số phần)
if (món chưa có lô nào): bỏ qua (không quản lý tồn)  else trừ FEFO; thiếu -> lô ÂM
```
Số lượng nguyên liệu = số lượng công thức quy đổi về **đơn vị cơ bản** (`toBaseQuantity`). Làm tròn 6 chữ số thập phân.

### 5.2 Chọn lô ghi phần thiếu (`overdraw`)
```
target = lô 'ÂM' của sản phẩm  ||  lô có hạn xa nhất của sản phẩm
if (target) target.quantity -= missing
else tạo lô 'ÂM' mới: id NEG-<productId>, hạn 2099-12-31, quantity = -missing, importPrice = giá vốn hiện tại của hàng
```

### 5.3 Hoàn khi phiếu giảm/hủy (`settleKitchenStock`)
```
for mỗi phiếu:
    stock = stockPortions
    if (stock <= 0 || status == SERVED) giữ nguyên          # đã phục vụ = đã dùng nguyên liệu
    wanted = (status == CANCELLED) ? 0 : min(stock, quantity)
    if (wanted >= stock) giữ nguyên
    give = scalePicks(stockPicks, (stock - wanted) / stock)  # phần trả lại, gộp theo lần báo (sendId)
    phiếu.stockPortions = wanted > 0 ? wanted : bỏ
    phiếu.stockPicks    = scalePicks(stockPicks, wanted / stock)
```
Phiếu tách/ghép đơn: `splitTicketStock` chia `stockPortions` và `stockPicks` theo số phần chuyển đi để vẫn đúng khi hủy sau này.

## 6. Dữ liệu (Database)
| Bảng | Cột liên quan | Migration |
|---|---|---|
| `kitchen_items` | `stock_portions REAL`, `stock_picks TEXT` (JSON mảng `StockPick`) | v17 |
| `inventory_transactions` | `order_id`, `kitchen_batch_id`, `temp_code`; `type` = `export` / `adjustment` | `order_id` v16 (+ backfill theo ghi chú `Bán hàng <số HD>`), `kitchen_batch_id` v17 |
| `inventory_transaction_items` | `batch_id`, `batch_code`, `quantity`, `price` | |
| `inventory_batches` | `quantity` có thể âm; lô `ÂM` | |
| `stores` | `auto_stock_deduction INTEGER NOT NULL DEFAULT 1` | v18 |
| `order_items` / giỏ | `sentQuantity` (giỏ: `cart_items.sent_quantity`) | v6 |

## 7. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Báo bếp 2 ly, bếp hủy 1 | Phiếu `stockPortions` còn 1, hoàn 1/2 lượng đã lấy về đúng các lô |
| Phiếu đã "Chờ bưng" | Không hủy được từ bếp (nguyên liệu coi như đã dùng) |
| Báo bếp rồi thanh toán không thêm gì | `unstockedLines` rỗng → không trừ lần hai |
| Thêm món sau khi báo, chưa báo bếp, rồi thanh toán | Chỉ trừ phần chênh lúc thanh toán, phiếu xuất mang `orderId` |
| Công thức thay đổi giữa báo bếp và hủy | Hoàn đúng theo `stockPicks` đã lưu, không tính lại theo công thức mới |
| Lô đã bị xóa khi hoàn kho bếp | `applyRestore` bỏ qua lô không tồn tại (không tạo lại) |
| Hai máy cùng hủy một phiếu | Phiếu bếp thuộc nhóm ghi đè trong đồng bộ (F019), bản gửi sau thắng; phiếu hoàn có thể bị tạo hai lần nếu hai máy cùng thực hiện — giới hạn đã biết |
| Hủy hóa đơn khi lô nguyên liệu đã bị xóa | `skipped` + hướng dẫn chỉnh tay |

## 8. Kiểm thử
`kitchenStock.test.ts`, `stockRestore.test.ts`, `kitchenSync.test.ts`, `recipes.test.ts`, `kitchenRestore.test.ts`.

## 9. Giới hạn
- Sau khi thanh toán xong, phiếu bếp mất thông tin kho (`stockPortions`, `stockPicks`) nên chỉ còn cách hủy hóa đơn (UC-023-05) để hoàn kho.
- Chưa khóa chặn hai máy cùng hoàn một phiếu (cần kiểm chứng khi chạy đồng bộ thật).
- Chưa chạy thử trên màn hình thật.
