# F018 — Kiến trúc dữ liệu: máy chủ, chuyển tuyến domain/LAN, ứng dụng Android/iOS

| Trường | Nội dung |
|---|---|
| Mã chức năng | F018 |
| Trạng thái | Hoàn thiện (web: đã kiểm thử; Android: build được, **chưa chạy thử trên thiết bị thật**; iOS: chưa tạo project) |
| Người dùng | Chủ / Quản lý (cấu hình), mọi vai trò (sử dụng) |
| Mã nguồn chính | `src/db/driver.ts`, `src/db/remoteDriver.ts`, `src/db/serverEndpoints.ts`, `src/db/serverConnection.ts`, `src/native/*`, `src/components/NativeConfigDialog.tsx`, `server/pos-db-server/src/*`, `Dockerfile`, `docker-compose.yml`, `capacitor.config.ts`, `android/` |
| Tài liệu liên quan | F019 (đồng bộ), F020 (xung đột), F021 (cấp số), `document/DEPLOY_VPS.md` |

## 1. Mục tiêu

- Dữ liệu dùng chung của cửa hàng nằm ở **một CSDL SQLite trên máy chủ (VPS)**. Nhiều thiết bị (máy thu ngân, màn hình bếp, điện thoại) thấy cùng một dữ liệu.
- Ứng dụng luôn chọn được đường kết nối còn sống: **domain trước, mạng nội bộ (LAN) sau**.
- Ứng dụng điện thoại (Android/iOS) **làm việc được khi mất mạng** (SQLite trên máy) rồi đồng bộ lại (xem F019).
- Một bộ mã nguồn chạy được trên trình duyệt và trên ứng dụng đóng gói (Capacitor).

## 2. Các chế độ dữ liệu

| Nền tảng | Điều kiện | CSDL dùng | Có máy chủ? |
|---|---|---|---|
| Web (trình duyệt) | Có cấu hình máy chủ (biến `VITE_SERVER_*` lúc build, hoặc cấu hình lưu trong trình duyệt) | `RemoteSqlDriver`: mọi câu SQL chạy trên máy chủ | Có, **bắt buộc** (không kết nối được thì báo lỗi, không bán hàng) |
| Web | Không có cấu hình máy chủ | `WebSqlDriver`: sql.js + IndexedDB trong trình duyệt | Không |
| Android / iOS | `NativeSettings.mode = 'unset'` hoặc `'standalone'` ("Không dùng máy chủ") | `NativeSqlDriver`: SQLite thật trên máy | Không |
| Android / iOS | `mode = 'server'` ("Dùng máy chủ") | `NativeSqlDriver` + đồng bộ nền (F019) | Có, **không bắt buộc** (mất mạng vẫn làm việc) |

Phân biệt theo **nền tảng** (`Capacitor.isNativePlatform()`), không theo kích thước thiết bị.

## 3. Use case

### UC-018-01 — Web mở ứng dụng khi máy chủ có sẵn
| Mục | Nội dung |
|---|---|
| Actor | Mọi người dùng web |
| Tiền điều kiện | Trang web được build kèm `VITE_SERVER_DOMAIN_URL` và/hoặc `VITE_SERVER_LOCAL_URL` và `VITE_SERVER_API_TOKEN` |
| Luồng chính | 1) App tạo `ServerEndpoints` với hai địa chỉ. 2) Yêu cầu đầu tiên gọi `chooseRoute()`: thử `GET /api/health` địa chỉ domain (timeout 2,5 giây). 3) Domain trả lời → dùng domain. 4) Các yêu cầu SQL chạy qua `/api/sql` và `/api/batch` kèm `Authorization: Bearer <API_TOKEN>`. |
| Thay thế | Domain không trả lời **và** có địa chỉ LAN: thử LAN; LAN trả lời → chuyển sang LAN. Cả hai không trả lời → lỗi "Không kết nối được máy chủ dữ liệu qua cả hai địa chỉ (<địa chỉ>: <lý do>; ...)" kèm địa chỉ trang đang mở. |
| Hậu điều kiện | `activeRoute` = `domain` hoặc `local`. |

### UC-018-02 — Chuyển tuyến khi đang dùng
| Mục | Nội dung |
|---|---|
| Luồng chính | Đang dùng domain, một yêu cầu bị lỗi "không tới được máy chủ" (lỗi mạng, hoặc mã 502/503/504) → app kiểm tra địa chỉ còn lại (`isHealthy`), nếu ổn thì chuyển ngay và gửi lại yêu cầu **nếu yêu cầu đó an toàn để lặp** (xem 4.3). |
| Quay lại domain | Khi đang ở LAN, cứ **15 giây** app kiểm tra nền xem domain đã sống lại chưa; sống lại thì chuyển về domain. |

### UC-018-03 — Cấu hình ứng dụng điện thoại
| Mục | Nội dung |
|---|---|
| Actor | Chủ / Quản lý |
| Luồng chính | 1) Màn đăng nhập → nút "Cấu hình" (chỉ hiện trên app native). 2) Chọn "Dùng máy chủ", nhập domain, IP mạng nội bộ, mã API. 3) "Kiểm tra kết nối": thử từng địa chỉ (health + `SELECT 1` kèm token), hiện kết quả từng địa chỉ; nếu có địa chỉ ổn thì tải danh sách cửa hàng. 4) Chọn cửa hàng. 5) "Lưu". |
| Thay thế | Chọn "Không dùng máy chủ": lưu `mode='standalone'`, xóa cửa hàng đã chọn; app chỉ dùng dữ liệu trên máy. Địa chỉ không phải http(s) → lỗi. Thiếu mã API → lỗi. Chưa chọn cửa hàng → lỗi "Hãy chọn cửa hàng cần đồng bộ". |
| Khi lưu chế độ máy chủ | Nếu máy **chưa tải** dữ liệu của cửa hàng đó: nếu máy đang có dữ liệu → hỏi "xuất file SQLite sao lưu?" rồi hỏi xác nhận "dữ liệu trên thiết bị sẽ bị xóa và thay bằng dữ liệu cửa hàng X"; đồng ý → `markInitialSyncPending(storeId)` → tải lại trang → màn loading tải lần đầu (F019, UC-019-01). Máy đã tải đúng cửa hàng đó rồi thì chỉ lưu cấu hình. |
| Hậu điều kiện | Cấu hình lưu bằng Capacitor Preferences (khóa `smartpos.nativeSettings`). |

### UC-018-04 — Xuất file SQLite (app native)
Nút "Xuất file SQLite" trong hộp "Cấu hình": `VACUUM INTO` ra file tạm trong thư mục cache → đọc → mở bảng chia sẻ (Files, AirDrop, mail) với tên `mvp-pos-YYYYMMDD-HHmm.db`. Lỗi → hiện thông báo lỗi nguyên văn.

### UC-018-05 — Tải lại dữ liệu từ máy chủ
Nút "Tải lại dữ liệu" (chỉ khi đã ở chế độ máy chủ có cửa hàng): cùng quy trình xác nhận như UC-018-03 rồi `markInitialSyncPending` và tải lại trang. Dùng khi máy chủ báo "đã được khôi phục từ bản sao lưu" (F019, mã `EPOCH_CHANGED`).

## 4. Quy tắc nghiệp vụ & logic

### 4.1 Chọn driver (`getDriver`)
```
if (native)            -> NativeSqlDriver                       (dữ liệu trên máy)
else if (có cấu hình máy chủ) -> RemoteSqlDriver(ServerEndpoints, token)
else                   -> WebSqlDriver (sql.js + IndexedDB, ghi sau mỗi lần ghi 250 ms)
```
`getServerConnection()` ưu tiên giá trị cố định `VITE_SERVER_*`; nếu không có thì dùng giá trị lưu trong trình duyệt; giá trị lưu hỏng → **báo lỗi** (không im lặng dùng CSDL khác).

### 4.2 Thuật toán chọn tuyến (`ServerEndpoints.request`)
```
if (chưa có tuyến) chooseRoute()          // thử domain, rồi LAN
else recheckDomainInBackground()          // nếu đang ở LAN và đã quá 15 giây
first = tuyến hiện tại
try send(first)
catch UnreachableError:
    other = tuyến còn lại
    if (không có other)            -> lỗi
    if (!isHealthy(other))         -> lỗi (nêu cả hai địa chỉ)
    setActive(other); send(other)  -> lỗi nếu vẫn hỏng
```
- "Không tới được" = `fetch` ném lỗi mạng, hoặc trạng thái 502/503/504.
- Lỗi HTTP khác (400, 401, 409...) **không** làm chuyển tuyến; trả về cho nơi gọi xử lý.

### 4.3 Yêu cầu có được lặp không (`idempotent`)
| Loại yêu cầu | `idempotent` | Hành vi khi hết thời gian chờ (30 giây) |
|---|---|---|
| Đọc (`all`, `GET`) | true | Thử tuyến khác |
| Ghi (`run`, `exec`, `batch`) | false | **Không lặp**; báo "Máy chủ không trả lời kịp. Thao tác có thể đã được lưu, hãy kiểm tra lại dữ liệu trước khi làm lại." |
| `POST /api/sync/push` | true (an toàn: máy chủ trả `unchanged` cho bản ghi đã có cùng giá trị) | Thử tuyến khác |
| `POST /api/sync/next-number` | false (lặp sẽ làm mất số) | Không lặp |

### 4.4 Quy tắc mạng
- Trang `https` không gọi được địa chỉ `http` (mixed content): trình duyệt chặn; địa chỉ LAN `http://IP:8790` được máy chủ (container) phục vụ **trực tiếp**, không qua Apache. App native bật `allowMixedContent` và `cleartext`.
- CORS: máy chủ chỉ cho các origin trong `CORS_ORIGIN` (do `docker-compose` ghép từ `POS_LAN_ADDRESS`, `POS_DOMAIN_URL`, `https://localhost`, `capacitor://localhost`). Có header `Access-Control-Allow-Private-Network` cho trường hợp trang https gọi LAN.

### 4.5 Máy chủ (`server/pos-db-server`)
| Endpoint | Bảo vệ | Việc |
|---|---|---|
| `GET /api/health` | Không | Kiểm tra sống |
| `POST /api/sql` | Bearer API_TOKEN | `exec` / `run` / `all` một câu SQL |
| `POST /api/batch` | Bearer API_TOKEN | Nhiều câu trong **một transaction**; lỗi → rollback toàn bộ |
| `/api/sync/*` | Bearer API_TOKEN | F019, F020, F021 |
| `/api/auth/*` | Bearer API_TOKEN | F029 (chỉ khi cấu hình SMTP) |
| `/admin/*` | ADMIN_TOKEN | Trang quản trị CSDL: xem bảng, tải/nạp file `.db`, sao lưu |
- Sao lưu tự động: `BACKUP_INTERVAL_HOURS` (mặc định 24, 0 = tắt), giữ `BACKUP_KEEP` bản (mặc định 14), thư mục `<DATA_DIR>/backups`.
- Khi khôi phục CSDL từ file: `onRestore` tạo **epoch** mới để các thiết bị biết phải tải lại (F019).

### 4.6 Biến môi trường (`.env` cạnh `docker-compose.yml`)
| Biến | Ý nghĩa |
|---|---|
| `API_TOKEN` (≥16 ký tự) | Mã app dùng gọi API; **được nhúng vào bản web lúc build** |
| `ADMIN_TOKEN` (≥16, khác API_TOKEN) | Mã trang quản trị |
| `POS_PORT` (8790), `POS_BIND_ADDRESS` (127.0.0.1 hoặc 0.0.0.0), `POS_DATA_DIR` | Cổng, giao diện nghe, thư mục dữ liệu |
| `POS_DOMAIN_URL`, `POS_LAN_ADDRESS` | Sinh ra `VITE_SERVER_DOMAIN_URL`, `VITE_SERVER_LOCAL_URL` (`http://<LAN>:<PORT>`) và `CORS_ORIGIN` |
| `BACKUP_*` | Sao lưu tự động |
| `SMTP_*` | Gửi mail (F029) |

## 5. Dữ liệu (Database)

### 5.1 Migration
- `schema_migrations(version PK, applied_at)`: danh sách migration đã chạy. Hàm `migrate()` (`src/db/index.ts`) chạy `MIGRATIONS` (dùng chung, v1 → v22) và, **chỉ trên nền tảng native**, `DEVICE_MIGRATIONS` (v1001+: bảng đồng bộ của thiết bị, F019). Sau đó kiểm tra đủ trigger (`verifyDeviceSyncSchema`), thiếu thì **báo lỗi rõ**.
- `meta(key PK, value, updated_at)`: cặp khóa-giá trị, có `schema_version`, `active_store_id`.

### 5.2 Cấu hình trên thiết bị native (Preferences, không phải bảng)
`NativeSettings { mode: 'unset'|'standalone'|'server', domainUrl, localUrl, token, storeId, storeName }`. `validateNativeSettings`: chế độ `server` bắt buộc có ít nhất một địa chỉ http(s) hợp lệ và mã API; khi **lưu** bắt buộc thêm `storeId`; khi **đọc** cấu hình cũ chưa có `storeId` thì vẫn mở được và màn tải dữ liệu yêu cầu chọn cửa hàng. Giá trị lưu hỏng → app báo "Cấu hình kết nối của ứng dụng bị hỏng ..." và không khởi động.

## 6. Giao diện & thông báo
- Hộp "Cấu hình kết nối": hai lựa chọn radio, ba ô nhập, "Kiểm tra kết nối" (mỗi địa chỉ một khung xanh/đỏ), ô chọn cửa hàng, "Tải lại dữ liệu", "Xuất file SQLite", "Lưu", "Đóng".
- Thông báo kiểm tra: "Kết nối được, mã API hợp lệ." / "Máy chủ có phản hồi nhưng mã API không đúng." / "Không kết nối được: <lý do>." / "... không phản hồi sau 5 giây."

## 7. Trường hợp biên & lỗi
| Tình huống | Kết quả |
|---|---|
| Hai địa chỉ cùng hỏng | Lỗi nêu từng địa chỉ + lý do + địa chỉ trang; web không mở được CSDL |
| Domain hỏng, LAN tốt | Dùng LAN; domain thử lại mỗi 15 giây |
| API_TOKEN sai | 401 → "Máy chủ dữ liệu từ chối mã API. Hãy kiểm tra lại mã API." |
| Câu SQL lỗi trong batch | 400, rollback cả batch, thông báo lỗi từ SQLite |
| Ghi bị timeout | Không lặp, cảnh báo kiểm tra lại dữ liệu |
| Khôi phục CSDL máy chủ | Epoch đổi; thiết bị báo cần "Tải lại dữ liệu" (F019) |

## 8. Kiểm thử
`serverEndpoints.test.ts` (chuyển tuyến, thời gian chờ, lặp yêu cầu), `serverConnection.test.ts`, `native/native.test.ts` (cấu hình, kiểm tra kết nối, xuất file), `server/pos-db-server/src/remoteDriver.integration.test.mjs` (driver với máy chủ thật, chuyển tuyến, lỗi), `cors.test.mjs`, `backupScheduler.test.mjs`.

## 9. Giới hạn & việc chưa làm
- API_TOKEN nằm trong bản web: ai tải được trang đều đọc được; `/api/sql` chạy SQL tùy ý. Cần bảo vệ lớp Apache (IP/VPN/Basic auth) và xác thực theo người dùng ở máy chủ (kế hoạch bảo mật, chưa làm).
- iOS: chưa tạo project (cần CocoaPods) và cần cấu hình ATS/local network.
- Chưa kiểm chứng trên điện thoại thật: SQLite native, trigger, chia sẻ file, nhận diện mạng.
