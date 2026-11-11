# F025 — Xuất và nhập file CSV cho kho

| Trường | Nội dung |
|---|---|
| Mã chức năng | F025 (A5 trong nhật ký phát triển) |
| Trạng thái | Hoàn thiện về mã và kiểm thử tự động. Chỉ CSV; **chưa có Excel (.xlsx)** (chủ dự án chọn CSV tạm thời) |
| Actor | Chủ, Quản lý (màn Kho) |
| Mã nguồn | `src/utils/{csv,inventoryCsv,downloadFile}.ts`, `src/components/{CsvImportDialog,InventoryScreen}.tsx` |
| Liên quan | F006 (kho), F021 (số `PNK`), F024 (xuất lịch sử kiểm kho) |

## 1. Mục tiêu
- Xuất dữ liệu kho ra file mở được bằng Excel để kế toán, đối chiếu.
- Nhập hàng loạt danh mục hàng và lô hàng từ file mẫu, thay vì gõ từng dòng.
- **Nhập toàn bộ hoặc không gì cả**: file có lỗi thì không thêm dòng nào.

## 2. Định dạng file
| Thuộc tính | Quy tắc |
|---|---|
| Mã hóa | UTF-8 **có BOM** khi xuất (để Excel đọc đúng tiếng Việt). Khi đọc: bỏ BOM nếu có |
| Phân cách khi xuất | Dấu phẩy `,`; xuống dòng `\r\n`; ô có dấu phẩy/ngoặc kép/xuống dòng được đặt trong `"..."` |
| Phân cách khi đọc | **Tự nhận**: chọn trong `;`, tab, `,` ký tự xuất hiện nhiều nhất (mặc định `,`). Excel tiếng Việt thường lưu bằng `;` |
| Dòng bắt đầu bằng `#` | Ghi chú/ví dụ, **bị bỏ qua** khi đọc |
| Lỗi cấu trúc | Ngoặc kép mở mà không đóng → "Dòng N: có dấu ngoặc kép mở nhưng chưa đóng." |
| Số | Chấp nhận `1234`, `1234,5`, `1234.5`, và kiểu nghìn Việt `25.000`; còn lại không phải số |
| Ngày | `yyyy-mm-dd`, `dd/mm/yyyy`, `dd-mm-yyyy`; phải là ngày có thật (ví dụ 31/02 bị loại) |
| Tên cột | So khớp **không phân biệt hoa thường, dấu, khoảng trắng đầu/cuối, dấu `*`** |

## 3. Use case

### UC-025-01 — Xuất file
Màn Kho → nút **Xuất file** (menu). Lựa chọn:
| Mục | Tên file | Cột |
|---|---|---|
| Danh mục hàng (chỉ F&B) | `kho-hang-hoa` | Mã hàng, Tên hàng, Nhóm quản lý, Nhóm hàng, Thương hiệu, Đơn vị tính, Giá vốn, Tồn tối thiểu, Tồn tối đa, Tồn kho, Vị trí, Ghi chú, Đang kinh doanh (Có/Không) |
| Tồn kho theo lô | `kho-ton-theo-lo` | Mã hàng, Tên hàng, Mã lô, Ngày sản xuất, Hạn sử dụng, Giá nhập, Số lượng nhập, Tồn hiện tại, Đơn vị tính |
| Lịch sử phiếu kho | `kho-lich-su-phieu` | Số phiếu, Mã tạm, Loại phiếu (Nhập/Xuất/Điều chỉnh/Kiểm kho), Thời gian (giờ máy), Mã hàng, Tên hàng, Mã lô, Số lượng, Đơn giá, Ghi chú (mỗi **dòng phiếu** một hàng) |
Xuất theo **đơn vị cơ bản** của hàng (chưa xuất theo đơn vị quy đổi). `Tồn kho` = tổng các lô, làm tròn 6 chữ số.
Lịch sử kiểm kho có nút xuất riêng (F024).

### UC-025-02 — Tải file mẫu
Hộp nhập có nút **Tải file mẫu** (`mau-nhap-hang-hoa`, `mau-nhap-lo-hang`): dòng hướng dẫn bắt đầu `#`, dòng tiêu đề, một dòng ví dụ bắt đầu `#VD` (bị bỏ qua nên không cần xóa).

### UC-025-03 — Nhập danh mục hàng
| Mục | Nội dung |
|---|---|
| Cột mẫu | `Mã hàng, Tên hàng*, Nhóm quản lý, Nhóm hàng, Thương hiệu, Đơn vị tính, Giá vốn, Tồn tối thiểu, Tồn tối đa, Vị trí, Ghi chú` (`*` bắt buộc) |
| Luồng | Chọn file CSV → hệ thống đọc, **xem trước** bảng (Mã hàng, Tên hàng, Nhóm quản lý, Đơn vị, Giá vốn) và danh sách lỗi → bấm xác nhận |
| Kết quả | Thêm hàng mới vào danh mục (`trackStock = true`, `isActive`, `isAvailable`), ghi nhật ký "Nhập hàng hóa từ file CSV". **Không tạo tồn kho**: tồn đầu kỳ nhập bằng file lô |

### UC-025-04 — Nhập lô hàng
| Mục | Nội dung |
|---|---|
| Cột mẫu | `Mã hàng*, Mã lô*, Ngày sản xuất, Hạn sử dụng*, Giá nhập, Số lượng*, Đơn vị` |
| Kết quả | Tất cả lô trong file được thêm vào kho và ghi thành **một phiếu nhập** (`PNK`, F021), ghi chú `Nhập từ file CSV (N lô)`, `totalAmount = Σ giá nhập × số lượng` |

## 4. Quy tắc kiểm tra (if/else)

### 4.1 Cấp file
```
if (file rỗng)                         -> "File không có dữ liệu. Hãy dùng file mẫu."
if (thiếu cột bắt buộc/mẫu)            -> "Thiếu cột: <danh sách>. Hãy dùng đúng file mẫu."
if (đọc file lỗi)                      -> "Không đọc được file: <lý do>"
if (có bất kỳ lỗi dòng nào)            -> hiển thị danh sách lỗi, nút xác nhận bị khóa, KHÔNG nhập gì
if (không có dòng hợp lệ)              -> nút xác nhận bị khóa
```

### 4.2 Từng dòng của file hàng hóa (mọi lỗi của một dòng được gộp: `a; b.`)
| Điều kiện | Lỗi |
|---|---|
| Tên trống | thiếu tên hàng |
| Nhóm quản lý khác trống / "Nguyên vật liệu" / "Công cụ dụng cụ" (không dấu, không phân biệt hoa thường) | nhóm quản lý "x" không đúng (chọn Nguyên vật liệu hoặc Công cụ dụng cụ) |
| Giá vốn, tồn tối thiểu, tồn tối đa không phải số (ô trống thì bỏ qua) | `<cột> "x" không phải số` |
| Tồn tối đa > 0 và tồn tối thiểu > tồn tối đa | tồn tối thiểu lớn hơn tồn tối đa |
| Mã hàng đã có (trong kho hoặc trùng ở dòng trước trong file, không phân biệt hoa thường) | mã hàng "x" đã có |
Giá trị mặc định: nhóm trống = Nguyên vật liệu; mã trống → tự sinh `NL0001…` hoặc `CC0001…` (nối tiếp mã đang có và các mã mới trong file); nhóm hàng trống → `Khác` (công cụ: `Công cụ`); giá vốn trống = 0.
Chỉ **thêm mới**, không cập nhật hàng đã có.

### 4.3 Từng dòng của file lô hàng
| Điều kiện | Lỗi |
|---|---|
| Mã hàng không có trong danh mục (khớp theo SKU, không phân biệt hoa thường) | mã hàng "x" chưa có trong danh mục |
| Mã lô trống | thiếu mã lô |
| Mã lô (đổi sang HOA) đã có cho hàng đó (kho hoặc dòng trước trong file) | mã lô "X" đã có cho hàng này |
| Hạn sử dụng trống / không phải ngày | thiếu hạn sử dụng / hạn sử dụng "x" không phải ngày hợp lệ |
| Ngày sản xuất không phải ngày; hoặc sau hạn sử dụng | ngày sản xuất "x" không phải ngày hợp lệ / ngày sản xuất sau hạn sử dụng |
| Số lượng trống, không phải số, hoặc ≤ 0 | thiếu số lượng / số lượng "x" phải là số lớn hơn 0 |
| Giá nhập có nhưng không phải số | giá nhập "x" không phải số |
| Đơn vị khác đơn vị tính hoặc đơn vị quy đổi của hàng | đơn vị "x" không có ở hàng này (<danh sách đơn vị>) |
Giá trị suy ra: giá nhập trống = giá vốn hàng; đơn vị trống = đơn vị tính; số lượng được **quy đổi về đơn vị cơ bản** (`toBaseQuantity`) trước khi lưu (`quantity = originalQuantity`). Khi xem trước hiển thị số lượng theo đơn vị người dùng gõ.

## 5. Dữ liệu
Không thêm bảng. Ghi vào `products`, `inventory_batches` (`transaction_id` = phiếu nhập), `inventory_transactions` (`type = import`, `note`), `inventory_transaction_items`. Phiếu nhập lấy số `PNK` từ máy chủ hoặc mã tạm offline (F021).

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| File lưu từ Excel bằng `;` | Tự nhận dấu `;` |
| Số `25.000` ở cột Giá nhập | = 25000 |
| Số `1.5` | = 1,5 (chỉ coi là nghìn khi đúng nhóm 3 chữ số: `1.500` = 1500) |
| Trùng mã lô giữa hai dòng cùng hàng trong file | Dòng sau báo lỗi |
| Lỗi mạng khi lấy số phiếu | Dùng mã tạm (native) hoặc báo lỗi (web), F021 |
| Cửa hàng bán lẻ | Menu xuất không có "Danh mục hàng" |

## 7. Kiểm thử
`inventoryCsv.test.ts`, `csv.test.ts` (BOM, dấu phân cách, ngoặc kép, lỗi).

## 8. Giới hạn
- Không cập nhật hàng đã có bằng file; không xuất/nhập Excel; không nhập phiếu xuất.
- Nhập tối đa theo bộ nhớ trình duyệt/máy; chưa chia lô nhỏ.
