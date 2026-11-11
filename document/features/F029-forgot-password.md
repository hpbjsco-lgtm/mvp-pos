# F029 — Quên mật khẩu bằng mã gửi qua email

| Trường | Nội dung |
|---|---|
| Mã chức năng | F029 (A11 trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động. **Chưa gửi thử với SMTP thật**; chưa chọn nhà cung cấp mail |
| Actor | Bất kỳ nhân viên có tài khoản và có email (chưa đăng nhập) |
| Mã nguồn | Máy chủ: `server/pos-db-server/src/{passwordReset,authRouter,mailer,config,app,index}.mjs`. Ứng dụng: `src/components/{ForgotPasswordDialog,LoginScreen}.tsx`, `src/sync/syncClient.ts` (`passwordResetAvailable`, `requestPasswordReset`, `resetPassword`) |
| Liên quan | F001 (đăng nhập), F008 (nhân viên đặt lại mật khẩu cho người khác), F018 (máy chủ), `document/DEPLOY_VPS.md` mục 6 |

## 1. Mục tiêu
Người quên mật khẩu tự đặt lại được mà không cần nhờ Chủ/Quản lý. Phương án nhờ Chủ/Quản lý (F008) vẫn giữ.

## 2. Điều kiện bật tính năng
| Điều kiện | Kết quả |
|---|---|
| Máy chủ có `SMTP_HOST` | Bật: có `/api/auth/*`, màn đăng nhập hiện "Quên mật khẩu?" |
| Không có `SMTP_HOST` | Tắt: không có đường dẫn `/api/auth`, nút "Quên mật khẩu?" **không hiện** |
| Ứng dụng không dùng máy chủ (SQLite cục bộ) | Tắt (không có nơi gửi mail) |
`SMTP_HOST` có mà thiếu/ sai `SMTP_PORT` (1–65535) hoặc thiếu `SMTP_FROM` → máy chủ **không khởi động**, báo lỗi rõ.

Biến môi trường: `SMTP_HOST`, `SMTP_PORT` (mặc định 587; cổng 465 dùng kết nối an toàn `secure`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (ví dụ `MVP POS <no-reply@domain>`). Khuyến nghị cấu hình SPF/DKIM cho tên miền gửi (xem DEPLOY_VPS.md).

## 3. Use case

### UC-029-01 — Yêu cầu mã
| Mục | Nội dung |
|---|---|
| Luồng | Màn đăng nhập → "Quên mật khẩu?" → nhập **tên tài khoản hoặc email** → "Gửi mã" → chuyển sang bước nhập mã |
| Kiểm tra ở ứng dụng | Trống → "Hãy nhập tên tài khoản hoặc email." |
| Phản hồi | **Luôn** `{ok: true}`, dù tài khoản có tồn tại hay không (không lộ tài khoản) |
| Nội dung bước 2 | "Nếu tài khoản có email, mã 6 số đã được gửi và có hiệu lực 15 phút. Nhập mã cùng mật khẩu mới." |
| Ghi chú giao diện | "Tài khoản chưa có email thì nhờ chủ cửa hàng hoặc quản lý đặt lại mật khẩu." |

### UC-029-02 — Đặt mật khẩu mới
| Mục | Nội dung |
|---|---|
| Luồng | Nhập mã 6 số (chỉ nhận chữ số, tối đa 6) + mật khẩu mới + nhập lại → "Đổi mật khẩu" → màn "xong", quay lại đăng nhập |
| Kiểm tra ở ứng dụng | Mật khẩu < 6 ký tự → "Mật khẩu mới cần ít nhất 6 ký tự." · Hai lần khác nhau → "Hai lần nhập mật khẩu mới chưa giống nhau." · Nút khóa khi mã chưa đủ 6 số |
| Băm | Ứng dụng tự băm bằng PBKDF2 (salt ngẫu nhiên) và chỉ gửi `salt`, `hash`; **máy chủ không thấy mật khẩu thô** |
| Kết quả | `users.password_hash`, `password_salt` cập nhật, `rev + 1` (đồng bộ xuống các máy), xóa mã |
| Gửi lại | Nút "Gửi lại mã hoặc đổi tài khoản" quay về bước 1 |

## 4. Quy tắc máy chủ

### 4.1 Tài khoản đủ điều kiện (`findAccount`)
Khớp `lower(username)` **hoặc** `lower(email)` với giá trị gõ (cắt khoảng trắng, hạ chữ thường) **và**: chưa xóa (`deleted_at IS NULL`), đang hoạt động (`is_active <> 0`), `role <> 'sysadmin'`, `email <> ''`. Không đủ điều kiện → coi như không có.

### 4.2 Yêu cầu mã (`requestReset`)
```
account = findAccount(login)
if (!account) return                         # không báo gì
existing = bản ghi password_resets của account
if (existing && bây giờ − existing.sent_at < 60 giây) return      # giới hạn 1 mã/phút/tài khoản (im lặng)
code = 6 chữ số ngẫu nhiên an toàn (000000–999999)
lưu: salt ngẫu nhiên, code_hash = sha256(salt:code), expires_at = now + 15 phút, attempts = 0, sent_at = now
gửi mail:  Tiêu đề "Mã đặt lại mật khẩu MVP POS"; nội dung có mã, hiệu lực 15 phút, dùng một lần, dặn không chia sẻ
if (gửi lỗi) chỉ ghi log máy chủ; KHÔNG báo cho người gọi (để không lộ tài khoản)
```
Mã **không lưu thô**, chỉ lưu băm có salt.

### 4.3 Đổi mật khẩu (`resetPassword`)
```
if (salt không phải chuỗi 8–128 ký tự không khoảng trắng, hoặc hash 16–256) -> 400 BAD_REQUEST
if (code không đúng 6 chữ số)                                              -> 400 INVALID_CODE "Mã không đúng hoặc đã hết hạn."
account = findAccount(login); record = password_resets của account
if (!account || !record)                                                   -> INVALID_CODE
if (now > expires_at || attempts >= 5): xóa record                         -> INVALID_CODE
attempts += 1                      # tăng TRƯỚC khi so sánh, để không thử lại vô hạn
if (băm mã nhập != code_hash)  (so sánh thời gian cố định)                  -> INVALID_CODE
transaction: cập nhật password_hash/salt (+rev), xóa record               # mã dùng một lần
```
Mọi lỗi mã (sai, hết hạn, đã dùng, sai tài khoản) dùng **cùng một thông báo** "Mã không đúng hoặc đã hết hạn."

### 4.4 Giới hạn tần suất theo IP (`authRouter`)
Tối đa **30 yêu cầu / 15 phút** cho mỗi địa chỉ IP trên toàn bộ `/api/auth/*`; vượt → 429 `TOO_MANY_REQUESTS` "Quá nhiều yêu cầu. Hãy thử lại sau ít phút." (lưu trong bộ nhớ, mất khi khởi động lại máy chủ).

### 4.5 Bảng tạm
`password_resets` chỉ nằm trong CSDL máy chủ, **không đồng bộ**:
| Cột | Ý nghĩa |
|---|---|
| `uid` PK | Tài khoản |
| `code_salt`, `code_hash` | Băm của mã |
| `expires_at` | Mốc hết hạn (ms) |
| `attempts` | Số lần nhập sai/thử |
| `sent_at` | Thời điểm gửi gần nhất (ms) |

## 5. API
| Method + đường dẫn | Việc |
|---|---|
| `GET /api/auth/capabilities` | `{passwordReset: true}`; ứng dụng gọi để quyết định hiện nút (lỗi → coi là tắt) |
| `POST /api/auth/forgot {login}` | Gửi mã; luôn `{ok:true}` |
| `POST /api/auth/reset {login, code, salt, hash}` | Đổi mật khẩu; lỗi `{error, code}` |
Cả ba đi sau kiểm tra `API_TOKEN` (F018).

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Nhập sai mã 5 lần | Lần thử sau: xóa mã, phải xin mã mới |
| Xin mã 2 lần trong 1 phút | Lần hai bị bỏ qua im lặng (mã cũ vẫn hiệu lực) |
| Xin mã mới sau 1 phút | Mã cũ bị thay, bộ đếm sai về 0 |
| Tài khoản không có email | Không gửi; người dùng được nhắc nhờ Chủ/Quản lý |
| Tài khoản sysadmin | Không hỗ trợ (tài khoản cứng) |
| SMTP lỗi | Người dùng vẫn thấy bước nhập mã nhưng không có mã; quản trị xem log máy chủ `[password-reset] Could not send the code to ...` |
| Mật khẩu mới trên điện thoại đã tải dữ liệu | Hash mới nằm trên máy chủ, **đến máy sau lần đồng bộ kế tiếp** (F019). Máy offline chưa đồng bộ vẫn đăng nhập bằng mật khẩu cũ (suy luận từ thiết kế đăng nhập cục bộ, cần kiểm chứng trên máy thật) |
| Chủ cửa hàng không có email | Cần nhập email cho tài khoản trước (hiện email bắt buộc khi tạo tài khoản qua form; tài khoản cũ có thể trống) |

## 7. Việc chờ quyết định
Nhà cung cấp SMTP và tài khoản gửi; nội dung/tiêu đề thư; có bắt buộc email cho mọi nhân viên không.

## 8. Kiểm thử
`server/pos-db-server/src/passwordReset.test.mjs` (mã, hết hạn, giới hạn thử, không lộ tài khoản, hash), `authRouter` (tần suất), `src/sync/passwordResetClient.test.ts`.
