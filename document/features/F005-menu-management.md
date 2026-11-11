# F005 — Quản lý thực đơn / sản phẩm: món, size, topping, công thức nguyên liệu

| Trường | Nội dung |
|---|---|
| Mã chức năng | F005 |
| Trạng thái | Hoàn thiện. Nguồn đặc tả cũ: FEATURES.md mục 5.5 (các mục "chưa làm trừ kho topping" đã **lỗi thời**: nay topping chế biến có trừ kho, xem F023) |
| Actor | Chủ, Quản lý |
| Mã nguồn | `src/components/{MenuManagement,DishDialog,ToppingDialog,RecipeEditor}.tsx`, `src/utils/{sizes,recipes,salesRanking,imageUpload,categoryColor}.ts` |
| Liên quan | F002 (bán), F006 (kho/nguyên liệu), F023 (trừ kho), F027 (giá vốn) |

## 1. Mục tiêu
Khai báo món (F&B) hoặc hàng hóa (bán lẻ): tên, giá, giá vốn, nhóm, ảnh, size, topping, công thức nguyên liệu; điều khiển món nào hiện trên màn thu ngân và món nào bán được.

## 2. Khái niệm
| Thuật ngữ | Ý nghĩa |
|---|---|
| Loại thực đơn (`menu_type`) | `food` (Đồ ăn), `drink` (Đồ uống), `service` (Dịch vụ), khác. **Chỉ `drink`** có mức đường/đá. Món cũ chưa khai báo: dựa vào nhóm "Đồ uống" (`isDrinkProduct`) |
| Loại món (`dish_kind`) | `prepared` (chế biến, có công thức), `regular` (thường, hàng nhập sẵn) |
| Topping | Một `Product` có `is_topping = 1`; `topping_kind` = `prepared` / `regular` / `made` (sản xuất); `topping_for` = danh sách id món được gắn |
| Size | Danh sách `{name, price}`; size đầu tiên là mặc định và là `price` gốc |
| Hiện trên màn thu ngân (`is_active`) | Tắt: món không xuất hiện trên lưới Bán hàng nhưng còn trong Thực đơn |
| Cho phép bán (`is_available`) | Tắt: món hết hàng, vẫn hiện nhưng không bán được ("Sản phẩm này hiện đang báo hết hàng!") |

## 3. Use case

### UC-005-01 — Tạo / sửa món (`DishDialog`)
Vào: nút **+ Món** hoặc **Sửa món** trên thẻ món.
| Trường | Quy tắc |
|---|---|
| Tên món | Bắt buộc: "Vui lòng nhập tên món." |
| Nhóm món | Trống → theo loại: Đồ uống / Món ăn / Khác |
| Loại thực đơn | Đồ ăn / Đồ uống / Dịch vụ / Khác |
| Mã món (SKU) | Trống → tự sinh `MN-<6 số cuối timestamp>`; sửa món giữ mã cũ |
| Ảnh | Tải từ thư viện/camera; thu nhỏ cạnh dài tối đa 640px, nén JPEG, lưu data URL ~30–80KB trong `image_url`. Lỗi: "Không đọc được ảnh." |
| Giá | Một giá, hoặc bật **Thiết lập giá** (nhiều size). Bật lần đầu tự gợi ý 2 size: *Nhỏ* (giá hiện tại), *Lớn* (+10.000) |
| Size | Phải có ít nhất 1 size hợp lệ: "Vui lòng nhập ít nhất một size (tên và giá)." (`cleanSizes` loại size thiếu tên/giá). `price` gốc = giá size đầu |
| Loại món | *Món chế biến* hoặc *Món thường* |
| Công thức (món chế biến) | Tìm và thêm nguyên liệu, SL cho **1 phần** theo đơn vị cơ bản hoặc quy đổi. Mỗi SL phải > 0: "Số lượng của mỗi nguyên liệu phải lớn hơn 0." |
| Giá vốn | Món chế biến: **tự tính** = `round(Σ giá vốn nguyên liệu × SL cơ bản)`; món thường: nhập tay |
| Hiển thị | Dưới giá: *Lợi nhuận ròng dự kiến* = giá − giá vốn, *Tỷ lệ giá vốn / giá bán* |
| Topping | Bật để tích chọn các topping gắn cho món (cập nhật ngược `topping_for` của topping) |
| Cho phép bán / Hiện trên màn thu ngân | Hai ô riêng (xem mục 2) |
| Lưu / Lưu & thêm mới | "Lưu & thêm mới" xóa form để nhập tiếp |
Cửa hàng bán lẻ dùng form đơn giản (tên, giá, giá vốn, nhóm, SKU, ảnh); có thêm size nếu cấu hình.

### UC-005-02 — Tạo / sửa topping (`ToppingDialog`)
Thực đơn → nút **+** → Topping. Trường: tên (bắt buộc: "Vui lòng nhập tên topping."), nhóm, giá (mặc định 5.000), ảnh, loại (*chế biến / thường / sản xuất*), *Cho phép bán*, **Gắn món** (tìm từng món hoặc *Chọn theo nhóm*, xóa bớt). Topping chế biến có công thức (SL > 0 mỗi nguyên liệu). Topping hiện trong Thực đơn kèm nhãn "Topping · n món" và nút *Sửa topping*, **không** hiện trên lưới món ở màn Bán hàng.

### UC-005-03 — Xóa món
Nút xóa → "Bạn có chắc chắn muốn xóa món này khỏi danh mục thực đơn?" → xóa mềm (`deleted_at`). Bán lẻ: "Xóa khỏi danh mục sản phẩm".

### UC-005-04 — Hiển thị trên màn bán hàng
```
lưới món = món (không phải topping) có is_active != 0
sắp xếp: số lượng bán trong 30 ngày gần nhất giảm dần (countUnitsSold, bỏ đơn void); bằng nhau giữ thứ tự cũ
giá hiển thị: món có size -> "từ <giá thấp nhất>"; không -> giá
```
Mỗi dòng giỏ: nút chọn size kèm giá (đổi size → đơn giá đổi, cộng topping); các nút `+ Trân châu đen 5.000` cho topping được gắn (`− tên x2 +` để tăng giảm). Topping chỉ áp cho phần **chưa báo bếp** của dòng; nếu dòng đã báo hết thì tách 1 phần mới.

## 4. Công thức giá của dòng
`đơn giá dòng = giá theo size (priceForSize) + Σ giá topping × SL topping`. Size không đổi giá vốn (F027).

## 5. Dữ liệu (Database) — bảng `products`
| Cột | Ý nghĩa | Migration |
|---|---|---|
| `id, store_id, kind, sku, name, price, cost, unit, category, is_available, track_stock, min_stock, image_url, note` | Cơ bản | |
| `is_topping, topping_kind, topping_for` | Topping (`topping_for` JSON id món) | v9 |
| `sizes` | JSON `[{name, price}]` | v10 |
| `item_group, brand, max_stock, location, weight, unit_conversions, is_active` | Hàng hóa kho (F006); `is_active` còn dùng để ẩn món khỏi màn thu ngân | v12 |
| `menu_type, dish_kind, recipe` | Loại thực đơn, loại món, công thức JSON `[{ingredientId, quantity, unit?}]` | v13 |
| `check_each_shift` | Kiểm kho mỗi ca (F024) | v20 |

## 6. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Tắt "Hiện trên màn thu ngân" | Món biến mất khỏi lưới, vẫn trong Thực đơn, vẫn thống kê |
| Tắt "Cho phép bán" | Món hiện nhưng không thêm vào giỏ được |
| Đổi giá món sau khi đã có đơn | Đơn cũ giữ giá/giá vốn đã lưu |
| Món chế biến, nguyên liệu bị xóa | Công thức tham chiếu nguyên liệu không tìm thấy → giá vốn phần đó 0, trừ kho bỏ qua (cần kiểm tra thủ công) |
| Hai món cùng tên | Cho phép (SKU phân biệt) |

## 7. Việc chưa làm
Tag món, chi nhánh kinh doanh, giá theo bảng giá, thuộc tính (size, màu) cho hàng kho.

## 8. Kiểm thử
`sizes.test.ts`, `recipes.test.ts`, `salesRanking.test.ts`, `costing.test.ts`.
