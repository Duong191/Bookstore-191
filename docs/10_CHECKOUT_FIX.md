# Sửa lỗi đặt hàng: expected number, received null

Ngày: 14/10/2026.

## Nguyên nhân đã xác định

1. `book.service.listBooks()` dùng tên cột schema cũ (publish_date, stock, discount...). DB thực tế dùng publication_year, stock_quantity, discount_percent. Truy vấn trước sửa lỗi `Invalid column name 'publish_date'`.
2. FE `bootstrapFromBackend()` bắt lỗi và nạp `recoveredBookstoreBooks.json`. Các sách dự phòng không có ID database, nên mapper dùng ISBN hoặc tên làm ID.
3. Context đặt hàng chuyển `Number(bookId)`. ISBN có dấu gạch hoặc tên thành NaN; `JSON.stringify` biến NaN thành null.
4. PUT `/api/cart` yêu cầu bookId number nên Zod trả thông báo trong ảnh. POST tạo đơn chưa được thực hiện.
5. Cart API cũng có lệch response: BE trả array/book_id, FE trước đây chỉ đọc wrapper/items/bookId.

## Thay đổi

- BE nhận diện hai schema bằng metadata, giữ tên field trả về FE thống nhất.
- Public books list/detail đọc giá/discount/stock từ DB thật thay vì rơi vào fallback vì tên cột sai.
- Cart dùng cột stock, discount và thời điểm item phù hợp; chọn giỏ active ở schema mới, ưu tiên danh tính user thay cho guest khi có token. PUT hỗ trợ giỏ rỗng và chặn dòng trùng bookId.
- Order schema mới lấy snapshot giỏ trong transaction, gọi `sp_CreateOrder` đúng tên/tham số và TVP `dbo.OrderItemInput`; procedure kiểm tra sách/tồn và tính tiền từ DB. Giữ cách gọi procedure cũ cho schema cũ.
- Schema mới lưu đủ địa chỉ vào JSON có dấu phiên bản trong shipping_address; mapper đọc lại thành các trường địa chỉ FE, vẫn đọc địa chỉ dạng chuỗi của đơn cũ.
- Chuẩn hóa bank từ FE thành bank_transfer cho schema mới; trả item đơn đầy đủ theo số tiền DB. Lấy đơn/đổi trạng thái cũng dùng đúng cột/procedure của schema mới.
- FE hydrate array/book_id thành bookId string, chặn NaN/ID/số lượng không hợp lệ trước khi JSON hóa. Không cho thêm sách có ID dự phòng không phải số vào giỏ.
- Nút đặt hàng bị vô hiệu hóa khi đang gửi để tránh bấm lặp.

Không dựng lại DB hoặc tạo thêm cột cho phần sửa checkout này. Không sửa CRUD sách admin, kho hoặc các chức năng ngoài luồng liên quan.

## Kiểm tra

- API books/service đọc DB thật: 18 sách có ID số; detail có stock/discount phù hợp.
- `npm run test:checkout:db` tại BE: cart → order → list riêng user → stock giảm → shipping/confirm → tạo đơn tiếp/hủy hoàn kho → giỏ rỗng, PASS. Dùng SQL thật trong transaction test ngoài và rollback; không lưu đơn/tài khoản thử lâu dài.
- 4 test FE cartApi: tái hiện NaN→null, chặn trước HTTP, map response, wrapper/giỏ rỗng, số lượng sai.
- 2 test CheckoutPage: không gửi lặp trong khi chờ; lỗi giữ giỏ và mở lại nút, thành công mới xóa giỏ/chuyển trang.
- Build BE/FE được kiểm tra; chưa chạy browser E2E hoặc stress checkout đồng thời.

## Sử dụng sau cập nhật

Khởi động lại BE nếu server chưa tự reload; tải lại FE để lấy catalog từ DB thật. Giỏ cũ chứa ISBN/tên của dữ liệu dự phòng không có ID DB đáng tin cậy: chọn lại sách từ danh sách hiện tại trước khi thanh toán. Không ánh xạ ISBN/tên thành ID bằng cách đoán, và không tự xóa localStorage của người dùng trong lần sửa này.
