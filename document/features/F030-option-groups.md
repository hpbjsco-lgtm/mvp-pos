# F030 — Nhóm tùy chọn của món (đường, đá, ghi chú nhanh) và nhấp đúp mở thực đơn

| Trường | Nội dung |
|---|---|
| Mã chức năng | F030 |
| Trạng thái | Đã có test tự động (tsc, vitest). **Chưa chạy thử trên màn hình/điện thoại thật.** Thay thế mức đường/đá cố định trước đây (F002, F004, F005) |
| Actor | Chủ, Quản lý (cấu hình nhóm tùy chọn của món); Thu ngân/Phục vụ (chọn khi gọi món); Bếp (xem trên phiếu) |
| Mã nguồn | `src/components/{OptionGroupsEditor,DishDialog,POSScreen,TableBoard,KiotTableGrid}.tsx`, `src/utils/productOptions.ts`, `src/db/{schema,collections,seed,deviceSchema,index}.ts`, `server/pos-db-server/src/{syncTables,syncPolicy}.mjs` |
| Liên quan | F002, F004, F005, F009, F019, F020, F022 |

## 1. Mục tiêu
- Mỗi món tự cấu hình các **nhóm tùy chọn** (Đường, Đá, Mức cay, hoặc nhóm "Ghi chú nhanh") và các **lựa chọn** trong nhóm (0%, 30%, 50%...). Thu ngân chọn nhanh khi gọi món, không phải gõ ghi chú tay.
- Đường và đá không còn cố định: chúng chỉ là hai nhóm **mặc định khi tạo món uống mới**, sửa hoặc xóa được từng món.
- Nhấp đúp vào một bàn ở màn Bán hàng để vào thực đơn gọi món.

## 2. Khái niệm
| Thuật ngữ | Ý nghĩa |
|---|---|
| Nhóm tùy chọn (`product_option_groups`) | Một nhóm của một món: tên (Đường), cờ **Cho chọn nhiều** (`allow_multiple`) |
| Lựa chọn (`product_option_choices`) | Một giá trị trong nhóm (50%), cờ **Mặc định** (`is_default`) |
| Tùy chọn đã chọn trên dòng (`options`) | Bản chụp `[{group, choice, multiple?}]` ghi vào dòng giỏ, dòng hóa đơn, phiếu bếp |

Nhóm **chọn một** (`allow_multiple = 0`): đường, đá. Nhóm **chọn nhiều** (`allow_multiple = 1`): ghi chú nhanh như "Ít cay", "Không hành". Ghi chú gõ tay (`note`) vẫn tồn tại, không liên quan.

## 3. Use case

### UC-030-01 — Cấu hình nhóm tùy chọn của món
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | Cửa hàng F&B; vai trò Chủ/Quản lý mở *Thực đơn → Sửa món* hoặc *Tạo món* |
| Luồng | Khối **Tùy chọn khi bán** trong hộp Tạo/Sửa món. Thêm nhóm → đặt tên; thêm lựa chọn → đặt tên; tick **Mặc định**; tick **Cho chọn nhiều**; xóa lựa chọn/nhóm. Bấm **Lưu** |
| Lỗi (chặn lưu, hiện trong hộp) | "Nhóm tùy chọn chưa có tên." · "Nhóm \"X\" bị trùng tên." (không phân biệt hoa thường) · "Nhóm \"X\" chưa có lựa chọn nào." · "Nhóm \"X\" có lựa chọn để trống." · "Nhóm \"X\" có lựa chọn bị trùng." · "Nhóm \"X\" chỉ cho chọn một nên chỉ có một lựa chọn mặc định." |
| Kết quả | Tên nhóm và lựa chọn được cắt khoảng trắng đầu/cuối; nhóm/lựa chọn giữ `id`; danh sách rỗng lưu thành "món không có tùy chọn" |

### UC-030-02 — Món uống mới tự có Đường và Đá
```
mở "Tạo món":
    nếu loại thực đơn == 'drink'  -> nhóm ban đầu = Đường [0%,30%,50%,70%,100%] mặc định 100%
                                              + Đá     [0%,30%,50%,70%,100%] mặc định 100%
    ngược lại                     -> không có nhóm
đổi "Loại thực đơn" khi tạo món mới:
    nếu người dùng CHƯA sửa nhóm bằng tay -> nhóm đi theo loại (drink: Đường+Đá, khác: rỗng)
    nếu đã sửa tay                        -> giữ nhóm đang có
mở "Sửa món" của món đã có:
    luôn hiện đúng nhóm đã lưu, không tự thêm Đường/Đá, không đổi khi đổi loại
"Lưu & Tạo thêm món": món kế tiếp có id mới, nhóm mặc định tính lại theo loại đang chọn
```
Id nhóm/lựa chọn mặc định dựng từ id món (`<id món>::sugar`, `<id món>::sugar::0`...) để mọi thiết bị tạo ra cùng một id.

### UC-030-03 — Chọn tùy chọn khi gọi món
| Mục | Nội dung |
|---|---|
| Tiền điều kiện | Cửa hàng F&B; món có ít nhất một nhóm |
| Thêm món vào đơn | `defaultSelections(món)`: mỗi nhóm có lựa chọn mặc định thì chọn sẵn. Nhóm không có mặc định: để trống |
| Giao diện | Nhóm **chọn một**: ô chọn (select) "Đường 50%", có mục "Đường: không chọn". Nhóm **chọn nhiều**: các nút bật/tắt (chip), chọn nhiều cùng lúc |
| Đổi lựa chọn | Chọn một: thay lựa chọn cũ của nhóm; chọn "không chọn": bỏ nhóm. Chọn nhiều: chạm để bật/tắt |
| Dòng đã báo bếp | Đổi lựa chọn cũng cập nhật các phiếu bếp **chưa đóng** của dòng đó (F004) |
| Định danh dòng | `lineKey` gồm `optionsSignature` (không phụ thuộc thứ tự): cùng món khác tùy chọn là **hai dòng riêng** |
| Bán lẻ | Không có nhóm tùy chọn |

### UC-030-04 — Hiển thị
`optionsText(options)`: mỗi lựa chọn của nhóm **chọn một** ghi "<tên nhóm> <lựa chọn>"; lựa chọn của nhóm **chọn nhiều** chỉ ghi lựa chọn. Nối bằng dấu phẩy. Ví dụ `Đường 50%, Đá 70%, Ít cay, Không hành`.
| Nơi | Cách hiện |
|---|---|
| Màn bếp (KDS) | Cột ghi chú: `Size · <optionsText>` |
| Lịch sử báo bếp | Dòng phụ: size, topping, `<optionsText>`, ghi chú trong ngoặc kép |
| Phiếu bếp in | `Size - <optionsText>` rồi `+ topping`, `Ghi chú` |
| Hóa đơn in, tạm tính | `Tùy chọn: Size - <optionsText>` |
| Lịch sử hóa đơn, hộp chuyển/tách món, hộp thanh toán | `<optionsText>` cùng size và ghi chú |
Định dạng lịch sử báo bếp **đổi** từ "50% đường, 70% đá" sang "Đường 50%, Đá 70%".

### UC-030-05 — Nhấp đúp vào bàn mở thực đơn
```
nhấp đúp vào thẻ bàn hoặc thẻ "Mang về"/"Giao đi" (TableBoard, KiotTableGrid):
    chọn bàn đó (như một lần nhấp)
    nếu màn hình máy tính (isDesktop)  -> chuyển sang tab Thực đơn (fnbLeftTab = 'menu')
    ngược lại (điện thoại)             -> chuyển sang bước Thực đơn (mobileStep = 'menu')
```
Hai lần nhấp của nhấp đúp đã chọn bàn và bíp; thao tác mở thực đơn không bíp thêm. Nhấp một lần vẫn như trước (ô *Mở thực đơn khi chọn bàn* ở máy tính; điện thoại chuyển sang bước đơn hàng).

## 4. Dữ liệu (Database, migration v22; device migration 1002)
| Bảng | Cột |
|---|---|
| `product_option_groups` | `id, store_id, product_id, name, allow_multiple, line_no, created_at` |
| `product_option_choices` | `id, store_id, product_id, group_id, label, is_default, line_no, created_at` |
| `cart_items`, `order_items`, `kitchen_items` | thêm `options` (JSON text, rỗng = không có). Cột cũ `sugar_level`, `ice_level` vẫn có trong bảng, **không còn đọc/ghi** |

- Hai bảng mới là **bảng con của `products`**, lưu/đẩy/thay thế cùng món như `order_items` với `orders` (`CHILD_TABLES.products` ở máy chủ, `CHILD_TABLE_PARENTS` ở thiết bị, hai danh sách này có test đối chiếu). Cả hai đều có `product_id` để gắn về món; `line_no` là vị trí trong danh sách.
- Khi lưu món: xóa cứng toàn bộ nhóm và lựa chọn của món rồi ghi lại (cùng cách với dòng hóa đơn).
- Bản chụp trên dòng giữ tên nhóm/lựa chọn dạng chữ để hóa đơn cũ không đổi khi sửa món.
- Xung đột đồng bộ: nhóm và lựa chọn đi theo món, hiển thị trong nhóm "Nhóm tùy chọn", "Lựa chọn" (`conflictPresenter.ts`).
- `SYNCED_TABLES` có thêm hai bảng (sau `products`); danh sách ở máy chủ `syncTables.mjs` khớp (có test).
- Xóa toàn bộ dữ liệu (F014) xóa luôn hai bảng.

### Migration v22 làm gì
1. Tạo hai bảng, thêm cột `options` vào ba bảng dòng.
2. Chuyển `sugar_level`/`ice_level` cũ của cả ba bảng thành `options` (`[{"group":"Đường","choice":"50%"},{"group":"Đá","choice":"70%"}]`; chỉ một trong hai thì chỉ có một phần tử; cả hai rỗng thì để rỗng).
3. Gán nhóm **Đường** và **Đá** mặc định (5 mức, mặc định 100%) cho món uống đang có: `kind = 'product'`, chưa xóa, và `menu_type = 'drink'` hoặc (`menu_type` trống và nhóm món = "Đồ uống", như `isDrinkProduct`). Món ăn, nguyên liệu, món đã xóa: không gán.
4. Id nhóm/lựa chọn dựng từ id món, nên máy chủ, từng điện thoại và từng trình duyệt chạy migration đều tạo **cùng** các dòng; không cần đồng bộ riêng cho chúng.
5. Trên điện thoại, `migrate()` bật cờ `applying` trong lúc chạy migration dùng chung, để các thay đổi do migration không bị đưa vào hàng đợi tải lên như thao tác của người dùng. Migration thiết bị 1002 tạo trigger theo dõi thay đổi cho hai bảng mới.

## 5. Trường hợp biên
| Tình huống | Kết quả |
|---|---|
| Món có nhóm, thu ngân không chọn gì ở nhóm không có mặc định | Dòng không ghi gì cho nhóm đó |
| Sửa nhóm của món sau khi đã có đơn | Đơn cũ giữ bản chụp; dòng đang mở trong giỏ vẫn hiện lựa chọn đã chọn |
| Xóa lựa chọn đang được chọn trên dòng giỏ | Dòng vẫn giữ chữ đã chọn (bản chụp); lần chọn lại dùng danh sách mới |
| Món uống tạo trước migration có `menu_type` trống, nhóm khác "Đồ uống" | Không có nhóm; thêm nhóm tay trong Sửa món |
| Hai dòng cùng món khác thứ tự chọn của nhóm chọn nhiều | Cùng chữ ký, gộp thành một dòng khi thêm món |
| Đơn cũ chưa chuyển (không xảy ra sau migration) | `sugar_level`/`ice_level` không còn được đọc; chỉ `options` |
| Mất mạng khi đang sửa món | Như mọi thay đổi `products` (F019); nhóm đi cùng món lên máy chủ |
| Nhấp đúp vào bàn gộp hoặc bàn con | Dùng cùng cách chọn bàn với nhấp một lần (`setSimSelectedTableId(id)`), rồi mở thực đơn |

## 6. Giới hạn
- Chưa sắp xếp lại thứ tự nhóm/lựa chọn bằng kéo thả (thứ tự = thứ tự thêm).
- Chưa có thư viện nhóm dùng chung cho nhiều món (mỗi món tự có nhóm; món uống mới được điền sẵn Đường và Đá).
- Tùy chọn không đổi giá món (khác topping, size).
- Chưa thống kê theo lựa chọn (ví dụ số ly "ít đường").
- Trên cửa hàng bán lẻ không có nhóm tùy chọn.

## 7. Kiểm thử
`src/utils/productOptions.test.ts`, `src/db/productOptionsColumns.test.ts` (migration v22, ánh xạ cột, lưu nhóm theo món, tùy chọn trên dòng), `src/printing/kitchenTicket.test.ts`, `src/utils/kitchenHistory.test.ts`, `src/sync/conflictPresenter.test.ts`, `server/pos-db-server/src/childTablesMirror.test.mjs`. Nhấp đúp (UI) chưa có test tự động.
