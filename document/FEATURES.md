# TÀI LIỆU ĐẶC TẢ CHỨC NĂNG (FSD) — HỆ THỐNG POS ĐA MÔ HÌNH (F&B / BÁN LẺ)

## 0. Thông tin tài liệu

| Trường | Nội dung |
|---|---|
| Tên hệ thống | SmartPOS — Phần mềm quản lý bán hàng cho quán cà phê / nhà hàng / bán lẻ |
| Phiên bản tài liệu | 2.0 |
| Ngày cập nhật | 2026-08-13 |
| Loại tài liệu | Functional Specification Document (Đặc tả chức năng) |
| Trạng thái | Đang phát triển — các mục có cột "Trạng thái" bên dưới phản ánh mức độ hoàn thiện thực tế trong source code |

**Lịch sử thay đổi**

| Phiên bản | Ngày | Nội dung thay đổi |
|---|---|---|
| 1.0 | 2026-07-02 | Bản đặc tả đầu tiên, mô tả hệ thống trên nền Firebase/Firestore (đã lỗi thời) |
| 2.0 | 2026-08-13 | Viết lại toàn bộ theo cấu trúc BA chuẩn; cập nhật kiến trúc thực tế (SQLite local-first); bổ sung 6 chức năng mới: Đặt bàn trước, Tùy chọn món (size/đường/đá), Giảm giá & Thuế VAT, Lịch sử hóa đơn (hủy/in lại), Sổ quỹ ca làm việc, Dữ liệu mẫu demo |

---

## 1. Giới thiệu & Mục tiêu

SmartPOS là phần mềm quản lý bán hàng phục vụ đồng thời hai mô hình kinh doanh phổ biến tại Việt Nam:

- **F&B** (quán cà phê, nhà hàng, quán ăn): quản lý theo bàn, gọi món, bếp chế biến.
- **Bán lẻ** (tạp hóa, siêu thị mini): quản lý theo mã vạch, tồn kho theo lô hàng.

**Mục tiêu kinh doanh:**
1. Thu ngân thao tác nhanh, không phụ thuộc kết nối mạng (bán hàng không được phép gián đoạn vì mất mạng).
2. Chủ quán nắm được doanh thu, tồn kho, nhân sự theo thời gian thực trên cùng một thiết bị.
3. Dữ liệu không được mất khi tắt/mở lại ứng dụng (đây là lỗi nghiêm trọng của bản cũ, đã được khắc phục ở mục 3).

## 2. Phạm vi

**Trong phạm vi (đã triển khai hoặc đang triển khai):** các module liệt kê tại mục 5.

**Ngoài phạm vi ở phiên bản hiện tại (dự kiến các giai đoạn sau):**
- Đồng bộ dữ liệu hai chiều lên máy chủ Cloud thật (nền tảng kỹ thuật đã có sẵn — xem mục 3 — nhưng chưa kết nối tới một backend cụ thể).
- Đóng gói phát hành lên Google Play / Apple App Store.
- Quét mã vạch bằng camera thật (hiện dùng ô nhập tay mô phỏng).
- Tùy chọn/topping cho món ăn (hiện chỉ áp dụng size/đường/đá cho đồ uống).

## 3. Kiến trúc & Nền tảng dữ liệu

> Đây là phần **quan trọng nhất cần hiểu trước khi đọc các mục chức năng bên dưới**, vì nó thay đổi hoàn toàn cách hệ thống hoạt động so với bản đặc tả cũ.

- **Local-first:** Toàn bộ dữ liệu nghiệp vụ được lưu trong **1 file SQLite duy nhất trên thiết bị** (trình duyệt dùng sql.js + IndexedDB; ứng dụng cài đặt native dùng SQLite thật qua Capacitor). Ứng dụng hoạt động đầy đủ **không cần Internet**.
- **Đa cửa hàng trên cùng 1 thiết bị (multi-tenant cục bộ):** mọi bảng dữ liệu đều gắn cột `store_id` để phân tách dữ liệu giữa các cửa hàng.
- **Đăng nhập ngoại tuyến:** tài khoản và mật khẩu (băm PBKDF2-SHA256) lưu ngay trong SQLite, không phụ thuộc dịch vụ xác thực bên ngoài.
- **Đồng bộ Cloud (backup/khôi phục):** đã có sẵn giao thức đẩy/kéo dữ liệu (push/pull) và máy chủ mẫu, nhưng **chưa được kết nối/kích hoạt mặc định** — xem mục "Đồng bộ Cloud" trong bảng module (Trạng thái: *Nền tảng kỹ thuật đã có, chưa cấu hình sử dụng*).

## 4. Đối tượng người dùng (Actors)

| Vai trò | Mô tả | Phạm vi truy cập |
|---|---|---|
| **SysAdmin** | Quản trị viên vận hành toàn bộ nền tảng | Toàn bộ cửa hàng trên thiết bị, phê duyệt/khoá cửa hàng |
| **Owner** (Chủ cửa hàng) | Người tạo và sở hữu 1 cửa hàng | Toàn quyền trong phạm vi cửa hàng của mình |
| **Manager** (Quản lý) | Quản lý vận hành hằng ngày | Như Owner, trừ các thiết lập mang tính sở hữu |
| **Staff** (Nhân viên/Thu ngân) | Người bán hàng trực tiếp | Bán hàng, chấm công, sổ quỹ ca của bản thân; không truy cập Báo cáo, Nhân viên, Nhà cung cấp |

Quy tắc phân quyền chi tiết được nêu theo từng chức năng ở mục 5.

## 5. Danh sách chức năng

Mỗi chức năng được mô tả theo mẫu: **Mô tả** — **User story** — **Quy tắc nghiệp vụ** — **Trạng thái**.

Chú thích trạng thái: ✅ Hoàn thiện · 🟡 Hoàn thiện một phần · ⚪ Chưa triển khai (kế hoạch).

### 5.1. Xác thực & Quản lý cửa hàng

**Mô tả:** Đăng nhập ngoại tuyến, đăng ký cửa hàng mới, chế độ dùng thử (Demo Sandbox).

**User story:**
- Là *Owner mới*, tôi muốn tự đăng ký một cửa hàng và đăng nhập ngay trên thiết bị để có thể bán hàng mà không cần chờ duyệt qua mạng.
- Là *người dùng thử*, tôi muốn vào chế độ Demo với dữ liệu mẫu có sẵn (món ăn, khách hàng, sơ đồ bàn, kho, nhân viên, nhà cung cấp) để trải nghiệm toàn bộ hệ thống ngay lập tức.

**Quy tắc nghiệp vụ:**
- Mật khẩu không bao giờ lưu ở dạng thô; băm bằng PBKDF2-SHA256 (100.000 vòng lặp) kèm salt ngẫu nhiên.
- Mỗi cửa hàng đăng ký mới được cấp dữ liệu mẫu tự động (xem mục 5.11).
- Phiên đăng nhập được lưu cục bộ — mở lại ứng dụng không cần đăng nhập lại.

**Trạng thái:** ✅

---

### 5.2. Quầy bán hàng (POS)

**Mô tả:** Màn hình bán hàng trung tâm, tự chuyển giao diện theo mô hình cửa hàng (F&B / Bán lẻ).

**User story:**
- Là *Thu ngân*, tôi muốn chọn món/sản phẩm, điều chỉnh số lượng và ghi chú thật nhanh để phục vụ khách không phải chờ đợi.
- Là *Thu ngân quán cà phê*, tôi muốn chọn size, mức đường, mức đá cho từng ly nước ngay trên dòng giỏ hàng để pha chế đúng yêu cầu khách mà không cần gõ ghi chú tay.
- Là *Thu ngân*, tôi muốn nhập giảm giá và thuế VAT cho hóa đơn khi khách có yêu cầu hoặc theo chính sách cửa hàng.

**Quy tắc nghiệp vụ:**
- **Tùy chọn món (mới):** áp dụng cho sản phẩm thuộc danh mục "Đồ uống" trong cửa hàng F&B. Mặc định khi thêm vào giỏ: Size M, Đường 100%, Đá 100%; nhân viên chỉnh trực tiếp trên từng dòng. Hai dòng cùng sản phẩm nhưng khác tùy chọn/ghi chú được tính là hai dòng riêng biệt.
- **Giảm giá & Thuế VAT (mới):** công thức tính hóa đơn là `Tạm tính − Giảm giá = Số tiền chịu thuế`, `Số tiền chịu thuế × VAT% = Tiền thuế`, `Tổng cần thanh toán = Số tiền chịu thuế + Tiền thuế`. Giảm giá không được vượt quá Tạm tính. Điểm tích lũy được tính trên Tổng cần thanh toán sau cùng.
- Bán lẻ: hệ thống tự chọn lô hàng theo nguyên tắc FIFO/FEFO (lô hết hạn sớm nhất được xuất trước); chặn bán nếu sản phẩm hết lô tồn kho.
- F&B: chọn khách hàng và tích điểm loyalty ngay tại quầy; hỗ trợ thêm nhanh khách hàng mới.
- Hỗ trợ 3 phương thức thanh toán: Tiền mặt (có bàn phím chạm số nhanh + gợi ý mệnh giá), Chuyển khoản QR, Thẻ POS.
- Sau khi thanh toán: in hóa đơn nhiệt 80mm, trừ tồn kho (bán lẻ), cộng điểm khách hàng, cập nhật trạng thái bàn (F&B).

**Trạng thái:** ✅ (Tùy chọn món và Giảm giá/VAT: ✅ mới bổ sung)

---

### 5.3. Sơ đồ bàn & Đặt bàn trước (F&B)

**Mô tả:** Thiết kế sơ đồ mặt bằng kéo-thả theo khu vực, quản lý trạng thái bàn, và đặt bàn trước cho khách.

**User story:**
- Là *Owner*, tôi muốn tự thiết kế sơ đồ bàn theo đúng mặt bằng thực tế của quán.
- Là *Thu ngân*, tôi muốn ghi nhận thông tin khách đã đặt bàn trước (tên, SĐT, giờ hẹn) để không bị nhầm lẫn khi khách khác đến ngồi nhầm bàn.
- Là *Thu ngân*, khi bắt đầu gọi món cho một bàn đã có người đặt trước, tôi muốn được nhắc xác nhận thông tin khách trước khi tiếp tục, để tránh phục vụ nhầm bàn đã có chủ.

**Quy tắc nghiệp vụ:**
- Khu vực (Zone) và Bàn ăn (Table) có thể thêm/xóa/kéo-thả định vị lại (chỉ Owner/Manager, ở "Chế độ Thiết kế").
- **Đặt bàn trước (mới):** thông tin đặt bàn (tên khách, SĐT, giờ hẹn, ghi chú) độc lập với trạng thái Trống/Đang phục vụ — một bàn có thể vừa "Trống" vừa "Đã đặt trước".
- Khi nhân viên thêm món **đầu tiên** vào đơn của một bàn đang có đặt trước, hệ thống hiển thị hộp thoại xác nhận: *"Bàn này đã được đặt trước, hãy xác nhận thông tin khách"* kèm tên/SĐT/giờ hẹn. Nhân viên xác nhận (Yes) để tiếp tục, hoặc hủy để không thêm món.
- Trạng thái bàn Trống ⇄ Đang phục vụ được cập nhật tự động khi gửi bếp / thanh toán xong.

**Trạng thái:** ✅ (Đặt bàn trước: ✅ mới bổ sung)

---

### 5.4. Màn hình bếp (KDS — Kitchen Display System)

**Mô tả:** Điều phối món ăn/đồ uống giữa quầy order và khu chế biến.

**User story:**
- Là *Nhân viên pha chế/bếp*, tôi muốn thấy ngay món mới được gửi xuống kèm đầy đủ yêu cầu (số bàn, size, đường, đá, ghi chú) để pha chế đúng ngay từ đầu, không phải hỏi lại thu ngân.

**Quy tắc nghiệp vụ:**
- Luồng trạng thái: `Chờ chế biến → Đang chế biến → Chờ bưng → Đã phục vụ`.
- **Hiển thị tùy chọn món (mới):** mỗi thẻ món hiển thị badge Size/Đường/Đá nếu có.
- Cảnh báo trực quan khi món chờ chế biến quá 10 phút.
- Cho phép dọn hàng loạt các món đã "Đã phục vụ" để màn hình luôn gọn.

**Trạng thái:** ✅

---

### 5.5. Quản lý Thực đơn / Sản phẩm

**Mô tả:** Khai báo món ăn, đồ uống (F&B) hoặc hàng hóa (Bán lẻ): tên, giá bán, giá vốn, danh mục, SKU.

**User story:**
- Là *Owner*, tôi muốn thêm/sửa món và bật-tắt trạng thái "còn hàng" để đồng bộ ngay xuống quầy bán, tránh nhận order món đã hết.

**Quy tắc nghiệp vụ:**
- Mỗi sản phẩm thuộc 1 trong 3 danh mục hiển thị: Đồ uống, Món ăn, Khác (áp dụng logic tùy chọn size/đường/đá cho danh mục Đồ uống — xem mục 5.2).
- Mã SKU tự sinh nếu bỏ trống.

**Trạng thái:** ✅

---

### 5.6. Quản lý Kho hàng

**Mô tả:** Quản lý theo lô hàng (batch) phục vụ nguyên tắc FIFO/FEFO, phiếu nhập/xuất/điều chỉnh kho.

**User story:**
- Là *Quản lý kho*, tôi muốn khai báo lô hàng kèm hạn sử dụng để hệ thống tự cảnh báo hàng cận hạn và ưu tiên xuất bán trước.

**Quy tắc nghiệp vụ:**
- Mỗi lô lưu: mã lô, số lượng ban đầu/hiện tại, giá nhập, ngày sản xuất, hạn sử dụng, nhà cung cấp.
- Cảnh báo 2 mức: **Hết hạn** (đã qua hạn) và **Cận hạn** (còn ≤ 90 ngày).
- Xuất kho tự động theo lô hết hạn sớm nhất còn hàng (FEFO).
- Khi một hóa đơn bán lẻ bị **hủy** (xem mục 5.9), số lượng đã trừ của lô hàng liên quan được **hoàn lại tự động**.

**Trạng thái:** ✅

---

### 5.7. Quản lý Khách hàng & Tích điểm thành viên

**Mô tả:** Hồ sơ khách hàng thân thiết, tích điểm tự động theo giá trị chi tiêu.

**User story:**
- Là *Owner*, tôi muốn khách hàng tự động được xếp hạng (Đồng/Bạc/Vàng/Kim Cương) theo điểm tích lũy để có chính sách chăm sóc phù hợp.

**Quy tắc nghiệp vụ:**
- Cứ 10.000đ chi tiêu (sau giảm giá, sau thuế) = 1 điểm tích lũy.
- Khách hàng thêm nhanh ngay tại quầy POS được ghi vào cùng danh sách khách hàng chung của cửa hàng (không còn là danh sách tách biệt như bản lỗi trước đây).
- Khách vãng lai mặc định (`khach-vang-lai`) không thể sửa/xóa.
- Khi hủy hóa đơn có tích điểm, điểm đã cộng được **trừ lại tự động** (xem mục 5.9).

**Trạng thái:** ✅

---

### 5.8. Quản lý Nhân viên & Chấm công

**Mô tả:** Danh sách nhân viên, mức lương theo giờ, trạm chấm công Check-in/Check-out, bảng công tuần.

**User story:**
- Là *Nhân viên*, tôi muốn Check-in/Check-out ngay trên hệ thống để lương ca của mình được tính tự động, chính xác.

**Quy tắc nghiệp vụ:**
- Lương ca = Số giờ làm thực tế × Mức lương giờ tại thời điểm chấm công.
- Chỉ Owner/Manager được sửa vai trò và mức lương của nhân viên.

**Trạng thái:** ✅

---

### 5.9. Lịch sử hóa đơn (mới)

**Mô tả:** Tra cứu lại toàn bộ hóa đơn đã lập, in lại hóa đơn, hủy hóa đơn nhập sai.

**User story:**
- Là *Thu ngân*, tôi muốn tìm lại một hóa đơn cũ theo số hóa đơn/tên khách để in lại khi khách cần.
- Là *Quản lý*, tôi muốn hủy một hóa đơn nhập sai và hệ thống tự động hoàn tồn kho + trừ lại điểm đã cộng, để sổ sách luôn khớp thực tế.

**Quy tắc nghiệp vụ:**
- Tìm kiếm theo: số hóa đơn, tên khách hàng, tên thu ngân, số bàn; lọc theo trạng thái (Hoàn tất / Đã hủy).
- **Quyền hủy hóa đơn chỉ dành cho Owner/Manager**, không cấp cho Staff.
- Khi hủy: (1) đơn chuyển trạng thái *Đã hủy*, (2) nếu là đơn bán lẻ có lô hàng liên kết → hoàn số lượng vào đúng lô, (3) nếu khách hàng đã được cộng điểm → trừ lại đúng số điểm đó (không âm).
- Hóa đơn đã hủy vẫn hiển thị trong danh sách (làm mờ) để phục vụ đối soát, không bị xóa khỏi hệ thống.

**Trạng thái:** ✅ mới bổ sung

---

### 5.10. Sổ quỹ ca làm việc (mới)

**Mô tả:** Mở ca (ghi nhận tiền quỹ đầu ca) và đóng ca (đối soát tiền mặt thực tế so với hệ thống) cho từng nhân viên thu ngân.

**User story:**
- Là *Thu ngân*, tôi muốn mở ca với số tiền quỹ đầu ca rõ ràng, để cuối ca biết chính xác mình cần nộp lại bao nhiêu tiền mặt.
- Là *Quản lý*, tôi muốn xem lịch sử các ca đã đóng kèm chênh lệch thực tế/hệ thống để phát hiện thất thoát tiền mặt kịp thời.

**Quy tắc nghiệp vụ:**
- Mỗi nhân viên chỉ có thể có **1 ca đang mở** tại một thời điểm.
- Trong lúc ca đang mở, hệ thống tự tính theo thời gian thực: doanh thu tiền mặt, doanh thu thẻ/QR, số hóa đơn — chỉ tính hóa đơn **còn hiệu lực** (không tính hóa đơn đã hủy) phát sinh **sau thời điểm mở ca** của đúng nhân viên đó.
- Công thức đối soát: `Tiền mặt kỳ vọng = Tiền quỹ đầu ca + Doanh thu tiền mặt trong ca`.
- Khi đóng ca: nhân viên nhập số tiền mặt đếm được thực tế; hệ thống hiển thị chênh lệch (dương/âm) trước khi xác nhận.
- Lịch sử tối đa 20 ca gần nhất được hiển thị để đối chiếu nhanh.

**Trạng thái:** ✅ mới bổ sung

---

### 5.11. Dữ liệu mẫu khi khởi tạo cửa hàng (mới)

**Mô tả:** Mỗi cửa hàng mới (kể cả chế độ Demo Sandbox) được cấp sẵn một bộ dữ liệu mẫu để dùng thử ngay, không phải nhập tay từ đầu.

**Quy tắc nghiệp vụ:** dữ liệu mẫu bao gồm:
- Thực đơn/hàng hóa mẫu theo đúng mô hình (F&B hoặc Bán lẻ).
- Sơ đồ khu vực + bàn ăn mẫu (F&B).
- Lô hàng tồn kho ban đầu.
- 2 nhà cung cấp mẫu.
- **4 khách hàng thành viên mẫu** kèm điểm tích lũy (mới bổ sung).
- **3 tài khoản nhân viên mẫu** — 1 Quản lý + 2 Nhân viên, mật khẩu mặc định `123456` (mới bổ sung).

**Trạng thái:** ✅ mới bổ sung

---

### 5.12. Quản lý Nhà cung cấp

**Mô tả:** Danh bạ nhà cung cấp phục vụ nghiệp vụ nhập kho.

**Trạng thái:** ✅

---

### 5.13. Báo cáo doanh thu & Chỉ số kinh doanh

**Mô tả:** Biểu đồ doanh thu, KPI (doanh thu, số đơn, giá trị đơn trung bình), xếp hạng sản phẩm bán chạy/bán chậm.

**User story:**
- Là *Owner*, tôi muốn xem nhanh doanh thu hôm nay/tháng này/năm nay và biết món nào đang bán chạy để điều chỉnh nhập hàng.

**Trạng thái:** 🟡 — số liệu KPI chính xác theo dữ liệu thật; biểu đồ xu hướng theo ngày/tháng hiện đang dùng hệ số minh họa, chưa tổng hợp 100% từ dữ liệu lịch sử thật.

---

### 5.14. Quản trị hệ thống (SysAdmin)

**Mô tả:** Giám sát toàn bộ cửa hàng trên thiết bị, phê duyệt/từ chối kích hoạt cửa hàng, xem danh sách tài khoản theo từng cửa hàng.

**Trạng thái:** ✅ (phạm vi dữ liệu hiện giới hạn trong các cửa hàng có trên cùng thiết bị; sẽ mở rộng toàn hệ thống khi hoàn thiện Đồng bộ Cloud)

---

### 5.15. Đồng bộ Cloud (Backup/Khôi phục)

**Mô tả:** Đẩy (push) và kéo (pull) dữ liệu SQLite lên/xuống máy chủ để sao lưu và đồng bộ giữa nhiều thiết bị.

**Trạng thái:** ⚪ Nền tảng kỹ thuật (giao thức, mã hóa, xử lý xung đột theo `rev`/`updated_at`) đã được xây dựng sẵn, nhưng **chưa kết nối tới một máy chủ cụ thể và chưa bật cho người dùng cuối** — sẽ triển khai ở giai đoạn kế tiếp.

## 6. Yêu cầu phi chức năng

| Hạng mục | Yêu cầu |
|---|---|
| Khả dụng ngoại tuyến | Toàn bộ nghiệp vụ bán hàng phải hoạt động 100% không cần Internet |
| Toàn vẹn dữ liệu | Không mất dữ liệu khi tắt/mở lại ứng dụng hoặc mất điện đột ngột |
| Bảo mật | Mật khẩu băm PBKDF2-SHA256; không lưu mật khẩu thô dưới mọi hình thức |
| Đa nền tảng | Chạy trên trình duyệt (Web) và ứng dụng di động đóng gói (Android/iOS qua Capacitor) |
| Đa cửa hàng | Hỗ trợ nhiều cửa hàng độc lập dữ liệu trên cùng một thiết bị |
| Ngôn ngữ | Giao diện và toàn bộ nội dung hiển thị bằng tiếng Việt |

## 7. Thuật ngữ (Glossary)

| Thuật ngữ | Giải thích |
|---|---|
| FIFO/FEFO | Nguyên tắc xuất kho "nhập trước xuất trước" / "hết hạn trước xuất trước" |
| Local-first | Kiến trúc ứng dụng ưu tiên lưu và xử lý dữ liệu ngay trên thiết bị, không phụ thuộc máy chủ |
| SKU | Mã định danh sản phẩm dùng để tra cứu/quét mã vạch |
| Lô hàng (Batch) | Một đợt nhập kho của cùng 1 sản phẩm, có hạn sử dụng và giá nhập riêng |
| Ca làm việc (Shift) | Khoảng thời gian một nhân viên thu ngân mở quỹ tiền mặt cho đến khi đóng ca đối soát |
| KDS | Kitchen Display System — màn hình điều phối bếp/pha chế |
