# 📋 TÀI LIỆU TỔNG HỢP TÍNH NĂNG HỆ THỐNG MULTI-TENANT CLOUD POS

Chào mừng bạn đến với **Hệ thống Quản lý Bán hàng đa chi nhánh & đa mô hình (Multi-Tenant Cloud POS)**. Đây là một ứng dụng full-stack hoàn chỉnh được tối ưu hóa cho cả hai mô hình kinh doanh phổ biến nhất hiện nay: **F&B (Nhà hàng, Quán ăn, Cà phê)** và **Retail (Bán lẻ, Tạp hóa, Siêu thị mini)**.

Dưới đây là bảng tổng hợp chi tiết toàn bộ các tính năng, phân hệ nghiệp vụ và công nghệ được tích hợp trong hệ thống:

---

## 🚀 1. Tổng Quan Kiến Trúc Hệ Thống (Architecture)
- **Multi-Tenant (Đa cửa hàng/Đa chi nhánh):** Hệ thống phân tách dữ liệu hoàn toàn độc lập giữa các tài khoản Store ID khác nhau. Mỗi cửa hàng sở hữu không gian dữ liệu riêng về sản phẩm, kho hàng, nhân sự, hóa đơn và sơ đồ bàn.
- **Tích hợp Cloud Firestore Real-time:** Toàn bộ dữ liệu được đồng bộ hóa tức thời (Real-time synchronization) qua Firebase Firestore.
- **Offline Fallback Caching:** Tích hợp bộ nhớ đệm `localStorage` tự động lưu trữ trạng thái hoạt động cục bộ. Khi kết nối mạng không ổn định, hệ thống vẫn hiển thị dữ liệu đã lưu để đảm bảo hoạt động bán hàng không bị gián đoạn.
- **Phân quyền người dùng chặt chẽ (RBAC):**
  - **SysAdmin (Quản trị hệ thống):** Giám sát toàn bộ các store trên hệ thống, theo dõi tổng doanh thu toàn sàn, số lượng user và lịch sử hoạt động toàn cục.
  - **Owner (Chủ cửa hàng):** Toàn quyền thiết lập menu, kho hàng, cấu hình sơ đồ bàn, quản lý nhân viên và xem báo cáo tài chính.
  - **Manager (Quản lý cửa hàng):** Quản lý kho, điều phối nhân viên, chấm công và kiểm tra hóa đơn bán lẻ.
  - **Staff (Nhân viên bán hàng/Thu ngân):** Thao tác bán hàng, in hóa đơn, chấm công Check-in/Check-out cá nhân.

---

## 🛍️ 2. Phân Hệ Quầy Bán Hàng (POS Screen)
Hệ thống tự động thay đổi giao diện và luồng nghiệp vụ dựa trên loại hình cửa hàng:

### 🍔 Chế độ F&B (Nhà hàng & Cà phê):
- **Bàn làm việc & Sơ đồ phục vụ:** Chọn trực tiếp bàn ăn đang phục vụ qua sơ đồ mặt bằng tích hợp ngay tại quầy POS.
- **Chuyển trạng thái bàn tự động:** Khi bàn được gọi món, trạng thái bàn tự động chuyển sang `Đang phục vụ` (🔴 màu đỏ). Khi thanh toán xong, bàn quay về trạng thái `Trống` (🟢 màu xanh).
- **Gửi bếp (Kitchen Command):** Chuyển trực tiếp các món ăn cần chế biến xuống hệ thống màn hình bếp (KDS) kèm theo số lượng, tên bàn và ghi chú gọi món đặc biệt.
- **Ghi chú món ăn chi tiết:** Hỗ trợ nhập ghi chú riêng cho từng món ăn trong giỏ hàng (ví dụ: *Không hành*, *Ít đá*, *Chín kỹ*).

### 🛍️ Chế độ Retail (Bán lẻ & Tạp hóa):
- **Mã vạch & SKU Search:** Hỗ trợ tìm kiếm nhanh bằng SKU, tích hợp tính năng giả lập quét mã vạch (Barcode/QR Scanner) để thêm nhanh sản phẩm vào giỏ hàng.
- **Bán hàng theo Lô hàng (Inventory Batches):** Tự động chọn hoặc cho phép lựa chọn thủ công lô hàng cụ thể để xuất kho, giúp kiểm soát tốt hạn sử dụng (FEFO/FIFO).

### 💳 Tính năng Thanh toán & Tiện ích chung:
- **Tích hợp Khách hàng thành viên:** Chọn khách hàng từ danh sách thành viên hoặc đăng ký nhanh khách hàng mới ngay tại quầy thanh toán.
- **Hệ thống Tích điểm & Đổi thưởng:** Tự động tính toán điểm tích lũy được cộng thêm dựa trên giá trị đơn hàng (mặc định tích 1% giá trị hóa đơn). Hiển thị số điểm hiện có của khách để áp dụng khấu trừ nếu cần.
- **Bàn phím chạm số nhanh (Cash Touchpad):** Hỗ trợ thu ngân chạm nhanh các mệnh giá tiền mặt phổ biến (50k, 100k, 200k, 500k, v.v.) và tự động tính toán chính xác tiền thối lại cho khách.
- **Phương thức thanh toán đa dạng:** Hỗ trợ các phương thức **Tiền mặt (Cash)**, **Quẹt thẻ (Card)** và **Chuyển khoản QR Code (QR Code)**.
- **In Hóa đơn nhiệt (Thermal Receipt Printing):** Xuất hóa đơn theo chuẩn hóa đơn nhiệt 80mm cực kỳ trực quan, chuyên nghiệp, bao gồm đầy đủ thông tin cửa hàng, số hóa đơn, danh sách chi tiết sản phẩm, điểm tích lũy, thông tin thuế, tiền khách đưa và tiền thối lại.
- **Hiệu ứng âm thanh:** Phát âm thanh "Beep" phản hồi tương tác thành công khi thêm hàng hoặc quét mã.

---

## 🍳 3. Màn Kinh Bếp Chế Biến (Kitchen Display System - KDS)
Phân hệ chuyên dụng dành cho đầu bếp và nhân viên pha chế để tối ưu hóa quy trình điều phối món ăn:
- **Luồng trạng thái chế biến thời gian thực:**
  - `Pending` (Chờ chế biến) ➡️ `Preparing` (Đang chế biến) ➡️ `Completed` (Đã chế biến xong/Chờ cung ứng) ➡️ `Served` (Đã phục vụ lên bàn).
- **Phân nhóm theo bàn ăn:** Gom nhóm trực quan các món ăn theo số bàn để đầu bếp dễ dàng chế biến cùng lúc.
- **Giao diện thẻ (Card-based Layout):** Hiển thị rõ ràng tên món, số lượng, thời gian gọi món (thời gian chờ tính theo phút), và các ghi chú đi kèm của khách hàng.
- **Âm thanh thông báo:** Phát âm thanh cảnh báo khi có món mới được gửi xuống từ quầy POS.
- **Hỗ trợ thao tác hàng loạt:** Nút hoàn thành nhanh toàn bộ món của một bàn hoặc xóa các món đã phục vụ để giữ màn hình gọn gàng.

---

## 🪑 4. Quản Lý Sơ Đồ Phòng Bàn (Table Setup/Layout)
Công cụ thiết kế trực quan giúp chủ cửa hàng F&B tự bài trí không gian:
- **Quản lý Khu vực (Zones):** Cho phép thêm mới, chỉnh sửa, xóa các tầng, các khu vực (Ví dụ: *Tầng 1*, *Tầng 2*, *Ngoài trời*, *Phòng VIP*).
- **Thiết kế Sơ đồ kéo thả (Interactive Table Map):**
  - Tạo bàn ăn với tên bàn và sức chứa tối đa.
  - Sắp xếp vị trí bàn trực quan bằng cách kéo thả trực tiếp trên bản đồ số.
  - Thay đổi kích thước (chiều rộng, chiều cao) của từng bàn ăn để mô phỏng chính xác kích thước thực tế trong nhà hàng.
- **Cập nhật Real-time:** Mọi thay đổi về vị trí bàn ăn được đồng bộ hóa ngay lập tức lên cloud để nhân viên bán hàng thấy sơ đồ chuẩn xác nhất.

---

## 📦 5. Quản Lý Kho Hàng & Lô Hàng (Inventory Screen)
Quản lý chuỗi cung ứng chặt chẽ, tối ưu cho cửa hàng bán lẻ kiểm soát hạn sử dụng sản phẩm:
- **Quản lý theo Lô sản phẩm (Batches):** Mỗi sản phẩm có thể nhập thành nhiều lô khác nhau, mỗi lô lưu vết: Mã lô, Số lượng ban đầu, Số lượng tồn hiện tại, Giá nhập kho, Ngày sản xuất, Hạn sử dụng.
- **Phiếu Xuất - Nhập - Điều chỉnh kho (Transactions):**
  - **Nhập kho (Import):** Nhập hàng từ các Nhà cung cấp (Suppliers), tự động tạo lô mới, ghi nhận giá nhập và công nợ/chi phí.
  - **Xuất kho (Export):** Xuất hủy, xuất dùng nội bộ hoặc xuất bán.
  - **Điều chỉnh (Adjustment):** Cân đối kho khi có hao hụt, mất mát hoặc hư hỏng hàng hóa thực tế.
- **Cảnh báo thông minh (Smart Inventory Alerts):**
  - **Cảnh báo sắp hết hàng:** Danh sách sản phẩm có tồn kho dưới ngưỡng an toàn.
  - **Cảnh báo cận hạn sử dụng:** Tự động phát hiện và cảnh báo các lô hàng sắp hết hạn sử dụng trong vòng 30 ngày để cửa hàng có kế hoạch khuyến mãi thanh lý.
- **Quản lý Nhà cung cấp (Suppliers):** Danh bạ nhà cung cấp, lưu giữ thông tin liên hệ (Tên, SĐT, Email, Địa chỉ) để phục vụ cho các đợt nhập hàng.

---

## 👥 6. Quản Lý Nhân Viên & Chấm Công (Employees & Attendance)
- **Quản lý Danh sách nhân viên:** Lưu trữ thông tin tài khoản, email, chức vụ/vai trò (Owner, Manager, Staff) và mức lương theo giờ (đ/giờ) được cấu hình riêng cho từng người.
- **Hệ thống chấm công nhanh (Attendance Station):**
  - **Check-in:** Ghi nhận thời gian bắt đầu ca làm việc của nhân viên.
  - **Check-out:** Ghi nhận thời gian kết thúc ca làm việc.
- **Tự động tính lương ca trực:** Hệ thống tự động tính toán thời gian làm việc thực tế (giờ, phút) và nhân với mức lương cơ bản để ra số lương cần chi trả cho ca làm việc đó ngay lập tức.
- **Lịch sử bảng công chi tiết:** Xem lại lịch sử các ca trực của từng nhân sự kèm tổng số giờ làm và tổng lương tích lũy theo tháng.

---

## 📊 7. Báo Cáo Doanh Thu & Chỉ Số (Reports Section)
Phân tích dữ liệu kinh doanh trực quan giúp người quản lý đưa ra quyết định chính xác:
- **Biểu đồ doanh thu động (Dynamic Charts):** Tích hợp biểu đồ trực quan (sử dụng Recharts/D3) biểu diễn xu hướng doanh thu bán hàng trong ngày hoặc theo chu kỳ.
- **Hộp chỉ số tài chính cốt lõi (KPI Widgets):**
  - **Tổng doanh thu:** Tổng tiền thực thu từ các hóa đơn.
  - **Giá vốn & Lợi nhuận:** Tính toán tự động lợi nhuận gộp dựa trên giá bán và giá nhập thực tế của từng sản phẩm trong đơn hàng.
  - **Tỷ suất lợi nhuận gộp:** Đánh giá hiệu quả biên lợi nhuận của cửa hàng.
  - **Giá trị đơn trung bình (AOV):** Đo lường sức mua trung bình trên mỗi lượt khách.
- **Phân tích cơ cấu thanh toán:** Biểu đồ cơ cấu phương thức thanh toán (Tiền mặt vs Thẻ vs QR Code) giúp nắm bắt thói quen chi tiêu của khách hàng.
- **Lịch sử hoạt động chi tiết (Operation Logs):** Lưu vết toàn bộ lịch sử thao tác của các tài khoản (ví dụ: *Ai đã thanh toán đơn hàng*, *Ai đã cập nhật menu*, *Ai đã điều chỉnh kho*) giúp minh bạch hóa mọi hoạt động của cửa hàng.

---

## 🛡️ 8. Giao Diện Quản Trị Hệ Thống (SysAdmin Dashboard)
Màn hình tối cao dành cho nhà điều hành toàn bộ nền tảng Multi-Tenant Cloud POS:
- **Báo cáo tổng hợp toàn sàn:** Theo dõi biểu đồ tổng doanh thu gộp của tất cả các store đang chạy trên hệ thống.
- **Giám sát mạng lưới Store:** Danh sách toàn bộ các cửa hàng đăng ký trên hệ thống kèm theo thông tin phân loại (F&B / Retail), địa chỉ, số lượng nhân viên hoạt động và tổng doanh thu đóng góp.
- **Nhật ký hệ thống tập trung (Centralized Activity Logs):** Theo dõi mọi giao dịch và thay đổi cấu hình trên toàn bộ hệ thống thời gian thực để hỗ trợ kỹ thuật nhanh chóng khi có sự cố.

---

## 🎨 9. Trải Nghiệm Người Dùng & Thiết Kế Mỹ Thuật
Hệ thống được phát triển theo tiêu chuẩn thẩm mỹ cao, hoàn toàn loại bỏ các lỗi thiết kế phổ biến:
- **Chủ đề Sáng sang trọng (Sophisticated Light Scheme):** Tone nền màu trắng ấm nhã nhặn, phối hợp hài hòa với màu xanh lục bảo (Emerald) đại diện cho tài lộc/kho hàng và màu hổ phách (Amber) ấm áp cho F&B.
- **Typography hoàn hảo:** Font chữ có phân cấp kích thước rõ ràng, dòng chữ nhãn nút ngồi gọn trên một dòng và tự động điều chỉnh khoảng đệm (padding) cân xứng.
- **Bố cục trực quan (Bento Grid / Single View):** Bố trí bảng điều khiển 3 cột cực kỳ hợp lý giúp thu ngân có thể thực hiện mọi thao tác gọi món, chọn bàn, tích điểm và bấm tính tiền trên cùng một màn hình mà không cần chuyển trang.
- **Hiệu ứng chuyển động mượt mà (Animate Effects):** Tích hợp các hiệu ứng fade-in, trượt nhẹ khi chuyển màn hình hoặc đóng mở hộp thoại giúp giao diện sống động và chuyên nghiệp.

---

Tài liệu này tổng hợp đầy đủ và chính xác tất cả các tính năng thực tế đang hoạt động trong mã nguồn hệ thống. 
Chúc bạn có những trải nghiệm quản lý và bán hàng tuyệt vời nhất cùng **Multi-Tenant Cloud POS**!
