# Danh mục đặc tả chức năng — MVP POS (SmartPOS)

Tài liệu tổng quan: [../FEATURES.md](../FEATURES.md). Mỗi file dưới đây đặc tả **một chức năng** theo mẫu: thông tin chung, mục tiêu, use case (tiền điều kiện, luồng chính, luồng thay thế/lỗi), quy tắc if/else, dữ liệu (bảng, cột, migration), trường hợp biên, giới hạn, kiểm thử.

Cập nhật: 2026-11-12. Đối chiếu với mã nguồn tại nhánh `change-ui`, `SCHEMA_VERSION = 22`.

## 1. Quy ước
- Mã chức năng `F001`…`F030`. F001–F017 là chức năng có từ trước (nguồn cũ: FEATURES.md mục 5.x), F018–F030 là chức năng bổ sung gần đây.
- Văn bản mô tả bằng tiếng Việt; tên bảng, cột, hàm, mã lỗi giữ nguyên tiếng Anh như trong mã nguồn.
- "Trạng thái" nói rõ mức hoàn thiện: **đã có test tự động** khác với **đã chạy thử trên thiết bị thật**. Phần lớn tính năng mới **chưa được chạy thử trên màn hình/điện thoại thật**.
- Mục "Giới hạn" và "Việc chờ quyết định" liệt kê điều chưa làm hoặc đang chờ chủ dự án.

## 2. Danh sách

| Mã | Chức năng | File |
|---|---|---|
| F001 | Xác thực, phân quyền, tạo cửa hàng | [F001-auth-store.md](F001-auth-store.md) |
| F002 | Quầy bán hàng (giỏ hàng, tính tiền, thanh toán) | [F002-pos-core.md](F002-pos-core.md) |
| F003 | Bán hàng F&B theo bàn (gộp, chuyển, tách/ghép, đặt bàn, sơ đồ) | [F003-fnb-tables.md](F003-fnb-tables.md) |
| F004 | Màn hình bếp (KDS) và báo bếp | [F004-kitchen-display.md](F004-kitchen-display.md) |
| F005 | Thực đơn: món, size, topping, công thức | [F005-menu-management.md](F005-menu-management.md) |
| F006 | Kho hàng: danh mục, lô, nhập/xuất | [F006-inventory.md](F006-inventory.md) |
| F007 | Khách hàng, điểm thành viên, công nợ | [F007-customers.md](F007-customers.md) |
| F008 | Nhân viên, tài khoản của tôi, chấm công | [F008-employees-attendance.md](F008-employees-attendance.md) |
| F009 | Lịch sử hóa đơn, in lại, hủy hóa đơn | [F009-order-history.md](F009-order-history.md) |
| F010 | Ca làm việc, đối soát tiền mặt | [F010-shifts.md](F010-shifts.md) |
| F011 | Dữ liệu mẫu khi tạo cửa hàng | [F011-sample-data.md](F011-sample-data.md) |
| F012 | Nhà cung cấp | [F012-suppliers.md](F012-suppliers.md) |
| F013 | Báo cáo doanh thu | [F013-revenue-report.md](F013-revenue-report.md) |
| F014 | Quản trị hệ thống (SysAdmin) | [F014-sysadmin.md](F014-sysadmin.md) |
| F015 | Sổ quỹ và dòng tiền | [F015-cashbook.md](F015-cashbook.md) |
| F016 | Tài khoản ngân hàng, QR VietQR | [F016-bank-qr.md](F016-bank-qr.md) |
| F017 | Báo cáo cuối ngày | [F017-end-of-day-report.md](F017-end-of-day-report.md) |
| F018 | Kiến trúc dữ liệu: máy chủ, domain/LAN, app native | [F018-data-architecture.md](F018-data-architecture.md) |
| F019 | Đồng bộ offline-first | [F019-sync.md](F019-sync.md) |
| F020 | Xử lý xung đột đồng bộ | [F020-sync-conflicts.md](F020-sync-conflicts.md) |
| F021 | Cấp số chứng từ, mã tạm offline | [F021-document-numbering.md](F021-document-numbering.md) |
| F022 | In ESC/POS (hóa đơn, tạm tính, phiếu bếp) | [F022-thermal-printing.md](F022-thermal-printing.md) |
| F023 | Trừ kho khi báo bếp, hoàn kho, kho âm, công tắc | [F023-stock-deduction.md](F023-stock-deduction.md) |
| F024 | Kiểm kho, lịch sử, kiểm kho theo ca | [F024-stocktake.md](F024-stocktake.md) |
| F025 | Xuất/nhập CSV kho | [F025-inventory-csv.md](F025-inventory-csv.md) |
| F026 | Ví điện tử, thanh toán kết hợp | [F026-ewallet-payment.md](F026-ewallet-payment.md) |
| F027 | Giá vốn, lợi nhuận, hao hụt | [F027-costing-profit.md](F027-costing-profit.md) |
| F028 | Giảm giá theo món, kênh bán, công nợ | [F028-discounts-channels-debt.md](F028-discounts-channels-debt.md) |
| F029 | Quên mật khẩu qua email | [F029-forgot-password.md](F029-forgot-password.md) |
| F030 | Nhóm tùy chọn của món (đường, đá, ghi chú nhanh), nhấp đúp mở thực đơn | [F030-option-groups.md](F030-option-groups.md) |

## 3. Bản đồ phụ thuộc chính
```
F018 máy chủ ─┬─ F019 đồng bộ ── F020 xung đột
              ├─ F021 cấp số ── (F002, F006, F015, F023, F024)
              └─ F029 quên mật khẩu
F002 bán hàng ─ F003 bàn ─ F004 bếp ─ F023 trừ kho ─ F006 kho ─ F024 kiểm kho ─ F025 CSV
F002 ─ F026 thanh toán ─ F015 sổ quỹ ─ F017 báo cáo cuối ngày
F005 công thức ─ F027 giá vốn ─ F013/F017 lợi nhuận ─ F028 kênh bán
F005 món ─ F030 nhóm tùy chọn ─ (F002 giỏ, F004 bếp, F022 in, F019 đồng bộ)
```

## 4. Việc chờ chủ dự án quyết định (tổng hợp)
1. Hoa hồng kênh bán: chi phí bán hàng riêng (đang dùng) hay tính vào giá vốn; cơ sở tính có VAT hay không (F027, F028).
2. Danh sách kênh bán mặc định; giảm giá theo %; ai được duyệt giảm giá (F028).
3. Công nợ: có làm "ghi nợ"/"thu nợ" tự động không (F028).
4. Quên mật khẩu: nhà cung cấp SMTP, nội dung thư, có bắt buộc email cho mọi nhân viên (F029).
5. Cho nhân viên `staff` mở/đóng ca để kiểm kho gắn ca (F010, F024).
6. Báo cáo theo chi nhánh (để sau).
7. Nhóm bảo mật D (hoãn): token API trong gói web, tài khoản sysadmin cứng, bí mật/dữ liệu trong git, mã chết, dọn `sync_log`, triển khai VPS.

## 5. Phát hiện khi viết đặc tả (cần xem xét, chưa sửa mã)
- F006: *Hủy bỏ lô* xóa lô mà không lập phiếu kho, nên lượng mất không vào hao hụt.
- F007: `total_spent`, `visit_count` có cột nhưng không được cập nhật khi thanh toán.
- F008: chấm công mỗi người một bản ghi/ngày; check-in lần hai thay bản ghi cũ.
- F011: `seedStore` nuốt lỗi và trả `false`; id mẫu cố định, cần kiểm tra khi nhiều cửa hàng cùng một CSDL.
- F013: doanh thu theo món trong bảng bán chạy là ước lượng (số lượng × giá hiện tại).
- F014: nút *Xóa toàn bộ dữ liệu* xóa dữ liệu của mọi thiết bị khi dùng máy chủ dùng chung.
- F028: `parseSalesChannels` trả danh sách rỗng khi JSON hỏng (không báo lỗi).
