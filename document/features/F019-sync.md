# F019 — Đồng bộ dữ liệu giữa điện thoại (offline-first) và máy chủ

| Trường | Nội dung |
|---|---|
| Mã chức năng | F019 |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động. **Chưa chạy thử trên điện thoại thật** (SQLite native, trigger, mạng chập chờn) |
| Phạm vi | Chỉ ứng dụng native (Android/iOS) ở chế độ "Dùng máy chủ". Web không đồng bộ vì đọc/ghi thẳng máy chủ |
| Mã nguồn | Máy chủ: `server/pos-db-server/src/{syncService,syncApplier,syncPolicy,syncTables,syncRouter}.mjs`. Thiết bị: `src/sync/{syncEngine,syncScheduler,syncStore,syncClient,pullApplier,initialSync,nativeSyncRuntime,appSyncClient}.ts`, `src/db/deviceSchema.ts`. Giao diện: `NativeSyncGate.tsx`, `SyncStatusBadge.tsx` |
| Liên quan | F018 (kết nối), F020 (xung đột), F021 (cấp số) |

## 1. Mục tiêu

- Điện thoại bán hàng được cả khi mất mạng; khi có mạng, dữ liệu tự lên máy chủ và các máy khác nhìn thấy.
- Không mất dữ liệu: thay đổi chưa gửi được vẫn nằm trong hàng đợi trên máy.
- Hai máy sửa cùng một bản ghi thì **không ghi đè âm thầm**: tạo xung đột để Quản lý quyết định (F020).

## 2. Mô hình tổng quát

```
Điện thoại                                   Máy chủ (SQLite)
-----------                                  ----------------
SQLite trên máy  --(1) PUSH nhóm bản ghi-->  áp dụng / bỏ qua / ghi xung đột
sync_outbox      <--(2) PULL thay đổi-----   sync_log (trigger ghi mọi thay đổi)
sync_row_base    (rev lần cuối nhận/gửi)     rev trên từng dòng, epoch, sync_counters
```
Mỗi vòng đồng bộ: **gửi lên trước, tải xuống sau** (một vòng tại một thời điểm).

## 3. Khái niệm

| Thuật ngữ | Ý nghĩa |
|---|---|
| Nhóm (group) | Đơn vị gửi lên: một dòng cha kèm các dòng con (hóa đơn + `order_items`; phiếu kho + `inventory_transaction_items`; giỏ + `cart_items`). Dòng con được **thay cả tập** |
| `rev` | Số phiên bản của dòng trên máy chủ, tăng 1 mỗi lần cập nhật. Máy chủ sở hữu cột này |
| `baseRev` | `rev` mà thiết bị nhận/gửi lần cuối cho dòng đó (bảng `sync_row_base`). Dòng thiết bị tự tạo: null |
| `sync_log` | Nhật ký trên máy chủ: trigger ghi mỗi insert/update/delete của mọi bảng đồng bộ, kể cả do trang `/admin` hoặc khóa ngoại |
| Epoch | Mã "thế hệ" CSDL máy chủ. Đổi khi CSDL bị khôi phục/thay file |
| Cursor | Vị trí tải xuống (chuỗi mờ): giai đoạn `snapshot` (ảnh chụp toàn bộ cửa hàng) rồi `log` (các thay đổi sau đó) |
| Outbox | Bảng thiết bị ghi dòng đã đổi mà chưa gửi |

### 3.1 Bảng được đồng bộ (20)
`stores, users, zones, dining_tables, products, product_option_groups, product_option_choices, suppliers, customers, bank_accounts, inventory_batches, inventory_transactions, inventory_transaction_items, orders, order_items, kitchen_items, carts, cart_items, attendance, activity_logs, shifts, cash_vouchers`.
Không đồng bộ: `meta`, `schema_migrations`, `sync_*` của thiết bị.

## 4. Use case

### UC-019-01 — Tải lần đầu (initial sync)
| Mục | Nội dung |
|---|---|
| Actor | Chủ/Quản lý khi cấu hình máy; hệ thống |
| Tiền điều kiện | Đã lưu cấu hình "Dùng máy chủ" và chọn cửa hàng (F018, UC-018-03). `sync_state.initialSync = pending` |
| Luồng chính | 1) Khi mở app, `NativeSyncGate` chặn các màn khác, hiện "Đang kết nối..." rồi "Đã tải N dòng (<tên bảng>)". 2) Nếu chưa có `cursor`: **xóa** dữ liệu các bảng đồng bộ trên máy. 3) Gọi `GET /api/sync/pull` lặp lại theo cursor. Mỗi trang (+cursor+epoch) được ghi **trong một transaction**, nên ngắt giữa chừng vẫn khớp. 4) Trang cuối `done=true` → `initialSync = done`, mở app. |
| Thay thế | Lỗi mạng giữa chừng → hiện lỗi và nút thử lại; tải **tiếp** từ cursor đã lưu. |
| Thay thế | Máy chủ trả `EPOCH_CHANGED` (CSDL vừa được khôi phục) → thử lại **một lần** từ đầu; lần hai vẫn lỗi thì báo lỗi. |
| Thay thế | Cursor lặp lại hai lần liên tiếp → dừng với lỗi "máy chủ trả cùng vị trí tải xuống hai lần" (chống vòng lặp vô hạn). |
| Thay thế | Chưa chọn cửa hàng → lỗi "Chưa chọn cửa hàng để đồng bộ. Bấm 'Cấu hình', kiểm tra kết nối và chọn cửa hàng." |

### UC-019-02 — Làm việc offline
Ghi vào SQLite trên máy như bình thường. Trigger `outbox_<bảng>_{ai,au[,ad]}` thêm/tăng `change_count` cho dòng (hoặc cho **dòng cha** nếu là bảng con) trong `sync_outbox`. Số hóa đơn/phiếu: mã tạm (F021).

### UC-019-03 — Một vòng đồng bộ
| Bước | Nội dung |
|---|---|
| 1 PUSH | Đọc `sync_outbox` của cửa hàng, dựng nhóm (cha + con) kèm `baseRev`. Gửi `POST /api/sync/push {storeId, deviceId, groups}` (tối đa 500 nhóm/lần). |
| 2 Kết quả | Với mỗi nhóm: `applied` / `unchanged` → lưu `rev` mới vào `sync_row_base`; nếu là chứng từ đánh số: ghi **số chính thức** và giữ mã tạm; bỏ dòng khỏi outbox **chỉ khi `change_count` không đổi** trong lúc gửi (nếu đổi lại thì gửi vòng sau). `conflict` → giữ trạng thái chờ, máy chủ đã ghi xung đột (F020). |
| 3 PULL | Tải thay đổi từ cursor. Mọi thay đổi ghi vào máy qua `SyncStore.applyRemote`: đặt cờ `applying=1` **trong cùng transaction** để trigger outbox im lặng (không gửi ngược). **Bỏ qua** dòng đang nằm trong outbox (để lần gửi quyết định giữa hai bản). |
| 4 Báo | Số xung đột chưa xử lý của cửa hàng (`pendingConflicts`) đi kèm kết quả pull → hiện thông báo; danh sách bảng đã đổi → các màn tải lại dữ liệu. |

### UC-019-04 — Lịch chạy (SyncScheduler)
| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `pollMs` | 5 giây | Cứ 5 giây xem outbox có gì chờ gửi không |
| `fullRoundMs` | 30 giây | Tối đa 30 giây giữa hai vòng dù không có thay đổi (để nhận dữ liệu máy khác) |
| `maxBackoffMs` | (tham số) | Sau thất bại: chờ `min(maxBackoffMs, pollMs × 2^số_lần_lỗi)` |

Chạy ngay (`requestRound`) khi: mạng trở lại, app quay lại màn hình trước (`visibilitychange` → visible), người dùng bấm đồng bộ ngay. Yêu cầu này **hủy** thời gian chờ backoff.

### UC-019-05 — Xem trạng thái (SyncStatusBadge)
| `state` | Nhãn | Ghi chú |
|---|---|---|
| `syncing` | Đang đồng bộ... | |
| `error` | Lỗi đồng bộ | Máy chủ từ chối hoặc trả dữ liệu lạ |
| `offline` | Mất kết nối / Mất kết nối, chờ gửi N | Không tới được máy chủ |
| còn lại | Đã đồng bộ | Chạm vào xem "Lần đồng bộ cuối: HH:mm:ss" hoặc "Chưa đồng bộ lần nào" |

### UC-019-06 — Máy chủ được khôi phục từ bản sao lưu
Máy chủ tạo epoch mới (`onRestore`). Thiết bị nhận `EPOCH_CHANGED` (409) ở lần pull kế tiếp → báo cần "Tải lại dữ liệu" (F018, UC-018-05). Dữ liệu chưa gửi **sẽ bị mất khi tải lại**, nên app đề nghị xuất file SQLite sao lưu trước.

### UC-019-07 — Web xem thay đổi của máy khác (summary)
`GET /api/sync/summary?storeId&after` trả `{seq, tables[], reset}`: trang web (đọc thẳng máy chủ) hỏi vài giây một lần để biết **bảng nào** đổi mà tải lại màn đó. `reset=true` khi `after` lớn hơn `seq` hiện tại (CSDL bị khôi phục) → tải lại tất cả.

## 5. Quy tắc quyết định trên máy chủ (SyncApplier.applyGroup)

Cho mỗi nhóm đã qua kiểm tra:
```
current = đọc dòng hiện có trên máy chủ
if (current không tồn tại):
    if (nhóm có baseRev && bảng không thuộc OVERWRITE && !force):
        -> CONFLICT (dòng đã bị xóa trên máy chủ), serverGroup = null
    else INSERT (chứng từ đánh số: cấp số chính thức, xem F021)
else:
    sameRow      = mọi cột thiết bị gửi == cột trên máy chủ (bỏ qua cột máy chủ sở hữu và created_at/updated_at)
    sameChildren = tập dòng con thiết bị gửi == tập trên máy chủ
    knownVersion = bảng có rev && baseRev == current.rev
    if (bảng không thuộc OVERWRITE && !force && !knownVersion && !(sameRow && sameChildren)):
        -> CONFLICT (serverGroup = current)
    if (sameRow && sameChildren && !force && không cần cấp số):
        -> UNCHANGED (trả rev hiện tại)
    else UPDATE các cột (trừ khóa chính, created_at, cột máy chủ sở hữu); rev = rev + 1
    với mỗi bảng con có trong nhóm: DELETE toàn bộ con của cha rồi INSERT lại theo thiết bị gửi
-> APPLIED (trả rev mới, số chính thức/mã tạm nếu có)
```
| Quy tắc | Nội dung |
|---|---|
| OVERWRITE | `carts, cart_items, kitchen_items, activity_logs`: **không bao giờ xung đột**, bản gửi sau thắng |
| Cột máy chủ sở hữu | `rev` ở mọi bảng; riêng `stores` thêm `order_seq, import_seq, export_seq` |
| Bảng con | Không được gửi riêng; phải đi cùng cha (lỗi 400 "push this table together with its parent.") |
| `force` | Chỉ dùng khi Quản lý chọn "Dùng bản của máy" (F020) |
| Giao dịch | Cả lần push chạy **một transaction**; một nhóm không hợp lệ (400) thì **không ghi gì** cả. Nhóm xung đột không làm hỏng các nhóm khác (ghi xung đột, các nhóm còn lại vẫn áp dụng) |

### 5.1 Kiểm tra nhóm (validateGroup) — trả 400 khi
- Bảng không đồng bộ, hoặc là bảng con gửi riêng; thiếu `rowId`; `baseRev` không phải số nguyên/null.
- `row` không phải object; cột không tồn tại trong bảng; giá trị không phải chuỗi/số/boolean/null.
- Khóa chính trong `row` khác `rowId`; dòng thuộc cửa hàng khác `storeId`.
- Bảng con không hợp lệ; dòng con thiếu id, sai khóa cha, hoặc `store_id` khác.
- Thiếu `storeId`/`deviceId`; `groups` không phải mảng; quá 500 nhóm.

## 6. Quy tắc tải xuống (SyncService.pull)

```
if (không có cursor): bắt đầu snapshot, ghi nhớ seq hiện tại của sync_log
snapshot: đọc từng bảng (theo thứ tự SYNCED_TABLES) theo khóa chính, mỗi lần ≤ limit dòng
          hết các bảng -> chuyển sang pha log, bắt đầu từ seq đã ghi nhớ (thay đổi trong lúc chụp được gửi lại; áp dụng lặp lại là vô hại)
log:      lấy các (bảng, dòng) có seq > cursor, gom theo dòng lấy seq lớn nhất, đọc trạng thái MỚI NHẤT
          dòng không còn -> change {op:'delete'}; còn -> {op:'upsert', row}
done = đã đọc tới cuối
```
- `limit`: mặc định 500, tối đa 1000, phải là số nguyên (ngược lại 400).
- Cursor sai định dạng → `BAD_CURSOR` (400). Cursor thuộc epoch cũ → `EPOCH_CHANGED` (409). Cursor lớn hơn `seq` hiện có → `CURSOR_AHEAD` (409).
- Pull tự gọi `ensureInfrastructure`: tạo `sync_log`, epoch, trigger nếu thiếu. Thiếu bảng nghiệp vụ → `NOT_READY` (409): "Open the app once so it creates them".

### 6.1 Mã lỗi `SyncError`
| Mã | HTTP | Ý nghĩa |
|---|---|---|
| `BAD_REQUEST` | 400 | Tham số/nhóm sai |
| `BAD_CURSOR` | 400 | Cursor không đọc được |
| `NOT_FOUND` | 404 | Cửa hàng/xung đột không tồn tại |
| `NOT_READY` | 409 | Máy chủ chưa có schema ứng dụng |
| `EPOCH_CHANGED` | 409 | CSDL đã được khôi phục: tải lại toàn bộ |
| `CURSOR_AHEAD` | 409 | Vị trí tải xuống mới hơn nhật ký máy chủ |
| `CONFLICT_STALE`, `NOT_PENDING` | 409 | Xem F020 |

## 7. Dữ liệu (Database)

### 7.1 Trên máy chủ
| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `sync_log` | `seq` (tăng dần), `table_name`, `row_id`, `op`, `store_id`, `changed_at` | Trigger sinh ra, 3 trigger/bảng (insert, update, delete) |
| `sync_meta` | `key`, `value`; khóa `epoch` | Epoch đổi khi khôi phục (`regenerateEpoch`) |
| `sync_counters` | `store_id, kind, last_value` | Bộ đếm số chứng từ (F021) |
| `sync_conflicts` | xem F020 | |
| Mọi bảng đồng bộ | cột `rev INTEGER` | Tăng khi cập nhật |

### 7.2 Trên thiết bị (chỉ native; migration 1001, `src/db/deviceSchema.ts`)
| Bảng | Cột | Ý nghĩa |
|---|---|---|
| `sync_state` | `key PK, value` | Khóa dùng: `deviceId`, `storeId`, `epoch`, `cursor`, `initialSync` (`pending`/`done`), `applying` (`0`/`1`), `tempCounter` |
| `sync_outbox` | `table_name, row_id, store_id, change_count, queued_at`; PK (`table_name`,`row_id`) | Dòng chờ gửi. Thay đổi lặp: `change_count + 1` |
| `sync_row_base` | `table_name, row_id, base_rev`; PK (`table_name`,`row_id`) | `rev` lần cuối biết |
| Trigger `outbox_<bảng>_ai/au` | | Mọi bảng đồng bộ. Bảng con thêm `ad` (xóa) và đánh dấu **dòng cha**. Điều kiện `WHEN applying = '0'` |

`verifyDeviceSyncSchema` so số trigger thực tế với số mong đợi; thiếu → **báo lỗi rõ** (plugin SQLite điện thoại có thể tách sai script trigger; thiếu trigger nghĩa là sửa trên máy sẽ không bao giờ lên máy chủ).

## 8. API (tất cả cần `Authorization: Bearer <API_TOKEN>`)
| Method + đường dẫn | Việc |
|---|---|
| `GET /api/sync/pull?storeId&cursor&limit` | Tải thay đổi |
| `POST /api/sync/push` | Gửi nhóm |
| `GET /api/sync/stores` | Danh sách cửa hàng chưa xóa (id, tên) để chọn khi cấu hình |
| `GET /api/sync/summary?storeId&after` | Bảng nào đổi |
| `POST /api/sync/next-number` | Cấp số chứng từ (F021) |
| `GET/POST /api/sync/conflicts...` | F020 |

## 9. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Sửa dòng X trên máy; trước khi gửi, máy khác sửa X và đẩy lên | Pull **bỏ qua** X (đang trong outbox). Push: `baseRev` ≠ `rev` và nội dung khác → xung đột |
| Hai máy cùng sửa X nhưng ra **cùng giá trị** | `sameRow` → `unchanged`, không xung đột |
| Sửa X trên máy, máy chủ xóa X | Xung đột (serverGroup = null) |
| Giỏ hàng/phiếu bếp sửa trên hai máy | Bản gửi sau thắng, không xung đột (OVERWRITE) |
| Sửa lại X ngay khi đang gửi X | `change_count` đổi → X ở lại outbox, gửi vòng sau |
| Mạng đứt giữa push | Outbox còn nguyên; gửi lại an toàn (cùng giá trị → `unchanged`, số chứng từ không cấp lại) |
| Tải lần đầu bị ngắt (đóng app) | Mở lại tải tiếp từ cursor |
| Máy chủ khôi phục khi máy còn dữ liệu chưa gửi | Tải lại làm mất; app nhắc xuất file trước |

## 10. Kiểm thử
`syncService.test.mjs`, `syncApplier.test.mjs`, `syncRouter.test.mjs`, `syncPolicy`/`deviceSchema` (khớp `CHILD_TABLES` hai phía), `src/sync/*.test.ts` (engine, scheduler, store, initialSync, pullApplier), dùng `sqlJsTestDriver` để chạy SQLite trong test.

## 11. Giới hạn
- Chưa có xóa mềm đồng bộ cho các bảng không có `deleted_at`: dòng con thay theo tập.
- Hóa đơn/phiếu kho bị sửa đồng thời trên hai máy luôn đi vào xung đột để người xử lý (không tự trộn theo từng cột).
- Chưa kiểm chứng trên thiết bị thật; cần thử mạng yếu, chuyển wifi/4G, app bị hệ điều hành tắt giữa vòng.
- Thứ tự triển khai: cập nhật máy chủ (nodemailer, bộ đếm `KK`, cột mới) và **mở bản web một lần** để chạy migration v19–v22 **trước** khi điện thoại đồng bộ, nếu không push bị 400 vì cột chưa có.
