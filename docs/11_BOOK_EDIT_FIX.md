# Sửa lưu thông tin sách — 14/10/2026

## Nguyên nhân

- API sửa sách dùng các cột schema cũ (stock, discount, publish_date...) trong khi DB hiện tại dùng stock_quantity, discount_percent, publication_year. Vì vậy UPDATE có thể thất bại trước khi lưu ảnh.
- Backend chưa ghi pages/language/tags; context FE chưa gửi tags/format/chỉ số từ form tới API và có đoạn merge dữ liệu form vào state dù chưa lưu DB.
- GET list/detail chỉ trả ảnh đầu; mapper FE cũng tạo gallery từ một ảnh, làm mất thông tin ảnh phụ khi mở form.
- Context bắt lỗi update trả null nhưng form vẫn báo thành công và chuyển trang.
- Bootstrap còn có thể thay ảnh API bằng ảnh seed, kể cả ảnh admin đã xóa/thay.

## Thay đổi

- CRUD sách chọn cột theo hai schema hiện có. Tạo sách trên schema mới có slug, sửa sách không thay slug cũ. Xóa mềm dùng cột thực tế.
- Sách, book_images và book_tags lưu trong cùng transaction. Tags trên schema mới dùng tags + book_tags(tag_id); schema cũ lưu book_tags.tag.
- Lưu pages, language, năm xuất bản và các trường form có cột tương ứng; format ánh xạ cover_type trên schema mới.
- GET list/detail trả toàn gallery và tags cùng pages. FE giữ đầy đủ dữ liệu này khi map API và tải detail mới lúc mở form.
- Field không gửi được giữ nguyên; images=[]/tags=[] xóa toàn bộ liên kết; pages=null xóa số trang. Mảng images được ưu tiên hơn alias image để không phục hồi ảnh cũ.
- FE gửi đủ field qua buildAdminBookPayload, cập nhật context bằng response BE, chỉ báo thành công/chuyển trang sau khi API thành công; lỗi giữ form và nội dung đã nhập.
- Không thay ảnh API bằng ảnh seed khi reload. Cờ Xu hướng bị vô hiệu hóa ở schema hiện tại vì chưa có cột; không báo đã lưu một cờ không được hỗ trợ.
- POST/PUT có Zod kiểm tra field, giá/tồn/pages, tags/ảnh, cờ boolean và ngày; URL ảnh tối đa 500 ký tự theo giới hạn chung của hai schema. Backend lưu đường dẫn ảnh, không có upload file trong phần sửa này.

Không thay đổi schema DB cho phần sửa này.

## Kiểm tra

- BE `npm run test:books:db`: SQL thật cập nhật/tạo sách, nhiều ảnh, pages/tags; đọc lại bằng detail và list; cập nhật một field giữ các field khác; xóa arrays; lỗi khi lưu tags sau khi đã cập nhật sách/ảnh phải rollback toàn bộ; soft delete. Dữ liệu thử luôn rollback.
- Test FE payload/mapper xác nhận tags/format/pages/gallery được gửi/đọc đủ, arrays rỗng không lấy lại ảnh cũ.
- Test form xác nhận tải detail, gửi nội dung mới và chỉ chuyển trang khi thành công; lỗi giữ form và không báo thành công.
- Chạy lại test FE và build BE/FE. Chưa chạy browser E2E với một lần lưu lâu dài trên sách thật của người dùng.

Sau cập nhật, khởi động lại BE nếu chưa tự reload, tải lại FE và mở lại form sửa để lấy đủ ảnh/tags từ API hiện tại.
