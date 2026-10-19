# TÀI LIỆU ĐẶC TẢ CHỨC NĂNG (FSD) — HỆ THỐNG POS ĐA MÔ HÌNH (F&B / BÁN LẺ)

## 0. Thông tin tài liệu

| Trường | Nội dung |
|---|---|
| Tên hệ thống | SmartPOS — Phần mềm quản lý bán hàng cho quán cà phê / nhà hàng / bán lẻ |
| Phiên bản tài liệu | 3.1 |
| Ngày cập nhật | 2026-10-19 |
| Loại tài liệu | Functional Specification Document (Đặc tả chức năng) |
| Trạng thái | Đang phát triển — các mục có cột "Trạng thái" bên dưới phản ánh mức độ hoàn thiện thực tế trong source code |

**Lịch sử thay đổi**

| Phiên bản | Ngày | Nội dung thay đổi |
|---|---|---|
| 1.0 | 2026-07-02 | Bản đặc tả đầu tiên, mô tả hệ thống trên nền Firebase/Firestore (đã lỗi thời) |
| 2.0 | 2026-08-13 | Viết lại toàn bộ theo cấu trúc BA chuẩn; cập nhật kiến trúc thực tế (SQLite local-first); bổ sung 6 chức năng mới: Đặt bàn trước, Tùy chọn món (size/đường/đá), Giảm giá & Thuế VAT, Lịch sử hóa đơn (hủy/in lại), Sổ quỹ ca làm việc, Dữ liệu mẫu demo |
| 3.1 | 2026-10-19 | Màu chủ đạo cam đất; icon bàn SVG cục bộ; tải ảnh món lên từ thiết bị; kiểu "tối giản bỏ icon" đã hoàn tác (mục 9) |
| 3.0 | 2026-10-11 | Làm lại giao diện bán hàng F&B (danh sách bàn, gộp bàn, chuyển bàn, tách/ghép đơn, luồng điện thoại); phân quyền 5 vai trò (Sysadmin cứng / Chủ / Quản lý / Phục vụ-Thu ngân / Bếp); tab Demo được giữ lại; đăng nhập bằng tên tài khoản; ngắt kết nối Cloud, chỉ dùng SQLite; thêm tạo tài khoản nhân viên. Xem mục 8 để biết hiện trạng mã nguồn |

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
- Đồng bộ dữ liệu lên Cloud / Firebase (**đã ngắt khỏi ứng dụng**, sẽ làm lại ở giai đoạn sau — xem mục 5.15 và mục 8).
- Đóng gói phát hành lên Google Play / Apple App Store.
- Quét mã vạch bằng camera thật (hiện dùng ô nhập tay mô phỏng).
- Tùy chọn/topping cho món ăn (hiện chỉ áp dụng size/đường/đá cho đồ uống).

## 3. Kiến trúc & Nền tảng dữ liệu

> Đây là phần **quan trọng nhất cần hiểu trước khi đọc các mục chức năng bên dưới**, vì nó thay đổi hoàn toàn cách hệ thống hoạt động so với bản đặc tả cũ.

- **Local-first:** Toàn bộ dữ liệu nghiệp vụ được lưu trong **1 file SQLite duy nhất trên thiết bị** (trình duyệt dùng sql.js + IndexedDB; ứng dụng cài đặt native dùng SQLite thật qua Capacitor). Ứng dụng hoạt động đầy đủ **không cần Internet**.
- **Đa cửa hàng trên cùng 1 thiết bị (multi-tenant cục bộ):** mọi bảng dữ liệu đều gắn cột `store_id` để phân tách dữ liệu giữa các cửa hàng.
- **Đăng nhập ngoại tuyến:** tài khoản và mật khẩu (băm PBKDF2-SHA256) lưu ngay trong SQLite, không phụ thuộc dịch vụ xác thực bên ngoài.
- **Chỉ dùng SQLite:** ứng dụng hiện **không kết nối Firebase hay bất kỳ dịch vụ Cloud nào**. Các cột `rev`, `updated_at`, `deleted_at` và bảng nhật ký thay đổi vẫn được giữ trong CSDL để phục vụ đồng bộ sau này.

## 4. Đối tượng người dùng (Actors)

| Vai trò (mã) | Mô tả | Màn hình được vào |
|---|---|---|
| **Quản trị hệ thống** (`sysadmin`) | Tài khoản **cứng** trong cấu hình (`src/authConfig.ts`), không lưu SQLite; quản lý toàn bộ cửa hàng và tài khoản có trên máy | **Chỉ** Cửa hàng + Tài khoản (mục 5.14) |
| **Chủ cửa hàng** (`owner`) | Người tạo và sở hữu cửa hàng | Toàn bộ, gồm Báo cáo doanh thu |
| **Quản lý cửa hàng** (`manager`) | Quản lý vận hành hằng ngày | Hiện tương đương Chủ cửa hàng; về sau có thể giới hạn một số tính năng (chỉnh tại `ROLE_SCREENS` trong `src/utils/permissions.ts`) |
| **Phục vụ / Thu ngân** (`staff`) | Người bán hàng trực tiếp | **Chỉ màn hình Bán hàng** |
| **Nhân viên bếp** (`kitchen`) | Pha chế / bếp (chỉ cửa hàng F&B) | **Chỉ màn hình Bếp (KDS)** |

Sau khi đăng nhập, mỗi vai trò được đưa tới màn hình mặc định của mình (Sysadmin: Cửa hàng; Chủ/Quản lý: Báo cáo; Phục vụ: Bán hàng; Bếp: Màn hình bếp); thanh điều hướng chỉ hiện các mục được phép và việc cố mở màn hình khác sẽ bị chuyển về màn hình mặc định.

Quy tắc phân quyền chi tiết được nêu theo từng chức năng ở mục 5.

## 5. Danh sách chức năng

Mỗi chức năng được mô tả theo mẫu: **Mô tả** — **User story** — **Quy tắc nghiệp vụ** — **Trạng thái**.

Chú thích trạng thái: ✅ Hoàn thiện · 🟡 Hoàn thiện một phần · ⚪ Chưa triển khai (kế hoạch).

### 5.1. Xác thực & Quản lý cửa hàng

**Mô tả:** Đăng nhập ngoại tuyến và tạo cửa hàng mới (ba tab: *Demo Sandbox* / *Đăng nhập* / *Tạo cửa hàng*). Tab Demo được **giữ lại có chủ đích** để chủ dự án demo cho khách trước khi dùng chính thức; mặc định mở tab Đăng nhập. Phiên demo hiện thêm chữ "· Demo" ở thanh bên.

**User story:**
- Là *Owner mới*, tôi muốn tự đăng ký một cửa hàng và đăng nhập ngay trên thiết bị để có thể bán hàng mà không cần chờ duyệt qua mạng.
- Là *Owner*, tôi muốn tạo tài khoản cho nhân viên phục vụ / thu ngân / bếp để mỗi người chỉ thấy đúng màn hình công việc của mình (xem mục 5.8).

**Quy tắc nghiệp vụ:**
- Mật khẩu không bao giờ lưu ở dạng thô; băm bằng PBKDF2-SHA256 (100.000 vòng lặp) kèm salt ngẫu nhiên.
- Mỗi cửa hàng đăng ký mới được cấp dữ liệu mẫu tự động (xem mục 5.11).
- Phiên đăng nhập được lưu cục bộ — mở lại ứng dụng không cần đăng nhập lại.
- **Đăng nhập bằng tên tài khoản (username)**, không dùng email. Tên tài khoản: 3-32 ký tự gồm chữ thường không dấu, số, `.`, `_`, `-`; duy nhất trên thiết bị. Email vẫn bắt buộc khi tạo tài khoản nhưng chỉ là email liên hệ / nhận thư khôi phục mật khẩu. Tài khoản tạo từ bản trước được gán username = email (migration v5) nên vẫn đăng nhập được như cũ.
- **Quên mật khẩu (tạm thời — phương án C):** chưa gửi email. Chủ cửa hàng đặt lại mật khẩu cho nhân viên / quản lý (mục 5.8); Quản lý đặt lại được mọi tài khoản trừ chủ; Sysadmin đặt lại được mọi tài khoản. Gửi thư reset qua email sẽ làm cùng giai đoạn kết nối Firebase (cần dịch vụ gửi mail).
- Cửa hàng bị **tạm khóa** (do Sysadmin) thì mọi tài khoản của cửa hàng không đăng nhập được.
- Cửa hàng tạo mới dùng được ngay, không cần phê duyệt. Hàng SysAdmin cũ trong CSDL (nếu còn) không đăng nhập được; sysadmin chỉ là tài khoản cứng (mục 5.14).

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
- Sau khi thanh toán: in hóa đơn nhiệt 80mm, trừ tồn kho (bán lẻ), cộng điểm khách hàng, trả bàn về trống — kể cả toàn bộ nhóm bàn gộp (F&B). Đơn Mang về / Giao đi ghi nhận loại đơn `takeaway`.
- **In hóa đơn:** dùng `window.print()` với CSS in riêng (`@media print` trong `src/index.css`, vùng in `#print-area`, font Arial 12px, rộng 76mm, không ép `@page size`). Máy in nhiệt SUPERISC S31 trên macOS từng báo lỗi do driver — cần cài đúng driver hãng; nếu in trình duyệt vẫn không ổn định, hướng dự kiến là gửi lệnh ESC/POS trực tiếp (chưa làm).

**Trạng thái:** ✅ (Tùy chọn món và Giảm giá/VAT: ✅ mới bổ sung)

---

### 5.3. Bán hàng F&B: Danh sách bàn, Gộp bàn, Tách/Ghép đơn & Đặt bàn trước

**Mô tả:** Giao diện bán hàng F&B tham khảo phong cách KiotViet nhưng có nét riêng (màu, icon, nút lớn dễ chạm trên tablet/điện thoại). Gồm: danh sách bàn dạng thẻ, thực đơn gọi món, các thao tác gộp bàn / chuyển bàn / tách đơn / ghép đơn và đặt bàn trước. Mã nguồn: `TableBoard.tsx` (danh sách bàn), `TableDialogs.tsx` (hộp thoại thao tác), `POSScreen.tsx` (luồng bán hàng), `utils/tableOps.ts` (logic thuần, có test), `TableMap.tsx` (sơ đồ kéo-thả dùng ở mục "Sơ đồ bàn" để thiết kế mặt bằng).

**User story:**
- Là *Thu ngân*, tôi muốn nhìn danh sách bàn là biết ngay bàn nào trống / đang dùng / đã gộp / đã đặt trước, kèm tổng tiền, thời gian ngồi, số món, số khách.
- Là *Thu ngân*, tôi muốn gộp nhiều bàn khách ngồi chung vào một hóa đơn, chuyển khách sang bàn khác, tách một phần món sang đơn khác hoặc ghép hai đơn lại.
- Là *Thu ngân*, tôi muốn ghi nhận khách đặt bàn trước và được nhắc xác nhận khi bắt đầu gọi món cho bàn đó.
- Là *Owner*, tôi muốn tự thiết kế sơ đồ bàn theo mặt bằng thực tế (mục Sơ đồ bàn, Chế độ Thiết kế).

**Mô hình dữ liệu (quyết định A1 — mỗi bàn một đơn mở):**
- Đơn đang mở = giỏ hàng khóa theo id bàn (`carts`). Có thêm hai giỏ ảo `takeaway` (Mang về) và `delivery` (Giao đi).
- Bàn gộp: các bàn phụ trỏ về bàn chính qua `mergedIntoId`; chỉ bàn chính giữ giỏ hàng. Thêm `openedAt` (bắt đầu phục vụ) và `guestCount` (số khách) trên bàn. Migration SQLite v4 thêm 3 cột `merged_into_id`, `opened_at`, `guest_count` vào `dining_tables`.
- Bàn "đang dùng" = có món trong giỏ **hoặc** trạng thái Phục vụ **hoặc** là bàn phụ của một nhóm gộp.

**Quy tắc nghiệp vụ:**
- **Danh sách bàn:** lọc theo khu vực + trạng thái (Tất cả / Đang dùng / Còn trống, có số lượng) + tìm theo tên; thẻ "Mang về", "Giao đi" ở đầu danh sách; màu: trống = trắng, đang dùng = xanh lá, gộp = cam, đang chọn = xanh dương đậm; nhãn đặt trước hiện ở góc thẻ; thời gian ngồi cập nhật mỗi 30 giây.
- **Máy tính (≥1024px):** 2 cột — trái là tab *Phòng bàn / Thực đơn*, phải là đơn của bàn. Chọn bàn trống → tự sang Thực đơn; chọn bàn đang dùng → giữ sơ đồ, đơn hiện bên phải.
- **Điện thoại / tablet nhỏ (<1024px):** 3 bước Danh sách bàn → Đơn của bàn (danh sách món đã order, nút + nổi, thanh dưới Báo bếp / Thanh toán) → Thực đơn (danh sách có ảnh, tìm kiếm, chip danh mục).
- **Menu tùy chọn (nút ⋯):** Lịch sử báo bếp · Gộp bàn · Chuyển bàn · Tách đơn · Ghép đơn · Phiếu đặt bàn · Thông tin đơn hàng · Hủy đơn hàng. (Chưa có: Kiểm đồ, Thêm đơn mới, Hướng dẫn — do mỗi bàn chỉ có một đơn.)
- **Gộp bàn:** chọn các bàn muốn gộp vào bàn hiện tại; món của bàn phụ chuyển sang giỏ bàn chính (dòng trùng thì cộng số lượng); số khách cộng dồn, giờ mở lấy sớm nhất. Có thể bỏ gộp từng bàn phụ (món vẫn ở bàn chính). Thanh toán / hủy đơn trả cả nhóm về trống và bỏ gộp. Tên hiển thị của nhóm, ví dụ "Bàn 02 + Bàn 03", được ghi vào hóa đơn và phiếu báo bếp.
- **Chuyển bàn:** chỉ sang bàn đang trống; chuyển cả giỏ, giờ mở, số khách và các bàn đã gộp.
- **Tách đơn:** chọn số lượng từng món và đích (bàn khác, bàn trống hoặc Mang về / Giao đi). **Ghép đơn:** chuyển toàn bộ đơn sang đích, cộng dồn với đơn sẵn có của đích. Chuyển hết món thì bàn nguồn được trả trống.
- **Đặt bàn trước:** thông tin (tên, SĐT, giờ hẹn, ghi chú) độc lập với trạng thái Trống/Phục vụ. Khi thêm món **đầu tiên** vào bàn có đặt trước, hệ thống hỏi xác nhận thông tin khách. Sửa/hủy phiếu qua menu ⋯ → Phiếu đặt bàn.
- Số khách chỉnh bằng nút − / + trên đơn. Báo bếp đặt bàn (cả nhóm gộp) sang trạng thái Phục vụ.
- Khu vực và bàn thêm/xóa/kéo-thả chỉ dành cho Owner/Manager (mục Sơ đồ bàn).

**Trạng thái:** ✅ (làm lại giao diện: ✅ mới; **chưa kiểm thử trên thiết bị thật** — cần rà lại màu, cỡ chữ, vị trí nút theo bản layout chính thức do chủ dự án cung cấp)

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

- **Ảnh món (mới):** mỗi món/sản phẩm có thể tải ảnh lên từ thư viện hoặc camera thiết bị (khi thêm mới, hoặc chạm vào ảnh trên danh sách để đổi). Ảnh được thu nhỏ (cạnh dài tối đa 640px), nén JPEG và lưu trực tiếp trong SQLite (cột `image_url`, dạng data URL ~30-80KB/ảnh); hiển thị ở màn hình bán hàng và quản lý thực đơn. Mã: `src/utils/imageUpload.ts`.

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
- Chỉ Owner/Manager vào được mục Nhân viên; được sửa vai trò, mức lương và **thêm nhân viên mới** (họ tên, tên tài khoản, email, mật khẩu tối thiểu 6 ký tự, vai trò, lương giờ). Vai trò *Nhân viên bếp* chỉ chọn được ở cửa hàng F&B.
- Nút 🔑 trên thẻ nhân viên: **đặt lại mật khẩu** (chủ: mọi tài khoản; quản lý: trừ tài khoản chủ; ai cũng đặt lại được của chính mình).
- Mỗi tài khoản đăng nhập bằng tên tài khoản + mật khẩu và chỉ thấy các màn hình theo vai trò (mục 4).

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

**Mô tả:** Mỗi cửa hàng mới tạo được cấp sẵn một bộ dữ liệu mẫu để dùng thử ngay, không phải nhập tay từ đầu.

**Quy tắc nghiệp vụ:** dữ liệu mẫu bao gồm:
- Thực đơn/hàng hóa mẫu theo đúng mô hình (F&B hoặc Bán lẻ).
- Sơ đồ khu vực + bàn ăn mẫu (F&B).
- Lô hàng tồn kho ban đầu.
- 2 nhà cung cấp mẫu.
- **4 khách hàng thành viên mẫu** kèm điểm tích lũy (mới bổ sung).
- **3 tài khoản nhân viên mẫu** — 1 Quản lý + 2 Nhân viên, mật khẩu mặc định `123456`; tên tài khoản dạng `quanly.<mã cửa hàng>`, `nhanvien1.<mã cửa hàng>`, `nhanvien2.<mã cửa hàng>` (mới bổ sung).

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

**Mô tả:** Tài khoản sysadmin **cứng** dùng để quản lý toàn bộ cửa hàng và tài khoản đã tạo trên máy. Khi đăng nhập, menu chỉ có hai mục: **Cửa hàng** và **Tài khoản**. Mã nguồn: `src/authConfig.ts` (cấu hình), `src/db/admin.ts` (thao tác dữ liệu), `SysAdminStores.tsx`, `SysAdminAccounts.tsx`. (`SysAdminDashboard.tsx` cũ không còn dùng.)

**Quy tắc nghiệp vụ:**
- **Cấu hình tài khoản:** tên và mật khẩu đặt ở `src/authConfig.ts` (mặc định `sysadmin` / `Sysadmin@2026` — **nên đổi**), hoặc ghi đè bằng biến môi trường `VITE_SYSADMIN_USERNAME` / `VITE_SYSADMIN_PASSWORD` trong `.env.local` (không commit). Tên này bị cấm dùng khi tạo tài khoản thường. Giá trị đặt ở client có thể bị đọc ra từ mã ứng dụng — chỉ phù hợp tạm thời; sẽ thay bằng tài khoản cấp từ Cloud.
- **Cửa hàng:** xem danh sách (số tài khoản, trạng thái), thêm (tuỳ chọn tạo kèm dữ liệu mẫu và tài khoản chủ cửa hàng), sửa (tên, mô hình, SĐT, địa chỉ, trạng thái Hoạt động / Tạm khóa), khóa-mở khóa nhanh, xóa. Xóa là **xóa mềm** cửa hàng và toàn bộ tài khoản của nó (dữ liệu nghiệp vụ còn trong DB nhưng không truy cập được).
- **Tài khoản:** xem theo cửa hàng, tìm kiếm; thêm / sửa (cửa hàng, họ tên, tên tài khoản, email, vai trò, lương giờ, khóa-mở) / đặt mật khẩu / xóa (xóa mềm; tên tài khoản và email được giải phóng để dùng lại).
- **Vùng nguy hiểm:** nút *Xóa toàn bộ dữ liệu* (phải gõ `XOA HET`) xóa vĩnh viễn mọi cửa hàng, tài khoản, đơn hàng, kho... trên máy rồi đăng xuất và nạp lại ứng dụng. Cách để "làm lại từ đầu" vì dữ liệu nằm trong IndexedDB của trình duyệt (hoặc kho SQLite của app native).

**Trạng thái:** ✅ mới bổ sung (chưa kiểm thử trên thiết bị thật)

---

### 5.15. Đồng bộ Cloud (Backup/Khôi phục)

**Trạng thái:** ⚪ **Đã ngắt khỏi ứng dụng**; hiện chỉ lưu dữ liệu trong SQLite trên thiết bị. Mã nền tảng (`src/cloud/*`, `CloudSyncSection.tsx`, `server/cloud-sync-server.mjs`, `src/firebase.ts`) được giữ lại trong source nhưng **không được import/hiển thị ở đâu**. Sẽ làm lại cùng việc kết nối Firebase ở giai đoạn sau.

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

## 8. Hiện trạng mã nguồn & Ghi chú bàn giao (cập nhật 2026-10-11)

> Dành cho các phiên làm việc sau: tóm tắt những gì đã thay đổi và những gì cố ý **chưa** làm.

**Đã làm**
- Giao diện bán hàng F&B mới + gộp bàn / chuyển bàn / tách-ghép đơn (mục 5.3). Logic thuần có test tại `src/utils/tableOps.test.ts`.
- Phân quyền 4 vai trò (`src/utils/permissions.ts`, test `permissions.test.ts`); điều hướng và chuyển hướng màn hình trong `src/App.tsx`.
- (Đã thay đổi ở bước sau: SysAdmin quay lại dưới dạng tài khoản cứng — xem bên dưới.) Dọn chữ Demo: bỏ nhãn "Demo / Offline / Sandbox / Mã cửa hàng" ở thanh bên-header-trang Tài khoản, bỏ màn chờ duyệt/từ chối cửa hàng, không còn tạo tài khoản SysAdmin khi khởi động. Hàng `sysadmin` cũ trong bảng `users` (nếu còn) bị từ chối đăng nhập; sysadmin chỉ tồn tại dưới dạng tài khoản cứng.
- Tab Demo ở màn đăng nhập **được giữ lại** theo yêu cầu (dùng để demo cho khách).
- Đăng nhập bằng tên tài khoản thay cho email (mục 5.1).
- Tài khoản **sysadmin cứng** + màn hình Cửa hàng / Tài khoản (mục 5.14); nút "Xóa toàn bộ dữ liệu"; khóa cửa hàng; đặt lại mật khẩu cho nhân viên (phương án C).
- CSDL: migration v4 (cột bàn gộp / giờ mở / số khách) và v5 (cột `username` cho `users`).
- Sửa lỗi in hóa đơn bị trắng trang (CSS in nhắm sai id) và chỉnh font/khổ in (mục 5.2).
- Thêm `vitest` (`npm test`), log test ở `logs/test-latest.log`. `tsconfig.json` loại `src/demo.tsx` khỏi type-check.

**Cố ý giữ nguyên (chưa xóa) theo yêu cầu chủ dự án**
- Mã chết/không dùng: `src/demo.tsx` (bản cũ ~3400 dòng), `src/firebase.ts`, `src/utils/offlineManager.ts`, `src/fallbackData.json`, `src/cloud/*`, `CloudSyncSection.tsx`, `SysAdminDashboard.tsx`, `src/authConfig.ts` (chứa email/mật khẩu cũ — nên xóa khi dọn), `server/`, `firebase-*.json`, `firestore.rules`, các thư viện `firebase`, `express`, `@google/genai`, `dotenv`.
- `SysAdminDashboard.tsx` (bản cũ) không còn được dùng; `ensureDemoStore` / `demoLogin` đang dùng cho tab Demo.

**Việc tiếp theo đã biết**
- Giao diện đã được làm lại theo hướng tối giản (mục 9). Còn lại: rà bố cục các màn hình phụ theo layout chính thức khi chủ dự án gửi ảnh; kiểm thử trên thiết bị thật (tablet/điện thoại).
- **Quên mật khẩu / gửi mật khẩu reset qua email** chưa làm (đang dùng phương án C — chủ/quản lý/sysadmin đặt lại): cần dịch vụ gửi email (xem mục 5.1).
- Kết nối Firebase (đăng nhập, đồng bộ) làm sau; khi đó cân nhắc dọn mã chết ở trên.
- Máy in nhiệt: xác định driver / dùng ESC/POS nếu `window.print()` không ổn định (mục 5.2).

## 9. Thiết kế giao diện (cập nhật 2026-10-19)

- **Quyết định mới nhất:** thử nghiệm kiểu "tối giản, bỏ icon" (2026-10-15) đã bị **hoàn tác** theo yêu cầu chủ dự án vì không đẹp. Giao diện hiện dùng lại kiểu có icon (lucide-react): thanh bên tối có icon, thanh điều hướng đáy có icon, nút bo tròn, thẻ bo lớn, màn đăng nhập hai cột.
- **Giữ lại từ đợt đó:** màu chủ đạo **cam đất** `#c15f3c` (tham khảo tông cam của Claude) trên nền trung tính ấm (token trong `src/index.css`); cỡ chữ gốc 17px; tải ảnh món lên (mục 5.5); icon bàn SVG cục bộ.
- **Icon bàn:** `src/assets/icons/table.svg` (nhìn từ trên xuống, dùng `currentColor`), nhúng bằng `?raw` trong `TableBoard.tsx`. File do dự án tự vẽ vì svgrepo.com chặn tải tự động; có thể thay bằng SVG tải về từ svgrepo.com (giữ nguyên tên file, dùng `fill="currentColor"`, kiểm tra giấy phép từng icon).
- **Lưu ý khi khôi phục:** icon của các màn hình cũ (Báo cáo, Kho, Bếp, Khách hàng, Nhà cung cấp, Hóa đơn, Nhân viên, Thực đơn, Sơ đồ bàn, Thanh toán) được thêm lại theo vị trí tiêu đề/nút chính; một số icon nhỏ nằm giữa dòng chữ (huy hiệu, thẻ thống kê) có thể chưa giống hệt bản trước — cần rà khi có layout chính thức.
- **Màu danh mục món** dùng bảng màu chủ đạo (`utils/categoryColor.ts`).
