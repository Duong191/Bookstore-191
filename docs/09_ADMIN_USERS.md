# ADMIN quản lý tài khoản — 14/10/2026

Trang **`/admin/users`** có danh sách, tìm email/họ tên/điện thoại, lọc role/trạng thái, phân trang 20 dòng; thêm tài khoản, sửa hồ sơ, đổi quyền, khóa/mở khóa và xóa mềm. Menu và route FE chỉ dành cho ADMIN; BE là nơi quyết định quyền cuối cùng.

## API

Base URL hiện tại: `http://localhost:3001/api`. Tất cả endpoint dưới đây cần `Authorization: Bearer <accessToken>` và **role admin**. STAFF/USER trả 403, không token trả 401.

| Method | Endpoint | Input | Response thành công |
|---|---|---|---|
| GET | `/admin/users` | Query search, role, isActive (`true`/`false`), page, limit (1–100) | 200 `{ items, meta: { page, limit, total } }` |
| GET | `/admin/users/:id` | ID nguyên dương | 200 `{ item }` |
| POST | `/admin/users` | email, password, firstName, lastName; optional phone, role, isActive | 201 `{ item }` |
| PATCH | `/admin/users/:id` | firstName, lastName, phone, gender, birthDate, avatarUrl, isActive; ít nhất một field | 200 `{ item }` |
| PATCH | `/admin/users/:id/role` | `{ role: "user" \| "staff" \| "admin" }` | 200 `{ item }` |
| PATCH | `/admin/users/:id/status` | `{ isActive: true/false }` | 200 `{ item }` |
| DELETE | `/admin/users/:id` | ID | 204, không body |

Tạo mới yêu cầu mật khẩu ít nhất 6 ký tự, tối đa 72 byte UTF-8 theo giới hạn bcrypt. Không tạo mật khẩu mặc định dùng chung. Email được trim/lowercase và kiểm tra trùng cả bản ghi đã xóa mềm. Role mặc định user, trạng thái mặc định active; email không sửa qua PATCH hồ sơ.

```json
{
  "email": "staff.new@example.com",
  "password": "ReplaceWithYourPassword123",
  "firstName": "Nguyễn",
  "lastName": "An",
  "phone": "0900000000",
  "role": "staff",
  "isActive": true
}
```

`item` gồm id (string), email, firstName, lastName, name, phone, gender, birthDate (`YYYY-MM-DD` hoặc null), avatarUrl, role, isActive, createdAt, updatedAt. Không có password, password_hash, token hoặc dữ liệu đơn hàng trong response tài khoản.

Body không nhận field lạ. Không thể gửi role/password/email qua PATCH hồ sơ. BirthDate phải là ngày thật; gửi null có thể xóa birthDate/gender/avatarUrl. ID/query/body không hợp lệ trả 400; không tìm thấy user chưa xóa trả 404; email trùng hoặc vi phạm bảo vệ admin trả 409; lỗi JSON theo `{ message }`.

## Flow để vấn đáp

```txt
FE /admin/users
→ AdminUsersPage.tsx (form/bảng)
→ useAdminUsers.ts (tải lại, trạng thái busy/error, đồng bộ quyền của chính mình)
→ usersApi.ts → httpClient.ts (Bearer và refresh hiện có)
→ app.ts /api → routes/index.ts /admin → admin.routes.ts
→ authMiddleware + checkPermission(admin/staff) của nhóm admin
→ checkPermission(admin) riêng cho /users
→ adminUsers.routes.ts + validators/adminUsers.schemas.ts
→ adminUsers.controller.ts parse dữ liệu chuẩn hóa
→ adminUsers.service.ts query users/roles/user_roles
→ controller trả { items, meta } / { item } / 204
```

Các thao tác ghi:

1. Bắt đầu transaction, lấy `sys.sp_getapplock` Exclusive với resource `bookarazi:admin-users`, lock owner Transaction.
2. Kiểm tra lại actor vẫn là ADMIN active trong transaction, tránh dùng quyền đã bị request khác thu hồi.
3. Đọc target, bảo vệ ADMIN active cuối cùng khi hạ quyền/khóa/xóa, kể cả PATCH hồ sơ có isActive.
4. Tạo user: bcrypt hash 10 rounds, INSERT users và user_roles cùng transaction. Đổi role: thay các liên kết role cũ bằng một role được chọn.
5. Khóa/đổi role/xóa: xóa refresh_tokens tương ứng; middleware tải trạng thái/quyền DB ở lần xác thực tiếp theo nên JWT cũ không vượt qua việc khóa hoặc hạ quyền.
6. Xóa mềm: UPDATE is_deleted=1, is_active=0, deleted_at; không DELETE row users, không tác động orders/order_items.
7. Commit hoặc rollback. Khóa được giải phóng khi transaction kết thúc; timeout lấy khóa trả 409 để thử lại.

Không được xóa chính mình. Có thể tự hạ quyền/tự khóa khi vẫn còn ADMIN active khác; FE sẽ đăng xuất phiên hiện tại và yêu cầu đăng nhập lại. Khi sửa hồ sơ chính mình, hook đồng bộ tên/ảnh/ngày sinh vào context.

Lưu ý: việc xóa bản ghi refresh dùng cơ chế hiện có. Refresh service cũ chưa kiểm tra bản ghi token bị xóa; tài khoản đang khóa vẫn bị chặn vì nó kiểm tra user active, nhưng không khẳng định đã có cơ chế thu hồi vĩnh viễn từng token sau mở khóa. Luồng reset mật khẩu demo và các lỗi khác trong báo cáo cũ thuộc công việc riêng.

## Tương thích DB và thay đổi kèm theo

- Kiểm tra DB thực tế bằng SELECT metadata: role hiện có admin/staff/**customer**, các cột gender/birth_date đã có. Không dựng lại database, không đổi tên role.
- API giữ user/staff/admin. Khi lưu role user, service chọn role user nếu có, nếu không chọn customer. `rbac.service.ts` trả customer thành user; đăng ký vẫn tạo tài khoản khách và hỗ trợ hai tên role này, không cấp quyền quản trị khi đăng ký.
- `ensureDefaultAdmin()` giữ chức năng bootstrap tài khoản chưa có; tài khoản mặc định đã tồn tại được giữ nguyên quyền/trạng thái, không tự mở khóa hoặc phục hồi role sau restart.
- `order.service.ts` không còn dùng permission orders.read để coi khách là quản trị xem mọi đơn; admin/staff hoặc orders.update vẫn có quyền quản trị như trước.
- Dùng bảng hiện có; không cần migration trên DB đã kiểm tra. Nếu dựng lại bằng SQL gốc thiếu cột gender/birth_date, chạy [BE/admin-users-compatibility.sql](../BE/admin-users-compatibility.sql) sau khi tạo DB. Script chỉ thêm cột chưa tồn tại, không xóa dữ liệu/role.
- Các bất tương thích sách/kho/đơn giữa hai bộ SQL trong báo cáo cũ không nằm trong phần bổ sung tài khoản này.

## Kiểm tra

Các kiểm tra đã chạy:

| Kiểm tra | Kết quả |
|---|---|
| BE `npm run build` | PASS |
| BE `npm run test:admin-users` | 8 nhóm HTTP/auth/validation PASS; dùng service stub, không ghi DB |
| BE `npm run test:admin-users:db` | 6 nhóm SQL integration PASS; dùng SQL thật trong transaction ngoài, rollback toàn bộ dữ liệu thử |
| FE TypeScript `tsc --noEmit` | PASS |
| FE `npm run build` | PASS; còn cảnh báo hooks ở các trang hiện có |
| FE `npm test -- --watchAll=false --runInBand --testPathPattern=AdminUsers` | 8 test form/role/status/delete và hook PASS |
| HTTP GET list qua DB thật | ADMIN 200, STAFF/customer 403; response không chứa mật khẩu/hash; customer được ánh xạ thành user |

SQL integration kiểm tra bcrypt hash, email trùng, tìm kiếm/lọc, cập nhật/null field, đổi role, refresh bị xóa, xóa mềm vẫn giữ order thử, tự xóa bị chặn, admin cuối cùng bị bảo vệ và actor vừa mất quyền bị chặn. Transaction service được chuyển thành savepoint dưới transaction test để không commit dữ liệu thử; đây không phải test commit production hoặc kiểm thử nhiều server đồng thời.

Hook test kiểm tra response trang cũ không ghi đè trang mới, hồ sơ chính mình cập nhật context, tự hạ quyền đăng xuất và lỗi API không bị báo thành công. Truy vấn sau test xác nhận không còn tài khoản `@admin-users-test.invalid` trong DB.

Trước demo, kiểm tra thêm bằng trình duyệt/Postman:

- Đăng ký từ màn hình khách rồi đăng nhập admin, tài khoản mới xuất hiện trong bảng.
- Tạo USER/STAFF/ADMIN, đăng nhập và thử quyền thực tế từng tài khoản.
- Khóa một tài khoản đang đăng nhập: request tiếp theo bị 401; mở khóa và đăng nhập lại.
- Đổi role: JWT cũ bị áp dụng quyền DB mới ở request tiếp theo.
- Hai ADMIN cùng thay đổi role/status: giữ ít nhất một ADMIN active, hiển thị lỗi 409 khi xung đột.
- Khóa/hạ quyền admin mặc định rồi restart server: trạng thái không bị phục hồi.
- Reload, phân trang, lọc danh sách, mở form sửa và kiểm tra dữ liệu DB sau lưu; kiểm tra hiển thị trên màn hình nhỏ.

Chưa chạy browser E2E, stress đồng thời hoặc restart server đang dùng trong workspace. Các test dữ liệu thử đã rollback; không tạo tài khoản mới lâu dài cho người dùng trong lần triển khai này.
