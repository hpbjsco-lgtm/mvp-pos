# F011 — Dữ liệu mẫu khi khởi tạo cửa hàng

| Trường | Nội dung |
|---|---|
| Mã chức năng | F011 |
| Trạng thái | Hoàn thiện |
| Actor | Hệ thống (khi Chủ đăng ký cửa hàng; khi Sysadmin tạo cửa hàng có chọn dữ liệu mẫu; khi mở tab Demo) |
| Mã nguồn | `src/db/seed.ts` (`seedStore`), gọi từ `src/db/auth.ts` (`registerOwner`, `ensureDemoStore`) và `src/db/admin.ts` |
| Liên quan | F001, F005, F006, F014 |

## 1. Mục tiêu
Cửa hàng mới có sẵn thực đơn/hàng hóa, kho, bàn, nhà cung cấp, khách và nhân viên để dùng thử ngay.

## 2. Use case
### UC-011-01 — Tạo dữ liệu mẫu
```
seedStore(storeId, storeType):
    if (cửa hàng đã có sản phẩm)  -> bỏ qua, trả true           # chạy lại không nhân đôi dữ liệu (isStoreSeeded)
    gom tất cả câu lệnh vào MỘT lô (runBatch = một transaction)
    thực thi; lỗi -> ghi log "[SEED] Lỗi tạo dữ liệu mẫu" và trả false
```
Hàm trả `false` khi lỗi nhưng người gọi (đăng ký cửa hàng) vẫn tiếp tục — cửa hàng được tạo mà không có dữ liệu mẫu (xem 5).

## 3. Nội dung dữ liệu mẫu
| Nhóm | F&B | Bán lẻ |
|---|---|---|
| Khách hàng | "Khách vãng lai mặc định" (`id = khach-vang-lai`, **không sửa/xóa được**) + 4 khách thành viên mẫu kèm điểm | như F&B |
| Nhân viên | 3 tài khoản: 1 Quản lý + 2 Nhân viên (`staff`). Mật khẩu mặc định **`123456`**. Tên tài khoản `quanly.<mã cửa hàng>`, `nhanvien1.<mã cửa hàng>`, `nhanvien2.<mã cửa hàng>`; email `<tên>@<mã cửa hàng>.local` | như F&B |
| Nhà cung cấp | 2: Công ty CP Sữa Việt Nam (Vinamilk), Nông trại Rau sạch Đà Lạt GAP | như F&B |
| Sản phẩm | Thực đơn mẫu (cà phê, trà đào, phở...) kèm size mẫu và **công thức nguyên liệu mẫu** cho món chế biến; topping mẫu | Hàng hóa bán lẻ mẫu |
| Kho | Mỗi nguyên liệu 1 lô: mã `LO-<sku>`, tồn 20, hạn từ +120 ngày (mỗi nguyên liệu thêm 15 ngày), nhập từ NCC `S1` | Mỗi hàng hóa 1 lô: `LO-<sku>`, tồn 50, hạn từ +180 ngày (+20 ngày mỗi hàng) |
| Sơ đồ | Khu vực và bàn mẫu | — |

## 4. Quy tắc
- Mã nhân viên mẫu chứa mã cửa hàng để không trùng giữa các cửa hàng.
- Mật khẩu mặc định của nhân viên mẫu là công khai: Chủ nên đổi hoặc vô hiệu hóa tài khoản mẫu trước khi dùng thật.
- **Cần kiểm tra (chưa xác minh):** sản phẩm, khu vực, bàn mẫu dùng id cố định (`p.id`, `t.id`, `z.id`, lô `B-<id>-01`) và khách mẫu dùng tiền tố mã cửa hàng. Khóa chính của các bảng là `id` toàn cục, nên khi một CSDL (máy chủ) chứa nhiều cửa hàng cùng tạo dữ liệu mẫu, id có thể trùng giữa các cửa hàng. Cần thử tạo hai cửa hàng liên tiếp trên cùng máy chủ trước khi triển khai nhiều cửa hàng.

## 5. Dữ liệu (Database)
Ghi vào: `customers, users, suppliers, products, inventory_batches`; riêng F&B thêm `zones, dining_tables`. `track_stock = 1` cho sản phẩm bán lẻ, `0` cho F&B (F&B quản lý tồn qua nguyên liệu).

## 6. Trường hợp biên / giới hạn
| Tình huống | Kết quả |
|---|---|
| Đăng ký xong nhưng seed lỗi | Cửa hàng rỗng, chỉ có log; người dùng phải tự nhập (chưa có thông báo). Đề xuất: báo lỗi rõ thay vì nuốt lỗi |
| Chạy seed hai lần | Lần hai bỏ qua |
| Sysadmin tạo cửa hàng không chọn dữ liệu mẫu | Cửa hàng rỗng, không gọi `seedStore` |
