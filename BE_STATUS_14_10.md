# Báo cáo Backend ngày 14/10

Ngày kiểm tra: **14/10/2026**. Báo cáo dựa trên mã nguồn hiện có trong workspace, bao gồm các thay đổi chưa commit.

> Đây là báo cáo tại thời điểm **trước khi bổ sung quản lý tài khoản**. Phần ADMIN quản lý user/role/status đã được triển khai sau đó; quyền `orders.read` không còn cho xem mọi đơn, bootstrap không mở khóa/cấp lại admin cũ. Xem [tài liệu bổ sung và kết quả test](./docs/09_ADMIN_USERS.md). Các vấn đề khác trong báo cáo không tự được coi là đã sửa.

**Quy ước:** “Đã có” nghĩa là đã tìm thấy code xử lý; **không đồng nghĩa API đã chạy thành công với DB thực tế**. Những luồng phụ thuộc DB/FE đều **cần test lại**. Đã chạy `npm run build` tại `BE`: **PASS**, thực chất là `tsc -p tsconfig.json --noEmit`. Chưa chạy server, gọi API nghiệp vụ, kết nối DB hoặc thực thi SQL/seed trong lần rà soát này. Không sửa code BE/FE.

## 1. Tổng quan Backend

- Node.js, Express **5**, TypeScript; package dùng CommonJS, TypeScript kiểm tra strict.
- SQL Server qua `mssql`; dùng query có tham số, transaction, stored procedure và view. Không thấy ORM trong BE.
- JWT access/refresh token, bcryptjs để hash/so sánh mật khẩu, Zod để kiểm tra một số request.
- Kiến trúc Route → Middleware → Controller → Service → SQL Server. Nghiệp vụ tạo đơn, đổi trạng thái và kho còn nằm trong stored procedure.
- `app.ts`: CORS, JSON parser, cookie parser, `GET /`, mount `/api`, xử lý 404/lỗi tập trung. Cookie parser có cài nhưng auth thực tế dùng Bearer token và refresh token trong JSON body.
- `server.ts`: kiểm tra DB → `ensureDefaultAdmin()` → mở cổng, mặc định **3001**. Kết nối/bootstrap lỗi thì thoát tiến trình. Bootstrap có thể tạo hoặc kích hoạt lại admin mặc định.
- `.env.example` có cấu hình SQL authentication/Windows NTLM, server/port/instance, TLS, CORS và JWT. `env.ts` còn hỗ trợ `NODE_ENV`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`; các biến này chưa được liệt kê trong file mẫu.

### Phạm vi đã kiểm tra

| Nhóm | File/thư mục đã đối chiếu |
|---|---|
| Mã nguồn BE | Toàn bộ file trong `BE/src/routes`, `controllers`, `services`, `middlewares`, `config`, `utils`; `app.ts`, `server.ts`, `types.ts`, `express.d.ts` |
| Cấu hình và tiện ích | `BE/package.json`, `BE/tsconfig.json`, `BE/.env.example`; các script trong `BE/src/scripts` để xác định cách kiểm tra DB, seed, sửa ảnh |
| SQL chính | `BE/SQLQuery1.sql`: bảng, index, trigger, procedure, view, seed RBAC; `DB_bookstore.sql`: cấu trúc, procedure, view, seed và phần bổ sung cuối file |
| SQL bổ sung | `BE/fix-refresh-token-column.sql`, `BE/reset-dev-users.sql`, `BE/reset-dev-users-safe.sql`; đối chiếu cấu trúc batch/câu lệnh của `seed-books.sql`, `seed-recovered-books.sql`, `fix-existing-book-images.sql` |
| Tài liệu | `BE/api.md`, `BE/API_DB_MAPPING.md`, `README.md`, `docs/01_MVP_SCOPE_AND_ACCEPTANCE.md`, `docs/03_API_CONTRACT_MVP.md`, `docs/05_TEST_PLAN.md`, `docs/08_BACKEND_CORE_STATUS.md` |
| Liên quan FE | `FE/src/api/*`, các đoạn tích hợp trong `FE/src/context/BookstoreContext.tsx`, `FE/src/services/dataBootstrapService.ts`, `booksService.ts`, trang dashboard/form sách admin; đối chiếu thao tác trạng thái đơn |

**Lưu ý schema:** Có **hai bộ SQL không tương thích hoàn toàn**. BE đang query theo tên cột/procedure của `BE/SQLQuery1.sql`. File gốc `DB_bookstore.sql` có nhiều tên khác và có bảng blog/review, nhưng điều đó không làm các API tương ứng tự hoạt động. Chưa xác định DB đang chạy đã áp dụng bộ SQL hoặc migration nào.

## 2. Các module Backend đã có

Các tên file trong bảng tương đối với `BE/src`.

| Module | Route | Controller | Service | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| Auth | `routes/auth.routes.ts` | `auth.controller.ts` | `auth.service.ts` | Đã có; cần test lại | Register/login/refresh/logout/reset-password; có lỗi bảo mật cần ưu tiên |
| User | `routes/users.routes.ts` | `user.controller.ts` | `user.service.ts` | Đã có một phần | Chỉ hồ sơ hiện tại, chưa có CRUD user admin |
| Book | `routes/books.routes.ts`, `admin.routes.ts` | `book.controller.ts` | `book.service.ts` | Đã có | List/detail/create/update/soft-delete, URL ảnh |
| Category | `routes/categories.routes.ts` | `category.controller.ts` | `category.service.ts` | Đã có một phần | Chỉ đọc; menu con hardcode, chưa truy vấn cây cha/con |
| Cart | `routes/cart.routes.ts` | `cart.controller.ts` | `cart.service.ts` | Đã có một phần | GET/PUT toàn giỏ; chưa thể gửi giỏ rỗng |
| Order | `routes/orders.routes.ts` | `order.controller.ts` | `order.service.ts` | Đã có; có lỗi quyền cần sửa | Tạo/list/status/confirm-received; dựa vào procedure |
| Inventory | `routes/admin.routes.ts` | `inventory.controller.ts` | `inventory.service.ts` | Đã có; có lỗi đối chiếu SQL | Tổng hợp, lịch sử, nhập/xuất/điều chỉnh |
| Admin Stats | `routes/admin.routes.ts` | `adminStats.controller.ts` | `user.service.ts` | Một phần | Chỉ `{ totalUsers }`; không có service stats riêng nhưng có service xử lý |
| Health check | `routes/index.ts`, `app.ts` | `health.controller.ts` | `health.service.ts` | Đã có | App health và `SELECT 1` kiểm tra DB |
| RBAC / Permission | Dùng chung tại route bảo vệ | Không có controller riêng | `rbac.service.ts` | Có cơ chế, chưa có API quản lý | `authMiddleware.ts`, `checkPermission.ts`; kiểm tra role hoặc permission theo OR |

Ngoài ra có **8 route blog/review trả 501**, dùng `unsupported.controller.ts`, chưa có service nghiệp vụ.

## 3. Các chức năng đã làm được

### 3.1 Auth / Đăng nhập / Phân quyền

- Đăng ký: validate email/password tối thiểu 6 ký tự/tên, chuẩn hóa email, kiểm tra trùng, bcrypt 10 rounds, transaction tạo `users` và gán role `user`, rồi đăng nhập để trả token.
- Đăng nhập: tìm user đang active, chưa bị xóa; so sánh bcrypt; lấy roles/permissions từ DB; trả `accessToken`, `refreshToken`, `user`, `roles`, `permissions`.
- JWT ký/verify tại `utils/jwt.ts`; thời hạn mặc định access **15 phút**, refresh **7 ngày**. Refresh có `jti` ngẫu nhiên. Lưu refresh bằng SHA-256 nếu có cột `token_hash`, nếu không dùng cột `token` cũ.
- `authMiddleware`: đọc Bearer JWT, verify, tải lại quyền và trạng thái user từ DB mỗi request. Không token/token sai/hết hạn thông thường trả **401**. `checkPermission`: thiếu user trả 401, không thỏa quyền trả **403**; admin bypass, các yêu cầu trong mảng là **OR**.
- Role thực tế trong code/SQL cũ là chữ thường `admin`, `staff`, `user`. SQL gốc mới seed `customer` thay `user`, cần đồng bộ.
- `/users/*`, `/orders/*`, `/admin/*` cần access token; `/admin/*` chấp nhận **admin hoặc staff**, kể cả xóa sách. Đổi trạng thái đơn còn chấp nhận permission `orders.update`.
- Refresh chỉ verify JWT và kiểm tra user còn hợp lệ; **chưa tra bản ghi refresh trong DB**. Logout xóa bản ghi nhưng token refresh còn hạn vẫn có thể dùng lại theo code hiện tại.
- Reset password đã có route public, chỉ cần email là đặt lại mật khẩu mặc định `1`; **đây là hành vi demo không có xác minh chủ tài khoản**, chưa phải luồng quên mật khẩu hoàn chỉnh.
- Hồ sơ: GET/PATCH `/users/me`; có tên, điện thoại, giới tính, ngày sinh, avatar. Địa chỉ trong mapper luôn rỗng, chưa lưu địa chỉ; chưa có đổi mật khẩu bằng mật khẩu cũ hoặc API quản lý role/user.

### 3.2 Quản lý sách

- Public list chỉ lấy sách active, chưa xóa; tìm theo tiêu đề/tác giả, lọc đúng `categoryId`, phân trang `page`/`limit` tối đa 100; thứ tự cố định `created_at DESC`.
- Detail theo ID trả object trực tiếp, 404 nếu không tồn tại/đã xóa; **chưa lọc `is_active` như list**.
- Admin/staff thêm sách, sửa một phần qua PUT, xóa mềm bằng `is_deleted`/`deleted_at`.
- Có ghi ảnh URL vào `book_images`, ảnh đầu là primary; thay ảnh có transaction riêng. List/detail chỉ trả **một** `image_url`, chưa trả cả gallery; chưa có API upload file ảnh hay static hosting ảnh trong BE.
- Có hỗ trợ giá, giảm giá, tồn, ISBN, publisher, publishDate, description, featured/bestseller/trending/isNew. Create có `importPrice`, update chưa cập nhật trường này. `pages`/`language` được FE gửi nhưng service create/update chưa ghi; tags và nhiều trường mở rộng trên form cũng chưa có luồng lưu đầy đủ.
- Query không hỗ trợ lọc giá/rating, sort tùy chọn hoặc tự bao gồm danh mục con; các thao tác này hiện có phần thực hiện ở FE.

### 3.3 Danh mục sách

- `GET /categories`: danh sách active gồm `id`, `name`, `slug`, `icon`.
- `GET /categories/detailed`: đọc danh mục rồi ghép `subCategories` từ map hardcode theo slug, có link `/shop?...` với ID cố định.
- SQL có `parent_id`, nhưng service không dùng để tạo cây; không có API thêm/sửa/xóa danh mục. Không dùng `v_category_performance` như tài liệu mapping cũ mô tả.

### 3.4 Giỏ hàng

- Hỗ trợ danh tính user từ Bearer hoặc khách từ `X-Guest-Session`. Có Bearer thì phải verify; thiếu cả hai trả 400.
- GET tìm hoặc **tạo** giỏ, trả mảng dòng `book_id`, title, price, discount, quantity, line_total.
- PUT nhận `{ items: [{ bookId, quantity }] }`, xóa item cũ rồi ghi lại toàn bộ trong transaction; kiểm tra sách active/chưa xóa, số lượng không vượt tồn. Lỗi thì rollback.
- Thêm/cập nhật/xóa một dòng được biểu diễn bằng gửi lại danh sách mới; **không có POST/DELETE riêng từng item**.
- Route yêu cầu `items.min(1)` và quantity dương, vì vậy **không thể xóa dòng cuối/xóa toàn giỏ qua PUT**. Checkout có xóa giỏ trong procedure.
- FE `cartApi.ts` lại đọc `{ items }` và model camelCase, trong khi BE trả mảng snake_case. Đây là lệch hợp đồng thật; FE có localStorage/fallback nên giao diện có dữ liệu chưa chứng minh DB đã đồng bộ. Guest cart trong context hiện chủ yếu lưu localStorage.

### 3.5 Đơn hàng

- Tạo đơn cần login, body chứa thông tin nhận hàng dạng phẳng; service gọi `sp_create_order`, lấy item từ **giỏ DB của user**, không lấy `items` trong request tạo đơn. Response **201 `{ orderId }`**.
- Theo `BE/SQLQuery1.sql`, procedure kiểm tra giỏ/tồn, tính tiền từ giá và giảm giá DB, tạo order/items, trừ tồn, tăng `sold_count`, ghi giao dịch kho/lịch sử, xóa giỏ và commit; lỗi rollback.
- GET dùng chung cho khách/quản trị, trả `{ data, meta }`, mỗi đơn có items và địa chỉ theo model FE. Nhánh khách lọc `user_id`, nhánh quản trị xem mọi đơn.
- **Lỗi quyền:** `isOrderAdmin()` xem người có `orders.read` là quản trị; SQL cũ cấp `orders.read` cho role `user`. Với seed này, user thường đi vào nhánh xem mọi đơn, gồm thông tin nhận hàng. Chưa thể kết luận cách ly đơn đã đúng.
- PATCH status cho admin/staff/`orders.update`; nhận `pending`, `confirmed`, `processing`, `shipping`, `completed`, `cancelled`. SQL cũ chặn sửa đơn đã completed/cancelled nhưng chưa áp đặt toàn bộ thứ tự chuyển trạng thái.
- Khách xác nhận nhận hàng: kiểm tra chủ đơn và trạng thái `shipping`, rồi đổi thành `completed`. Không có API hủy đơn riêng cho khách; quản trị hủy qua status `cancelled`, procedure hoàn kho, giảm sold_count, ghi log.
- Chưa có GET chi tiết đơn theo ID, API đọc lịch sử trạng thái, tìm/lọc đơn theo trạng thái, hoặc tích hợp thanh toán thực tế. Lưu `paymentMethod` chưa phải xử lý thanh toán.

### 3.6 Nhập/xuất kho

- Có GET tổng hợp từ `v_inventory_summary`, GET lịch sử từ `inventory_transactions` và POST gọi `sp_inventory_transaction`.
- Lịch sử có phân trang riêng: mặc định 200, tối đa 500, tên người tạo; response `{ items, meta }`. Mapper quy `order` thành export, `adjustment` theo dấu; không trả loại gốc/reference đơn ra FE.
- SQL cũ ghi log và cập nhật `stock = stock + quantity` trong transaction; kiểm tra khác 0, sách tồn tại, đủ tồn khi export/adjustment âm. Có thể cập nhật giá nhập và supplier.
- **Dấu quantity là bắt buộc theo cách code đang chạy:** import dương, export âm. FE context đã đổi export thành số âm, nhưng BE chưa ép quan hệ giữa type và dấu. Gửi export dương có thể làm tăng tồn.
- GET tổng hợp đang `ORDER BY total_stock`, trong khi view SQL cũ có `current_stock`; cần sửa/đồng bộ trước khi coi endpoint này dùng được.
- Chỉnh `stock` trực tiếp qua CRUD sách không ghi lịch sử kho, nên tổng log và tồn có thể không đối soát được.

### 3.7 Admin Dashboard / Thống kê

- `GET /admin/stats` chỉ trả `{ totalUsers }` qua `userService.countActiveUsers()`.
- Query thực tế đếm `is_deleted=0`, **không lọc `is_active=1`** dù tên hàm/chú thích nói active.
- SQL cũ có view doanh thu ngày/tháng, top sách, thống kê đơn, tồn thấp, hiệu quả danh mục; **chưa có endpoint nối các báo cáo này**.
- FE dashboard tự tính tiền/đơn/sách từ dữ liệu đã tải, cộng cả đơn hủy/chưa hoàn tất trong `salesRevenue`. List sách/đơn chỉ tải trang đầu tối đa 100, log kho tối đa 500: chưa thể coi số liệu là thống kê toàn DB.

## 4. Danh sách API Backend hiện có

Endpoint bên dưới đã ghép prefix `/api` từ `app.ts` và `routes/index.ts`. “File xử lý” là controller trong `BE/src/controllers`, trừ `app.ts`. Tất cả API có nghiệp vụ DB **cần test lại**; các dòng 501 chỉ là placeholder.

| Method | Endpoint | Mục đích | Cần token | Role yêu cầu | File xử lý |
|---|---|---|---|---|---|
| GET | `/` | Thông báo server | Không | Public | `BE/src/app.ts` |
| GET | `/api/health` | Health ứng dụng | Không | Public | `health.controller.ts` |
| GET | `/api/health/db` | Health kết nối DB | Không | Public | `health.controller.ts` |
| POST | `/api/auth/register` | Đăng ký | Không | Public | `auth.controller.ts` |
| POST | `/api/auth/login` | Đăng nhập | Không | Public | `auth.controller.ts` |
| POST | `/api/auth/refresh` | Cấp access token mới | Refresh token trong body | User còn hợp lệ | `auth.controller.ts` |
| POST | `/api/auth/logout` | Xóa refresh khỏi DB | Refresh token trong body | Không có middleware role | `auth.controller.ts` |
| POST | `/api/auth/reset-password` | Reset về mật khẩu demo | Không | Public; có rủi ro | `auth.controller.ts` |
| GET | `/api/users/me` | Hồ sơ hiện tại | Có | User hợp lệ, không hạn chế role | `user.controller.ts` |
| PATCH | `/api/users/me` | Sửa hồ sơ hiện tại | Có | User hợp lệ, không hạn chế role | `user.controller.ts` |
| GET | `/api/books` | List/tìm kiếm/lọc/phân trang | Không | Public | `book.controller.ts` |
| GET | `/api/books/:id` | Chi tiết sách | Không | Public | `book.controller.ts` |
| GET | `/api/categories` | Danh mục | Không | Public | `category.controller.ts` |
| GET | `/api/categories/detailed` | Menu danh mục mở rộng | Không | Public | `category.controller.ts` |
| GET | `/api/cart` | Lấy/tạo giỏ | Bearer hoặc guest header | User/guest | `cart.controller.ts` |
| PUT | `/api/cart` | Thay toàn bộ item giỏ | Bearer hoặc guest header | User/guest | `cart.controller.ts` |
| POST | `/api/orders` | Tạo đơn từ giỏ DB | Có | User hợp lệ | `order.controller.ts` |
| GET | `/api/orders` | Đơn cá nhân hoặc mọi đơn | Có | Nhánh mọi đơn: admin/staff hoặc orders.read/orders.update; xem lỗi mục 6 | `order.controller.ts` |
| POST | `/api/orders/:id/confirm-received` | Xác nhận nhận hàng | Có | Chủ đơn đang shipping | `order.controller.ts` |
| PATCH | `/api/orders/:id/status` | Đổi trạng thái/hủy đơn | Có | admin/staff hoặc orders.update | `order.controller.ts` |
| GET | `/api/admin/stats` | Tổng user chưa xóa | Có | admin/staff | `adminStats.controller.ts` |
| POST | `/api/admin/books` | Thêm sách | Có | admin/staff | `book.controller.ts` |
| PUT | `/api/admin/books/:id` | Sửa sách | Có | admin/staff | `book.controller.ts` |
| DELETE | `/api/admin/books/:id` | Xóa mềm sách | Có | admin/staff | `book.controller.ts` |
| GET | `/api/admin/inventory` | Tổng hợp tồn | Có | admin/staff | `inventory.controller.ts` |
| GET | `/api/admin/inventory/transactions` | Lịch sử kho | Có | admin/staff | `inventory.controller.ts` |
| POST | `/api/admin/inventory` | Nhập/xuất/điều chỉnh | Có | admin/staff | `inventory.controller.ts` |
| GET | `/api/blogs` | Placeholder, trả 501 | Không | Không kiểm tra | `unsupported.controller.ts` |
| GET | `/api/blogs/:id` | Placeholder, trả 501 | Không | Không kiểm tra | `unsupported.controller.ts` |
| POST | `/api/blogs` | Placeholder, trả 501 | Không | Chưa gắn auth/permission | `unsupported.controller.ts` |
| PUT | `/api/blogs/:id` | Placeholder, trả 501 | Không | Chưa gắn auth/permission | `unsupported.controller.ts` |
| DELETE | `/api/blogs/:id` | Placeholder, trả 501 | Không | Chưa gắn auth/permission | `unsupported.controller.ts` |
| GET | `/api/books/:bookId/reviews` | Placeholder, trả 501 | Không | Không kiểm tra | `unsupported.controller.ts` |
| POST | `/api/books/:bookId/reviews` | Placeholder, trả 501 | Không | Chưa gắn auth/permission | `unsupported.controller.ts` |
| DELETE | `/api/books/:bookId/reviews/:reviewId` | Placeholder, trả 501 | Không | Chưa gắn auth/permission | `unsupported.controller.ts` |

Không có route nghiệp vụ chính nào gọi một service bị thiếu. Trường hợp **có route nhưng chưa có service** là blog/review; health đơn giản và trang gốc không cần service DB. Bảng phản ánh middleware thực tế, không lấy quyền ghi trong `api.md` làm bằng chứng.

## 5. Luồng code Backend chính

Chi tiết dùng khi vấn đáp: [BE_FLOW_GUIDE.md](./BE_FLOW_GUIDE.md).

### 5.1 Luồng đăng nhập

`POST /api/auth/login` → `routes/auth.routes.ts` → Zod validate → `auth.controller.login` → `auth.service.login` chuẩn hóa email/query user/so bcrypt → `rbac.service.getUserAuthData` đọc role/permission → `utils/jwt.ts` ký token → lưu refresh trong DB → mapper user → trả 200 user + token + quyền.

### 5.2 Luồng thêm sách admin

`POST /api/admin/books` → `routes/admin.routes.ts` → `authMiddleware` → `checkPermission([admin, staff])` → validate body → `book.controller.createBook` → `book.service.createBook` insert `books` → nếu có ảnh gọi `replaceBookImages` ghi `book_images` → đọc sách mới → trả 201. Insert sách và transaction ảnh **chưa nằm trong cùng transaction**.

### 5.3 Luồng nhập/xuất kho

`POST /api/admin/inventory` → auth + quyền admin/staff + validate → `inventory.controller.createInventoryTransaction` lấy `createdBy` từ JWT user → `inventory.service.createInventoryTransaction` → SQL `sp_inventory_transaction` kiểm tra tồn, ghi log, cộng quantity vào tồn, commit/rollback → trả 201 message → FE tải lại sách và lịch sử. Với SQL cũ, xuất phải gửi quantity âm.

### 5.4 Luồng cập nhật trạng thái đơn hàng

`PATCH /api/orders/:id/status` → auth + quyền admin/staff/`orders.update` + validate → `order.controller.updateOrderStatus` → `order.service.updateOrderStatus` kiểm tra danh sách status → SQL `sp_update_order_status` cập nhật đơn/lịch sử, hoàn kho nếu hủy → trả 204 → FE gọi GET đơn để lấy trạng thái mới. Không có WebSocket/SSE; màn hình khách cần tải lại dữ liệu, chưa có push trạng thái tức thời.

## 6. Những phần Backend còn thiếu hoặc cần kiểm tra lại

Mức **Rất cao/Cao** cần xử lý trước nghiệm thu luồng liên quan. “Xác nhận từ code” là bằng chứng đọc mã nguồn, chưa phải kết quả tái hiện trên DB đang chạy.

| Vấn đề | Mức độ | File liên quan | Ghi chú |
|---|---|---|---|
| User thường có thể xem mọi đơn theo seed cũ | Rất cao | `order.service.ts:isOrderAdmin`; `BE/SQLQuery1.sql` seed role user | `orders.read` được cấp cho user nhưng service xem là quyền quản trị. Có thể lộ tên/điện thoại/địa chỉ đơn người khác; xác nhận từ code, cần test 2 user |
| Reset mật khẩu không xác minh chủ email | Rất cao | `auth.routes.ts`, `auth.service.ts:resetPasswordToDefault` | Public endpoint đổi mật khẩu về `1`; chưa OTP/token reset/email xác minh, không giới hạn theo môi trường |
| Logout/reset chưa thu hồi được refresh JWT | Cao | `auth.service.ts:refresh/logout/resetPasswordToDefault`, `utils/jwt.ts` | Refresh không kiểm tra DB, expires_at/revoked_at; xóa bản ghi chưa chặn token còn hạn. DB expiry ghi cứng 7 ngày dù JWT configurable |
| Hai schema SQL khác nhau | Cao | `BE/SQLQuery1.sql`, `DB_bookstore.sql`, các service | SQL mới dùng stock_quantity/discount_percent/is_featured, BE dùng stock/discount/featured; SQL mới thiếu users.gender, dù cuối file có bổ sung birth_date. Procedure mới `sp_CreateOrder`, `sp_UpdateOrderStatus`, `sp_AdjustInventory` khác tên/tham số BE; view inventory cũ không có trong SQL mới |
| Role/permission trong SQL mới không khớp code | Cao | `DB_bookstore.sql`, `auth.service.ts`, `rbac.service.ts` | Seed customer, code register tìm user; quyền kỹ thuật ở permissions.code nhưng BE đọc permissions.name (tên tiếng Việt). Không thể xem là chỉ đổi schema mà API vẫn chạy |
| Tổng hợp kho query cột không tồn tại trong SQL cũ | Cao | `inventory.service.ts:listInventory`, `BE/SQLQuery1.sql:v_inventory_summary` | `ORDER BY total_stock` nhưng view trả `current_stock`; cần kiểm tra định nghĩa view DB thực tế |
| Không ràng buộc dấu quantity theo loại kho | Cao | `admin.routes.ts`, `inventory.service.ts`, `sp_inventory_transaction` | Export dương có thể tăng tồn; import âm có thể giảm tồn. Quantity 0 qua Zod nhưng SQL báo lỗi; sách xóa mềm chưa bị chặn trong procedure |
| Không xóa được giỏ rỗng, response FE–BE lệch | Cao | `cart.routes.ts`, `cart.controller.ts`, `FE/src/api/cartApi.ts`, `BookstoreContext.tsx` | `items: []` bị 400; BE trả array/book_id, FE đọc items/bookId. Cần test reload, tab mới, đổi thiết bị và xóa dòng cuối |
| Nhận đồng thời userId/sessionId không ưu tiên user | Cao, cần test | `cart.controller.ts`, `cart.service.ts:getOrCreateCartId` | Query dùng OR và TOP 1, không ràng buộc session thuộc user; có thể chọn sai giỏ nếu cùng gửi Bearer và guest header. Chưa có luồng merge guest được xác thực rõ ràng |
| Chuyển trạng thái và thao tác đồng thời chưa chặt | Cao, cần test | `order.service.ts`, 3 procedure trong SQL cũ | Chưa có sơ đồ chuyển trạng thái đầy đủ/khóa đọc UPDLOCK-HOLDLOCK. Kiểm tra hủy đồng thời hoàn kho 2 lần, xác nhận nhận hàng đua với hủy, đặt hàng/xuất kho đồng thời; không khẳng định đã tái hiện |
| Checkout dùng sách bị ẩn/xóa sau khi vào giỏ | Cao | `BE/SQLQuery1.sql:sp_create_order` | Procedure kiểm tra tồn nhưng không kiểm tra lại is_active/is_deleted. PUT giỏ có kiểm tra nhưng sách có thể đổi trạng thái sau đó |
| Chưa có idempotency khi tạo đơn | Trung bình, cần test | `sp_create_order` | Mã đơn theo giây + user; gọi trùng cùng user có nguy cơ trùng mã, thao tác giỏ/đơn đồng thời cần kiểm tra |
| Validate thiếu và kết quả parse không được dùng | Cao/Trung bình | `validateRequest.ts`, `admin.routes.ts`, `book.service.ts`, `users.routes.ts` | PUT sách không có schema; POST chưa validate images/discount/importPrice/flags. Middleware gọi parse nhưng giữ req.body gốc, nên field ngoài schema vẫn vào service. Chưa kiểm tra đủ ID, ngày, độ dài, kiểu boolean/URL |
| Phân trang nhận NaN/số lẻ | Trung bình | `utils/pagination.ts`; list sách/đơn/kho | Không dùng Number.isFinite/kiểm tra integer; `page=abc` không tự về mặc định dù comment nói vậy. Lịch sử kho có xử lý riêng tốt hơn |
| Lỗi nghiệp vụ SQL đang thành 500 | Cao/Trung bình | `errorHandler.ts`, `utils/jwt.ts`, service order/inventory | RAISERROR thiếu tồn/giỏ rỗng/đơn không tồn tại, lỗi FK/unique, refresh JWT sai/hết hạn chưa map 4xx; JSON lỗi/body quá lớn cũng chưa được chuẩn hóa. 500 trả err.message nội bộ |
| Sách/ảnh không atomic cùng nhau; xóa không kiểm tra số dòng | Trung bình | `book.service.ts` | Lưu sách xong nhưng lưu ảnh lỗi có thể trả lỗi dù sách đã đổi. DELETE ID không tồn tại vẫn 204. Sửa stock trực tiếp bỏ qua log kho |
| Chưa lưu đầy đủ field form sách/gallery | Trung bình | `book.service.ts`, `FE/src/context/BookstoreContext.tsx`, `AdminBookEditPage.tsx`, `publicApi.ts` | pages/language không ghi; tags/format/rating/sales chưa có luồng lưu đầy đủ. Chỉ đọc ảnh đầu, có nguy cơ mất ảnh phụ khi mở form rồi lưu. URL dài bị cắt 500 ký tự |
| Dữ liệu nội bộ sách được trả public | Trung bình | `book.service.ts:listBooks/getBookById` | List trả import_price; detail SELECT b.* và không lọc active. Cần quyết định trường công khai thay vì trả cả row |
| Hồ sơ không lưu địa chỉ; ngày sinh FE chưa gửi | Trung bình | `user.service.ts`, `userMapper.ts`, `BookstoreContext.tsx:updateUserProfile` | BE bỏ qua address, mapper trả địa chỉ rỗng; FE không map birthday sang birthDate. Avatar alias được service nhận nhưng chưa nằm trong schema validate |
| Blog/review chưa triển khai | Chưa có | `routes/index.ts`, `unsupported.controller.ts` | 8 route trả 501, không service; write route chưa auth/permission. Chưa ghi dữ liệu nên không gọi là API CRUD hoạt động; SQL mới có bảng nhưng BE vẫn 501 |
| Category cha/con và CRUD chưa có | Chưa có | `category.service.ts`, `categories.routes.ts` | Menu hardcode ID dễ lệch seed. Có parent_id trong SQL không đồng nghĩa API có cây |
| Thiếu các API mở rộng | Chưa có | Toàn bộ route | Chưa có user/role/permission admin CRUD, supplier CRUD, upload ảnh, đổi mật khẩu an toàn, chi tiết/lịch sử đơn, khách tự hủy, báo cáo doanh thu, gateway thanh toán. Một số thuộc nice-to-have trong docs MVP |
| Dashboard chưa phản ánh toàn dữ liệu | Trung bình | `adminStats.controller.ts`, `user.service.ts`, FE dashboard/ordersApi/publicApi/inventoryApi | Chỉ totalUsers từ aggregate BE; FE gọi orders limit=200 nhưng BE chặn 100; bỏ metadata, không tải tiếp. Tiền đơn hủy/chưa hoàn thành vẫn bị cộng ở FE |
| Tài liệu API/setup chưa khớp | Trung bình | `BE/api.md`, `BE/API_DB_MAPPING.md`, `docs/03_API_CONTRACT_MVP.md`, `docs/08_BACKEND_CORE_STATUS.md`, `README.md` | Thiếu reset/confirm/stats/history; mô tả sai quyền placeholder, refresh DB, category view; contract dùng pageSize/items/shippingAddress object/type, code dùng limit/data/body phẳng/transactionType. README có migrate:latest/seed:run nhưng package không có; status doc còn link .js cũ |
| Cấu hình auth demo chưa tách môi trường | Cao nếu đưa lên mạng | `env.ts`, `defaultPasswordHash.ts`, `server.ts`, `auth.service.ts` | JWT secret có fallback dev, admin mới có mật khẩu đơn giản; startup kích hoạt lại admin tồn tại. Không thấy rate limit cho login/reset |
| Chưa có test nghiệp vụ tự động | Cần bổ sung | `BE/package.json`, `BE/src/scripts/testDbConnection.ts` | test:smoke chỉ gọi build; test:db chỉ probe kết nối, không chứng minh route/procedure đúng |
| Script seed cần kiểm tra riêng | Trung bình | `seed-books.sql`, `seed-recovered-books.sql`, `fix-existing-book-images.sql`, `src/scripts/applyRecoveredSeed.ts` | seed-books khai báo lặp @book_id cùng batch không có GO; các seed recovered/fix bắt lỗi rồi PRINT nên tiến trình có thể báo xong dù từng sách thất bại. Các script sửa ảnh/tên thực sự ghi DB, không phải API upload |

## 7. Gợi ý test Backend

**Chưa thực thi các case dưới đây.** Chạy trên DB thử nghiệm đã xác nhận tương thích; lưu request/response, kiểm tra dữ liệu sau thao tác và reload FE. Không dùng việc giao diện hiển thị được dữ liệu fallback làm bằng chứng API thành công.

| Nhóm/case Postman hoặc FE | Kết quả cần kiểm tra |
|---|---|
| Xác định schema và health | Xác nhận cột/procedure/view đúng với service; `/api/health` và `/api/health/db` trả 200. Health DB chỉ SELECT 1, không chứng minh schema đúng |
| Login admin đúng/sai mật khẩu | Đúng trả 200 user/token/roles; sai trả 401; thiếu body/email sai trả 400. Tài khoản thực tế phụ thuộc seed |
| Đăng ký hợp lệ/trùng email | 201 + role user; trùng 409; thử 2 request cùng email để kiểm tra unique và mã lỗi |
| Thiếu token gọi admin | GET stats, POST/PUT/DELETE books, inventory đều 401 |
| User thường gọi admin/status | 403; staff/admin đi qua đúng chính sách. STAFF hiện được DELETE sách, cần chốt có đúng yêu cầu không |
| Hai user xem đơn | Mỗi user chỉ thấy đơn mình. Với seed cũ đang có lỗi orders.read: ưu tiên tái hiện và sửa trước nghiệm thu |
| Token hết hạn/sai; refresh sau logout/reset | Access sai/hết hạn 401; refresh đã thu hồi phải bị từ chối theo yêu cầu an toàn. Code hiện tại chưa đạt phần thu hồi |
| Reset password | Không coi việc biết email rồi đổi mật khẩu thành công là pass bảo mật; cần luồng xác minh chủ tài khoản |
| Thêm sách admin | 201, xuất hiện trên list/detail sau reload; category số, giá/tồn hợp lệ, ISBN trùng/dữ liệu thiếu/ngày sai trả 4xx phù hợp |
| Sửa/xóa sách admin | PUT giữ field không gửi; ảnh thay/xóa đúng; pages/language/tags kiểm tra DB; xóa mềm không làm mất order_items cũ; thử ID không tồn tại |
| List sách/category | search/categoryId/page/limit đúng; thử page=abc, số âm/lẻ, sách inactive, category con và ID khác seed; không lấy dữ liệu local làm kết quả |
| Giỏ user/guest | Thêm/cập nhật/bỏ dòng, số lượng vượt tồn, sách đã xóa, trùng bookId; thử Bearer+session; xác nhận response array hay wrapper và book_id→bookId |
| Xóa dòng cuối/clear cart | PUT items=[] cần đồng bộ giỏ rỗng; hiện dự kiến 400 từ schema, ghi nhận lỗi; reload/tab mới không phục hồi giỏ cũ |
| Nhập kho | `transactionType=import`, quantity dương: tồn tăng đúng, log có người tạo/giá nhập, reload vẫn còn |
| Xuất kho | quantity âm trong luồng hiện tại: tồn giảm; vượt tồn không đổi stock/log. Thử export dương/import âm/0 để bắt validation thiếu |
| Tổng hợp/lịch sử kho | GET inventory kiểm tra lỗi total_stock; lịch sử đúng phân trang, export/hoàn kho đúng dấu, lịch sử không mất sau reload |
| User đặt hàng | PUT giỏ trước → POST thông tin nhận hàng phẳng → 201 orderId; giá từ DB, order/items/log/history đủ, stock giảm, giỏ DB rỗng |
| Đặt hàng lỗi/đồng thời | Giỏ rỗng, hết tồn, sách bị ẩn/xóa; 2 user tranh tồn cuối, double click checkout: không đơn rỗng/trùng, không tồn âm, transaction rollback đầy đủ |
| Admin cập nhật trạng thái | GET lại thấy status mới; trạng thái sai bị 400; completed/cancelled không đổi tiếp; chốt quy tắc chuyển từng bước |
| Hủy đơn | Hoàn kho/sold_count/log đúng một lần, kể cả 2 request đồng thời; lỗi phải rollback |
| Khách xác nhận đã nhận | Chủ đơn shipping → completed 204; đơn người khác 403; trạng thái khác 400; ID không có 404 |
| Khách xem trạng thái mới | Sau admin đổi trạng thái, reload/gọi GET đơn mới; không giả định tự realtime |
| Hồ sơ/ảnh | Lưu rồi GET/reload: tên/phone/gender/avatar/birthDate; ghi nhận address chưa lưu và gallery chỉ trả ảnh đầu |
| Dashboard dữ liệu lớn | Hơn 100 sách/đơn, hơn 500 log; đối chiếu tổng DB, loại đơn hủy và quy tắc doanh thu; inactive user có được tính hay không |
| Blog/review | Hiện nhận 501 rõ ràng; FE không hiển thị thao tác đã lưu thành công |
| Lỗi/CORS | Route lạ 404, JSON lỗi/SQL lỗi không lộ chi tiết; test origin FE thực tế, Bearer và X-Guest-Session; kiểm tra thông báo lỗi tới người dùng |

## 8. Kết luận

Backend đã có khung và code cho **Auth, hồ sơ User, Book, Category, Cart, Order, Inventory, Health, RBAC**; Admin Stats mới có tổng user. TypeScript build đã pass. Chưa đủ bằng chứng để ghi “toàn bộ Backend đã OK” hoặc “đã sẵn sàng phục vụ FE hoàn chỉnh”.

Ưu tiên tiếp theo: thống nhất schema DB → sửa quyền xem đơn/reset/refresh → sửa tổng hợp kho và dấu quantity → đồng bộ cart FE–BE → kiểm tra transaction/chuyển trạng thái → hoàn thiện validate, lỗi và tài liệu. Blog/review, category CRUD/cây, API báo cáo và chức năng mở rộng cần triển khai nếu thuộc phạm vi bàn giao.

Ghi chú có thể copy:

| Mục ngày 14/10 | Nội dung |
|---|---|
| **Đã ok** | Đã rà soát mã nguồn, có đủ tầng route/controller/service cho module chính; TypeScript build PASS. Chưa xác nhận E2E |
| **FrontEnd** | Đã nối các API chính; cần test cart response/clear/reload, trường form sách/hồ sơ, ảnh, checkout, cập nhật trạng thái và số liệu dashboard; có fallback che lỗi API |
| **Backend** | Có auth/JWT/RBAC, hồ sơ, CRUD sách, đọc category, giỏ, đơn, kho, health, totalUsers; có SQL transaction cho nghiệp vụ chính |
| **Chưa ok** | Lệch schema; quyền xem đơn; reset/thu hồi refresh; query/dấu kho; giỏ rỗng và mapping; validate/error; blog/review 501; thiếu báo cáo BE và test nghiệp vụ tự động |

