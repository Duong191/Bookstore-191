# Quản lý sách và danh mục Admin

## Sử dụng

- `/admin/books`: tìm tên/tác giả/ISBN, lọc cha/con, trạng thái và tồn kho; sắp xếp và phân trang từ backend. Trang quản trị đọc cả sách ẩn, không dùng danh sách public để sửa sách.
- `/admin/categories`: cây danh mục hai cấp, tìm kiếm, tạo/sửa, thứ tự hiển thị, mô tả, slug, ẩn/hiện và xóa mềm. Số sách trực tiếp bao gồm sách đã ẩn nhưng không bao gồm sách đã xóa mềm. Hàng cha hiển thị thêm tổng của nhóm.
- Form sách chọn cha rồi con. Có thể gán sách trực tiếp cho cha để tương thích dữ liệu cũ. Nút `+ Thêm danh mục` mở modal tạo nhanh; danh mục mới đang hiển thị sẽ được chọn tự động.
- Form lưu ảnh chính/thư viện ảnh, số trang, tags, ISBN, nhà xuất bản, năm xuất bản, ngôn ngữ, bìa, kích thước, trọng lượng, giá/giảm giá, mô tả và trạng thái. Tồn kho chỉ nhập lúc tạo; cập nhật tồn qua trang kho. Rating, lượt đánh giá và số bán là chỉ số chỉ đọc khi sửa sách.
- ADMIN quản lý danh mục và sách. STAFF giữ quyền quản lý sách/tồn kho và đọc danh mục, không được tạo/sửa/xóa danh mục. USER không có quyền API admin.

## API (prefix thực tế `/api`)

| Method | Endpoint | Kết quả / quyền |
|---|---|---|
| GET | `/api/admin/categories?tree=true` | `{items: [...]}` cây; ADMIN/STAFF |
| GET | `/api/admin/categories?tree=false` | Danh sách phẳng; mặc định false |
| GET | `/api/admin/categories/:id` | `{item: ...}` |
| POST | `/api/admin/categories` | Tạo, HTTP 201; ADMIN |
| PATCH | `/api/admin/categories/:id` | Sửa, HTTP 200; ADMIN |
| PATCH | `/api/admin/categories/:id/status` | `{isActive: boolean}`; ADMIN |
| DELETE | `/api/admin/categories/:id` | Xóa mềm, HTTP 204; ADMIN |
| GET | `/api/admin/books` | `{data, meta: {page, limit, total}}`; ADMIN/STAFF |
| GET | `/api/admin/books/:id` | Đọc sách kể cả đang ẩn; ADMIN/STAFF |
| POST / PUT / DELETE | `/api/admin/books[/:id]` | Tạo/sửa/xóa mềm; ADMIN/STAFF |
| PATCH | `/api/admin/books/:id/status` | `{isActive: boolean}`; ADMIN/STAFF |

Payload tạo danh mục:

```json
{
  "name": "Sách tham khảo",
  "parentId": null,
  "description": "Nhóm sách tham khảo",
  "isActive": true,
  "sortOrder": 1
}
```

`slug` và `icon` tùy chọn. Slug tự tạo từ tên khi không truyền; sửa tên không tự đổi slug. `parentId` nhận ID số hoặc chuỗi số, `null` là gốc. Response gồm `id`, `name`, `slug`, `parentId`, `description`, `icon`, `isActive`, `isVisible`, `sortOrder`, `bookCount`, `children`.

Query sách: `search`, `parentCategoryId`, `categoryId`, `status=all|active|inactive`, `stock=all|in-stock|out-of-stock|low-stock`, `sort=newest|oldest|title-asc|title-desc|price-asc|price-desc|stock-asc|stock-desc`, `page`, `limit` (tối đa 100). Tồn thấp: lớn hơn 0 và không quá 10. Sắp xếp giá sử dụng giá sau giảm. `status` là trạng thái riêng của sách; `categoryVisible` cho biết sách có bị ẩn bởi danh mục hay không.

## Quy tắc nghiệp vụ

- Chỉ hỗ trợ cha/con hai cấp; chặn tự làm cha, chu trình và chuyển danh mục có con thành danh mục con.
- Tên không trùng trong cùng cha; slug duy nhất toàn bộ, kể cả slug của danh mục đã xóa mềm. Database legacy có ràng buộc tên duy nhất toàn bộ vẫn giữ nguyên ràng buộc đó.
- Ẩn cha làm con và sách trong nhóm biến mất ở public mà không ghi đè trạng thái riêng của con. Hiện lại cha khôi phục khả năng hiển thị của các con đang active.
- Chỉ tạo/gán mới hoặc kích hoạt sách vào danh mục đang hiển thị. Vẫn sửa được metadata của sách có danh mục đang ẩn nếu không đổi quan hệ.
- Không xóa danh mục có sách chưa xóa mềm, kể cả sách đang ẩn. Không xóa cha còn con active. Nếu các con đều đã ẩn và không có sách, xóa mềm cha và các con đó cùng transaction để tránh danh mục mồ côi.
- Xóa sách giữ bản ghi, đơn hàng và lịch sử kho. Kho khởi tạo lớn hơn 0 tạo một giao dịch mở kho trong cùng transaction với sách.
- Category mutation dùng SQL application lock độc quyền; ghi sách giữ lock chia sẻ cùng tài nguyên để tránh gán sách vào danh mục vừa bị xóa. Payload/query được validate, cột sắp xếp dùng allowlist và query dùng parameter.
- Shop, menu danh mục và bộ lọc lấy dữ liệu DB. Lọc cha bao gồm sách của các con. Không dùng taxonomy dự phòng hard-code. Các kệ nội dung ở trang chủ vẫn có từ khóa phân loại nội dung nhưng lựa chọn danh mục/ID lấy từ API.
- Giỏ hàng/checkout từ chối sách hoặc danh mục đã ẩn/xóa. Kho đọc cả sách ẩn để không mất khả năng quản lý hàng trong kho.

## Database và triển khai

Đã kiểm tra schema `DB_bookstore.sql` và SQL legacy trước khi sửa. Script [category-management-compatibility.sql](../BE/category-management-compatibility.sql) thêm `categories.is_deleted`, `categories.deleted_at` và index quản trị nếu chưa có. Có transaction và chạy lại an toàn; không DROP bảng, không xóa dữ liệu cũ. Các cột cha/con, thứ tự và trạng thái đã tồn tại nên không tạo bảng taxonomy mới.

Script đã áp dụng trên DB cấu hình của workspace: trước/sau giữ nguyên **46 danh mục và 21 sách chưa xóa**. Chạy script này trước khi đưa code lên DB môi trường khác. Không chạy các script dựng lại toàn bộ database để nâng cấp.

Backend hỗ trợ hai schema sách/tags/kho đang có. Schema mới dùng `stock_quantity`, tags chuẩn hóa và `sp_AdjustInventory`; schema legacy giữ đường query/procedure cũ. Các API và kiểu dữ liệu FE giữ tên trường tương thích.

## Kiểm chứng

- `BE: npm.cmd run build` và `FE: npm.cmd run build`.
- `BE: npm.cmd run test:catalog` — phân quyền và validate HTTP.
- `BE: npm.cmd run test:catalog:db` — CRUD/cây/trùng/depth/ẩn/xóa, bộ lọc/phân trang, kho, đăng ký/đăng nhập/refresh/logout, giỏ hàng, đặt/hủy đơn và giữ lịch sử; transaction thử rollback.
- `BE: npm.cmd run test:books:db`, `test:checkout:db`, `test:admin-users`, `test:admin-users:db` — hồi quy các flow hiện có.
- `FE: npm.cmd test -- --watchAll=false --runInBand` — 22 tests, gồm cây danh mục, bộ lọc sách và modal tạo nhanh/chọn danh mục, payload ảnh/pages/tags.

Chưa chạy E2E trên trình duyệt hoặc stress test đồng thời. Build FE còn cảnh báo hook ở các trang cũ BookDetail, AdminBlog và AdminOrders; không làm build thất bại.
