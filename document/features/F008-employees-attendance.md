# F008 — Nhân viên, tài khoản của tôi và chấm công

| Trường | Nội dung |
|---|---|
| Mã chức năng | F008 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.8 |
| Actor | Chủ, Quản lý (quản lý nhân viên); mọi vai trò (chấm công, đổi mật khẩu của mình) |
| Mã nguồn | `src/components/{EmployeesSection,MyAccountDialog}.tsx`, `src/App.tsx` (`handleCheckIn`, `handleCheckOut`), `src/db/auth.ts` (`createEmployee`, `changePassword`, `changeOwnPassword`) |
| Liên quan | F001, F029 |

## 1. Mục tiêu
Chủ/Quản lý tạo và quản lý tài khoản nhân viên; mọi nhân viên tự chấm công vào/ra ca và đổi mật khẩu; tiền công tính theo giờ.

## 2. Use case

### UC-008-01 — Danh sách nhân viên
Chỉ Chủ/Quản lý vào được màn **Nhân viên**. Bảng: họ tên, chức vụ (nhãn vai trò), mức lương mỗi giờ (mặc định hiển thị 25.000 đ/giờ nếu chưa có), nút sửa và nút biểu tượng chìa khóa đặt lại mật khẩu.

### UC-008-02 — Thêm nhân viên
| Trường | Quy tắc |
|---|---|
| Họ tên | Bắt buộc |
| Tên tài khoản | 3–32 ký tự, chữ thường không dấu/số/`.`/`_`/`-`; duy nhất (F001) |
| Email | Hợp lệ; duy nhất |
| Mật khẩu | Tối thiểu 6 ký tự: "Mật khẩu cần tối thiểu 6 ký tự." |
| Vai trò | Quản lý, Phục vụ/Thu ngân, Nhân viên bếp. **Bếp chỉ chọn được ở cửa hàng F&B** |
| Lương giờ | Số ≥ 0 |
Lỗi trùng: "Tên tài khoản này đã tồn tại." · "Email này đã được dùng cho một tài khoản khác." Lỗi khác: "Không tạo được tài khoản." Ghi nhật ký "Thêm nhân viên".

### UC-008-03 — Sửa vai trò và lương giờ
Hộp sửa: đổi vai trò, mức lương giờ (`Number(...) || 0`). Lỗi: "Lỗi lưu trữ thông tin nhân viên!".

### UC-008-04 — Đặt lại mật khẩu
```
canResetPassword(nhân viên) = có hàm đặt lại
        && ( vai trò hiện tại == owner
          || (vai trò hiện tại == manager && nhân viên.role != owner)
          || nhân viên.uid == uid hiện tại )
```
Sau khi đặt: "Đã đặt lại mật khẩu. Hãy báo mật khẩu mới cho nhân viên." Lỗi: hiển thị thông báo lỗi trong hộp ("Không đặt lại được mật khẩu."). Sysadmin đặt lại mọi tài khoản trong màn Tài khoản (F014).

### UC-008-05 — Tài khoản của tôi (mọi vai trò)
Bấm tên người dùng ở thanh menu. Hộp gồm:
1. **Chấm công hôm nay** (UC-008-06).
2. **Đổi mật khẩu**: nhập mật khẩu hiện tại + mới (≥ 6 ký tự) (F001).
3. Cấu hình máy in hóa đơn (F022) và các thiết lập tài khoản khác.
Sysadmin không chấm công và đổi mật khẩu trong cấu hình.

### UC-008-06 — Chấm công
```
Check-in:   id bản ghi = att-<uid>-<yyyy-mm-dd>
            tạo bản ghi {checkIn = bây giờ, status = 'working', hourlyRate = lương giờ hiện tại của nhân viên (mặc định 25.000)}
            báo "Check-in thành công lúc <giờ>!"
            (bản ghi cùng ngày đã có sẽ bị THAY bằng bản mới)
Check-out:  hours = max(0,01, (checkOut − checkIn) / 3.600.000)
            hourlyRate = lương giờ hiện tại của nhân viên || giá trị lưu || 25.000
            dailyWage  = round(hours × hourlyRate)
            status = 'completed'; báo "Check-out thành công! Ca trực đã hoàn tất và kết toán lương ngày."
```
Giao diện: chưa vào ca → nút "Bắt đầu ca (Check-in)"; đang làm → "Vào ca lúc <giờ>" + nút "Kết thúc ca (Check-out)"; xong → "Đã hoàn thành ca hôm nay: x giờ · y đ".

## 3. Dữ liệu (Database)
| Bảng | Cột chính |
|---|---|
| `users` | `uid, username, email, password_hash, password_salt, role, name, phone, hourly_rate, is_active, store_id, last_login_at, rev, deleted_at` |
| `attendance` | `id, store_id, user_id, user_name, date, check_in, check_out, hours_worked, hourly_rate, daily_wage, status ('working'/'completed'), note` |

## 4. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Check-in hai lần trong ngày | Bản ghi mới **thay** bản cũ (mỗi người một bản ghi/ngày); ca thứ hai mất ca thứ nhất |
| Check-out khi chưa check-in | Không có bản ghi để cập nhật: không đổi gì |
| Ca qua nửa đêm | Bản ghi theo ngày check-in; check-out ngày sau vẫn tìm đúng id của ngày check-in chỉ khi chấm công trong cùng ngày (id theo ngày hiện tại) — ca qua đêm cần kiểm chứng |
| Quên check-out | Bản ghi ở trạng thái `working`, lương 0 |
| Đổi lương giờ sau check-in | Check-out dùng lương giờ **hiện tại** |
| Nhân viên bị vô hiệu hóa (`is_active = 0`) | Không đăng nhập được (F001) |

## 5. Giới hạn
- Chưa có bảng công tuần/tháng, xuất bảng lương (bảng công tuần ghi trong spec cũ không còn trong màn Báo cáo; dữ liệu chấm công vẫn lưu).
- Chưa cho Chủ sửa tay giờ vào/ra.
- Chưa có phân quyền chi tiết theo hành động (hủy hóa đơn, giảm giá...).
