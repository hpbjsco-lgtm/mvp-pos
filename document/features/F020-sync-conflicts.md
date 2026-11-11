# F020 — Xử lý xung đột đồng bộ

| Trường | Nội dung |
|---|---|
| Mã chức năng | F020 |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động; chưa thử với dữ liệu thật |
| Actor | Chủ, Quản lý (xử lý). Thiết bị bán hàng chỉ thấy thông báo |
| Mã nguồn | Máy chủ: `conflictStore.mjs`, `syncRouter.mjs`. Giao diện: `ConflictsSection.tsx`, `ConflictBanner.tsx`, `useConflictCount.ts`, `conflictPresenter.ts` |
| Liên quan | F019 (nguồn phát sinh xung đột) |

## 1. Mục tiêu
Khi hai thiết bị sửa cùng một bản ghi khác nhau, hệ thống không chọn thay người dùng. Nó lưu **cả hai bản**, báo cho Chủ/Quản lý và để họ chọn bản đúng.

## 2. Khi nào xảy ra xung đột
Xem F019 mục 5. Tóm tắt: dòng đã có trên máy chủ, `baseRev` của máy khác `rev` hiện tại, nội dung khác nhau, và bảng không thuộc nhóm ghi đè (`carts, cart_items, kitchen_items, activity_logs`). Hoặc máy sửa một dòng đã bị xóa trên máy chủ.

## 3. Use case

### UC-020-01 — Máy chủ ghi nhận xung đột
| Mục | Nội dung |
|---|---|
| Kích hoạt | `push` gặp nhóm xung đột |
| Luồng | `ConflictStore.record`: nếu dòng đó **đã có** xung đột `pending` → **cập nhật** bản đó (device_id, base_rev, server_rev, hai payload). Chưa có → tạo mới (UUID). Các nhóm khác trong lần push vẫn được áp dụng. |
| Kết quả | Phản hồi push liệt kê `conflicts: [{conflictId, table, rowId}]`. Mỗi dòng chỉ có tối đa **một** xung đột mở. |

### UC-020-02 — Thông báo
- Kết quả pull kèm `pendingConflicts` → thanh thông báo (`ConflictBanner`).
- Với Chủ/Quản lý, mục menu "Xung đột" hiện số lượng. Hook `useConflictCount` hỏi `GET /api/sync/conflicts?status=pending` mỗi **30 giây**, chỉ khi tab đang hiển thị.
- Mục menu chỉ hiện khi app dùng máy chủ (xem `ScreenId 'conflicts'`).

### UC-020-03 — Xem và xử lý
| Bước | Nội dung |
|---|---|
| 1 | Màn "Xung đột" có hai tab: **Chờ xử lý** / **Đã xử lý**. Bảng cột: Loại, Bản ghi, Máy (8 ký tự đầu của deviceId), Lúc; tab đã xử lý thêm Kết quả, Người xử lý |
| 2 | Chọn một dòng → so sánh hai bản theo từng trường (nhãn tiếng Việt từ `conflictPresenter`), trường khác nhau được đánh dấu. Hóa đơn/phiếu hiển thị kèm dòng chi tiết |
| 3 | Chọn **Giữ bản máy chủ** hoặc **Dùng bản của máy** (có hỏi xác nhận, nêu hậu quả) |
| 4 | Hệ thống gửi `POST /api/sync/conflicts/:id/resolve {choice, resolvedBy}` |

Thông báo hậu quả khi chọn:
- Giữ máy chủ: "Dữ liệu trên máy chủ được giữ nguyên, các máy sẽ bỏ thay đổi của mình."
- Dùng bản của máy: bản của máy được ghi vào máy chủ.

### UC-020-04 — Luồng if/else của `resolve`
```
if choice not in {server, device}        -> 400 BAD_REQUEST
if resolvedBy rỗng                       -> 400 BAD_REQUEST
conflict = đọc theo id                   -> 404 NOT_FOUND nếu không có
if conflict.status != pending            -> 409 NOT_PENDING  ("đã được xử lý")
serverGroup = đọc bản hiện tại trên máy chủ
if serverGroup.rev != conflict.serverRev -> CẬP NHẬT bản server_payload trong xung đột, rồi
                                            409 CONFLICT_STALE ("dữ liệu máy chủ vừa đổi, hãy xem lại và chọn lại")
transaction:
    if choice == device : applyGroup(devicePayload, force=true)   # ghi đè, rev + 1, thay cả tập dòng con
    else if serverGroup : touchGroup(serverGroup)                 # rev + 1 cho cha, "chạm" từng dòng con để ghi nhật ký
                          # mục đích: mọi máy tải lại bản máy chủ và bỏ thay đổi của mình
    đánh dấu status=resolved, resolution=choice, resolved_by, resolved_at
```
Giao diện: `CONFLICT_STALE` → "Dữ liệu trên máy chủ vừa thay đổi. Hãy xem lại hai bản hiện tại rồi chọn lại."; `NOT_PENDING` → "Xung đột này đã được người khác xử lý."

### UC-020-05 — Máy khác nhận kết quả
Sau khi xử lý, `rev` của dòng tăng, nên ở lần pull kế tiếp mọi máy tải lại bản đúng. Dòng của máy đã gây xung đột vẫn nằm trong outbox: khi gửi lại, `baseRev` cũ khác `rev` mới nhưng nội dung đã trùng sau khi pull → `unchanged`, hoặc nếu máy chưa pull kịp thì vào xung đột mới (và dòng đó có thể mở lại xung đột; xem 6).

## 4. Dữ liệu
Bảng `sync_conflicts` (máy chủ, tạo bởi `ensureInfrastructure`):
| Cột | Ý nghĩa |
|---|---|
| `id` | UUID |
| `store_id`, `table_name`, `row_id` | Bản ghi xung đột |
| `device_id` | Máy gửi bản bị loại |
| `base_rev`, `server_rev` | Phiên bản máy dựa vào / phiên bản máy chủ lúc ghi nhận |
| `device_payload`, `server_payload` | JSON nhóm (cha + con) hai bên; `server_payload` = `null` khi máy chủ đã xóa dòng |
| `status` | `pending` / `resolved` |
| `resolution` | `server` / `device` |
| `resolved_by`, `resolved_at`, `created_at` | Người/thời điểm |

## 5. API
| Method + đường dẫn | Trả về |
|---|---|
| `GET /api/sync/conflicts?storeId&status=pending|resolved` | Danh sách (không kèm payload), mới nhất trước. Thiếu `storeId` → 400 |
| `GET /api/sync/conflicts/:id` | Chi tiết với `devicePayload`, `serverPayload` |
| `POST /api/sync/conflicts/:id/resolve` | `{ok:true}` |

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Máy A và B đều sửa dòng X, cả hai đều xung đột | Chỉ một xung đột mở cho X; bản gửi sau ghi đè phần "bản của máy" trong xung đột |
| Chưa xử lý, máy chủ lại đổi X | Khi xử lý: `CONFLICT_STALE`, bản hiện tại được làm mới để người dùng xem lại |
| Hai quản lý cùng xử lý | Người thứ hai nhận `NOT_PENDING` |
| Chọn "Dùng bản của máy" mà dòng bị xóa trên máy chủ | `applyGroup(force)` chèn lại dòng |
| Chọn "Giữ máy chủ" mà `serverGroup = null` | Không có gì để chạm; chỉ đánh dấu đã xử lý (dòng vẫn xóa) |
| Chứng từ đánh số bị xung đột | Xung đột **không dùng số chính thức**; số chỉ cấp khi ghi thật (F021) |
| Bảng mới thêm cột nhưng chưa có nhãn hiển thị | Test `conflictPresenter` thất bại: bắt buộc thêm nhãn hoặc đánh dấu ẩn cho cột mới |

## 7. Kiểm thử
`conflictStore.test.mjs`, `syncRouter.test.mjs`, `src/sync/conflictPresenter.test.ts` (kiểm tra mọi cột của mọi bảng đồng bộ có nhãn hoặc bị ẩn).

## 8. Giới hạn
- Chỉ chọn nguyên cả bản (không trộn từng trường).
- Không có thông báo đẩy; người dùng phải mở app/menu.
- Chưa có quyền chi tiết ngoài Chủ/Quản lý.
