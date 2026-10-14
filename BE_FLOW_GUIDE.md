# Hướng dẫn trả lời flow Backend

Tài liệu vấn đáp theo mã nguồn kiểm tra ngày **14/10/2026**. Đường dẫn `src/...` bên dưới thuộc thư mục `BE`. Chỉ mô tả chức năng tìm thấy trong code, không sửa code.

> Các flow dưới đây ghi lại code trước lần bổ sung quản lý tài khoản. Flow ADMIN user mới, ánh xạ customer/user, thay đổi bootstrap và quyền đọc đơn được cập nhật tại [docs/09_ADMIN_USERS.md](./docs/09_ADMIN_USERS.md).

**Mức kiểm chứng:** `npm run build` tại BE đã PASS (`tsc --noEmit`); chưa chạy API/DB/E2E. Các flow DB **cần test lại**. Flow stored procedure dưới đây bám theo [BE/SQLQuery1.sql](./BE/SQLQuery1.sql), vì service đang dùng tên cột/procedure của bộ này. [DB_bookstore.sql](./DB_bookstore.sql) ở thư mục gốc là bộ schema khác, chưa tương thích hoàn toàn; không được khẳng định DB đang chạy giống một trong hai chỉ từ việc file tồn tại.

## 1. Công thức chung khi trả lời flow BE

```txt
FE gọi API
→ app.ts nhận request, mount /api
→ routes/index.ts chọn nhóm route
→ route nhận endpoint
→ middleware kiểm tra token/quyền/validate nếu route có yêu cầu
→ controller lấy dữ liệu từ request
→ service xử lý nghiệp vụ
→ config/db.ts lấy connection pool
→ database lưu/lấy dữ liệu bằng query hoặc stored procedure
→ controller trả response về FE
```

| Tầng | Vai trò | Thư mục |
|---|---|---|
| Route | Khai báo method, endpoint, chuỗi middleware và controller | `src/routes` |
| Middleware | Kiểm tra token/quyền/validate; gom xử lý lỗi | `src/middlewares` |
| Controller | Nhận req/res, lấy body/query/params/user, gọi service, chọn HTTP status | `src/controllers` |
| Service | Xử lý nghiệp vụ, query DB, gọi procedure, map kết quả | `src/services` |
| Utils | JWT, mapper, error, pagination, bọc hàm async | `src/utils` |
| Config | Đọc env, cấu hình SQL Server và connection pool | `src/config` |

**Câu trả lời mẫu:** “Em bắt đầu từ method và endpoint mà FE gọi, mở route để xem middleware, theo tên hàm sang controller rồi service. Ở service em chỉ ra query hoặc stored procedure và các bảng tác động, cuối cùng nói response và trường hợp lỗi.”

Không phải route nào cũng có đủ mọi tầng: health ứng dụng trả JSON ngay; blog/review hiện trả 501 ngay. Với đơn hàng và kho, phần quan trọng của nghiệp vụ nằm **trong SQL procedure**, không chỉ trong TypeScript.

### 1.1 Khi thầy hỏi server khởi động từ đâu

```txt
npm run dev / npm start trong BE
→ src/server.ts: bootstrap()
→ import app từ src/app.ts
→ config/env.ts đọc dotenv và giá trị mặc định
→ config/db.ts: probeDbConnection()
→ auth.service.ts: ensureDefaultAdmin()
→ app.listen(env.port), mặc định 3001
```

`app.ts` cài CORS → `express.json()` → `cookieParser()` → `GET /` → `/api` → 404/error handler. DB/bootstrap lỗi thì `server.ts` thoát trước khi listen. `ensureDefaultAdmin()` có thể tạo admin hoặc kích hoạt lại tài khoản mặc định và gán role admin; đây là thao tác ghi DB khi startup.

### 1.2 Cách ghép URL và xác định dữ liệu vào

- `app.use('/api', routes)` + `router.use('/auth', authRoutes)` + `router.post('/login', ...)` = **POST `/api/auth/login`**.
- `req.body`: JSON như email/password, nội dung sách, địa chỉ giao hàng.
- `req.params.id`: ID trong URL; nhiều controller chuyển bằng `Number(...)` nhưng chưa validate kỹ.
- `req.query`: search/categoryId/page/limit.
- `req.user`: danh tính do auth middleware gắn sau khi verify token và đọc quyền DB; không lấy userId đặt hàng từ body.

## 2. Flow đăng nhập / phân quyền

### 2.1 Luồng code

```txt
FE gọi POST /api/auth/login với { email, password }
→ file route: src/routes/auth.routes.ts
→ src/middlewares/validateRequest.ts: kiểm tra schema Zod
→ file controller: src/controllers/auth.controller.ts: login()
→ file service: src/services/auth.service.ts: login(email, password)
   → normalizeEmail(): trim + lowercase
   → config/db.ts: getDb()
   → SELECT users đang is_active=1, is_deleted=0
   → bcrypt.compare(password, password_hash)
   → buildLoginResult()
      → rbac.service.ts: getUserAuthData(userId)
      → DB: users → user_roles → roles → role_permissions → permissions
      → utils/jwt.ts: signAccessToken(), signRefreshToken()
      → getRefreshTokenStorage(): xem cột token_hash/token
      → INSERT refresh_tokens
      → utils/userMapper.ts: mapDbUserToFeUser()
→ controller trả HTTP 200: user + accessToken + refreshToken + roles + permissions
```

**Mở file khi trình bày:** [auth.routes.ts](./BE/src/routes/auth.routes.ts) → [auth.controller.ts](./BE/src/controllers/auth.controller.ts) → [auth.service.ts](./BE/src/services/auth.service.ts) → [rbac.service.ts](./BE/src/services/rbac.service.ts) → [jwt.ts](./BE/src/utils/jwt.ts).

### 2.2 User/password kiểm tra ở đâu? JWT tạo ở đâu?

- `auth.service.login()` query user hợp lệ và so sánh bcrypt; sai email/password trả `AppError(401, 'Invalid credentials')`.
- `buildLoginResult()` tải quyền và gọi helper ký JWT ở `src/utils/jwt.ts`.
- Payload có `sub` = user ID, email, roles, permissions; access mặc định 15 phút, refresh 7 ngày, cấu hình qua `env.ts`. Refresh có `jti` ngẫu nhiên.
- Refresh lưu hash SHA-256 nếu schema có `token_hash`; fallback lưu JWT vào cột `token` cũ. Mật khẩu user lưu bcrypt hash, không trả hash ra FE; mapper có trường `password: ''` rỗng.
- User trả về có role ưu tiên admin → staff → user để FE dùng; roles/permissions đầy đủ cũng được trả.

**Trả lời ngắn:** “Route login validate body, controller chuyển email/password cho auth service. Service tìm user active, so bcrypt, lấy quyền từ các bảng RBAC, ký JWT và lưu refresh token rồi trả thông tin user cùng token.”

### 2.3 Request tiếp theo được xác thực/phân quyền thế nào?

```txt
FE gửi Authorization: Bearer <accessToken>
→ route có authMiddleware
→ src/middlewares/authMiddleware.ts: authMiddleware()
   → thiếu Bearer: 401
   → utils/jwt.ts: verifyAccessToken()
   → rbac.service.ts: getUserAuthData(payload.sub)
   → kiểm tra user còn active/chưa xóa, tải quyền hiện tại từ DB
   → gắn req.user
→ src/middlewares/checkPermission.ts: checkPermission(...), nếu route có dùng
   → admin được bypass
   → thỏa ít nhất một role/permission trong danh sách: next()
   → không đủ quyền: 403
→ controller → service
```

| Tình huống | Hành vi trong code |
|---|---|
| Thiếu Bearer ở route bắt buộc | 401 `Missing Bearer token` |
| Access JWT hết hạn/sai chữ ký thông thường | 401 `jwt expired` / `Invalid token` |
| User không còn active hoặc đã xóa | 401 `User no longer valid` |
| Đã xác thực nhưng thiếu role/permission | 403 `Forbidden` |
| GET books/category | Public, không chạy authMiddleware |
| Users/orders | Cần auth; từng thao tác kiểm tra thêm quyền hoặc chủ sở hữu |
| Toàn bộ `/api/admin/*` | Auth rồi `checkPermission(['admin', 'staff'])` |
| PATCH trạng thái đơn | Auth rồi OR giữa admin, staff, orders.update |

Tên role trong code là **`admin`, `staff`, `user` chữ thường**. Quyền được tải lại từ DB trên mỗi request, không chỉ tin quyền cũ trong payload JWT. Cơ chế phân quyền theo permission và giới hạn chủ sở hữu là hai việc khác nhau; xem lỗi đọc đơn ở mục 7.

### 2.4 Đăng ký, refresh, logout, quên mật khẩu

| Endpoint | Hàm service / DB | Response và điểm cần nói đúng |
|---|---|---|
| POST `/api/auth/register` | `register()` → bcrypt.hash → transaction INSERT users/user_roles, role `user` → login | 201 và bộ token/user; trùng email kiểm tra trước trả 409 |
| POST `/api/auth/refresh` | `refresh()` → verifyRefreshToken → getUserAuthData → signAccessToken | 200 `{ accessToken }`; **chưa kiểm tra refresh_tokens trong DB**, chưa rotation refresh |
| POST `/api/auth/logout` | `logout()` → xác định cột token/hash → DELETE refresh_tokens | 204; chỉ xóa bản ghi, **refresh JWT còn hạn vẫn có thể gọi refresh** vì nhánh trên bỏ qua DB |
| POST `/api/auth/reset-password` | `resetPasswordToDefault()` → UPDATE password_hash theo email → DELETE refresh_tokens của user | 200 message; hiện đặt về mật khẩu demo `1`, không OTP/xác minh email |

Các endpoint này đi qua `auth.routes.ts` → `auth.controller.ts` → `auth.service.ts`. Refresh/logout nhận refresh token **trong body**, không đòi access Bearer. Không nói “logout đã thu hồi hoàn toàn phiên” hoặc “quên mật khẩu đã an toàn”: code chưa đáp ứng các điều đó. Refresh JWT lỗi cũng chưa được đổi sang 401 như access JWT, có thể rơi vào error handler 500.

## 3. Flow xem và sửa hồ sơ người dùng

```txt
GET /api/users/me hoặc PATCH /api/users/me
→ routes/users.routes.ts: authMiddleware, PATCH thêm validateRequest
→ controllers/user.controller.ts: getMe() / updateMe()
→ services/user.service.ts: getMe(req.user.id) / updateMe(req.user.id, body)
→ DB users; getMe còn lấy quyền qua rbac.service.ts
→ utils/userMapper.ts: mapDbUserToFeUser()
→ HTTP 200 { item: user }
```

**Trả lời mẫu:** “API me lấy ID từ token đã xác thực, nên thao tác trên chính tài khoản đang đăng nhập. Service update các cột hồ sơ rồi đọc lại user và map về model FE.”

UPDATE dùng `COALESCE` để giữ giá trị khi không gửi/null. Các trường đã xử lý: firstName, lastName, phone, gender, birthDate, avatarUrl (service còn nhận alias avatar). Địa chỉ chưa có luồng lưu, mapper trả địa chỉ rỗng; FE context cũng chưa map birthday thành birthDate. Chưa có API danh sách/khóa/xóa user hoặc gán role từ màn hình admin.

## 4. Flow quản lý sách

### 4.1 Lấy danh sách, tìm kiếm, lọc, phân trang

```txt
GET /api/books?search=...&categoryId=...&page=1&limit=20
→ routes/books.routes.ts: router.get('/')
→ controllers/book.controller.ts: listBooks()
→ services/book.service.ts: listBooks(req.query)
   → utils/pagination.ts: parsePagination()
   → getDb(), bind các tham số SQL
   → SELECT books JOIN categories + subquery ảnh book_images
   → WHERE sách active/chưa xóa, LIKE title/author, category_id nếu có
   → ORDER BY created_at DESC, OFFSET/FETCH
   → SELECT COUNT(*) theo filter
→ HTTP 200 { data: [...], meta: { page, limit, total } }
```

Không cần token. Limit tối đa 100; **không phải `pageSize`**. Phân trang cần test giá trị không phải số/số lẻ. Bộ lọc category chỉ khớp ID, không tự mở rộng con; sort giá/rating và nhiều filter UI do FE làm trên dữ liệu đã tải.

### 4.2 Lấy chi tiết

`GET /api/books/:id` → `books.routes.ts` → `book.controller.getBookById()` chuyển params.id sang Number → `book.service.getBookById()` → SELECT books/categories/ảnh primary → trả **200 object trực tiếp**; không có sách/chỉ có bản ghi đã xóa thì 404.

Detail dùng `b.*`, chưa lọc active, chỉ trả ảnh đầu. Vì vậy không nói API đã trả full gallery hay đã ẩn toàn bộ thông tin nội bộ như giá nhập.

### 4.3 Thêm sách admin

```txt
POST /api/admin/books
→ routes/admin.routes.ts
→ authMiddleware → checkPermission(['admin', 'staff']) → validateRequest
→ controllers/book.controller.ts: createBook()
→ services/book.service.ts: createBook(body)
   → normalizeOptionalText(isbn), chuẩn hóa cờ
   → INSERT books, OUTPUT INSERTED.id
   → extractImageUrlsFromPayload(images hoặc image)
   → nếu có URL: replaceBookImages(id, urls)
      → transaction: DELETE ảnh cũ → INSERT book_images → commit/rollback
   → getBookById(id)
→ HTTP 201, object sách mới
```

**Body tối thiểu theo route:** title, author, categoryId số nguyên dương, price không âm, stock nguyên không âm. Các field thêm như ảnh/discount/flags được service sử dụng nhưng schema POST chưa validate đầy đủ. Middleware parse không thay lại req.body nên field ngoài schema vẫn tới service.

**Trả lời mẫu:** “Admin gửi JSON, route kiểm tra đăng nhập và role trước. Controller gọi book service insert sách; nếu có URL ảnh thì ghi bảng book_images, rồi đọc lại sách và trả 201. BE hiện lưu đường dẫn ảnh, chưa upload file.”

### 4.4 Sửa, xóa và lưu ảnh

| Endpoint | Chuỗi hàm | Database / response |
|---|---|---|
| PUT `/api/admin/books/:id` | admin route → auth/quyền → book controller.updateBook → book service.updateBook | UPDATE books dùng COALESCE; thay ảnh nếu gửi images/image; đọc lại và trả 200 |
| DELETE `/api/admin/books/:id` | admin route → auth/quyền → book controller.deleteBook → book service.deleteBook | UPDATE is_deleted=1, deleted_at; trả 204, giữ dữ liệu cho đơn cũ |

Điểm thầy có thể hỏi thêm:

- **Xóa mềm:** giữ row và tham chiếu order_items; danh sách không hiện sách đã xóa.
- **Gửi `images: []`:** dùng để xóa ảnh, nếu đồng thời gửi `image` có giá trị thì helper còn fallback sang ảnh đơn. Không gửi cả hai thì giữ ảnh cũ.
- **Atomic:** sách và ảnh chưa được lưu trong cùng transaction chung, nên lỗi ảnh có thể xảy ra sau khi sách đã đổi.
- **Validation:** PUT chưa gắn schema; không được khẳng định mọi giá trị đã validate trước DB.
- **Field chưa lưu:** pages/language FE có gửi nhưng create/update chưa ghi; tags/format và các chỉ số form chưa có luồng lưu đầy đủ. Giá nhập chỉ có ở create và nghiệp vụ kho, chưa có trong updateBook.
- **Tồn kho:** sửa stock ở CRUD sách không tạo inventory log. Điều này khác flow nhập/xuất kho.

## 5. Flow danh mục sách

```txt
GET /api/categories hoặc /api/categories/detailed
→ routes/categories.routes.ts
→ controllers/category.controller.ts: listCategories() / listCategoriesDetailed()
→ services/category.service.ts: hàm cùng tên
→ SELECT categories WHERE is_active=1
→ route thường trả array id/name/slug/icon
→ route detailed ghép subCategories hardcode theo slug và link FE
→ HTTP 200 array
```

**Trả lời mẫu:** “Danh mục chính được lấy từ DB. Riêng menu chi tiết hiện lấy danh mục rồi ghép nhóm con từ map trong service. SQL có parent_id nhưng code chưa dựng cây cha/con từ cột đó.”

Chưa có CRUD category. `API_DB_MAPPING.md` nói detailed dùng `v_category_performance`, nhưng code hiện tại **không gọi view này**. Các link hardcode ID cần đối chiếu seed.

## 6. Flow giỏ hàng

### 6.1 Xác định giỏ của ai và đọc giỏ

```txt
GET /api/cart
→ routes/cart.routes.ts: optional auth
   → có header bắt đầu Bearer: chạy authMiddleware
   → không có: tiếp tục như guest
→ controllers/cart.controller.ts: getCart()
   → getCartIdentity(): req.user.id hoặc header X-Guest-Session
   → thiếu cả hai: 400
→ services/cart.service.ts: getCart(userId, sessionId)
   → getOrCreateCartId(): SELECT carts, chưa có thì INSERT carts
   → SELECT cart_items JOIN books, tính line_total
→ HTTP 200 array các dòng giỏ
```

GET giỏ có thể tạo row `carts`, không chỉ đọc. Nếu đồng thời gửi userId và sessionId, query hiện dùng OR/TOP 1 nên cần kiểm tra tránh chọn sai giỏ; chưa có cơ chế merge guest hoàn chỉnh trong service.

### 6.2 Thêm/cập nhật/xóa item

```txt
PUT /api/cart với { items: [{ bookId: 1, quantity: 2 }] }
→ cart.routes.ts: optional auth + Zod (mảng ít nhất 1 item, số nguyên dương)
→ cart.controller.ts: upsertCart()
→ cart.service.ts: upsertCart(...)
   → tìm/tạo cartId
   → BEGIN transaction
   → DELETE toàn bộ cart_items của cartId
   → từng item: SELECT books active/chưa xóa, kiểm tra stock
   → MERGE cart_items để insert/update quantity
   → COMMIT; lỗi thì ROLLBACK
   → getCart() đọc lại
→ HTTP 200 array
```

**Trả lời mẫu:** “BE không có endpoint thêm/xóa từng dòng. FE gửi lại danh sách toàn giỏ qua PUT; service thay các dòng trong transaction và kiểm tra tồn trước khi ghi. Bỏ một item khỏi mảng tương đương xóa item đó.”

**Giới hạn phải nói rõ:** Mảng rỗng bị Zod chặn, nên chưa xóa được dòng cuối/clear toàn giỏ bằng PUT. BE trả `book_id` trong array, FE `cartApi.ts` đọc `data.items` và model `bookId`; cần sửa hợp đồng và test reload. FE guest chủ yếu dùng localStorage, không thể khẳng định guest cart hiện đã luôn đồng bộ DB.

## 7. Flow tạo đơn hàng và lấy đơn

### 7.1 Tạo đơn hàng

```txt
FE BookstoreContext.addOrder()
→ PUT /api/cart để đồng bộ các item cần mua
→ POST /api/orders với thông tin người nhận dạng phẳng
→ routes/orders.routes.ts: authMiddleware + validateRequest
→ controllers/order.controller.ts: createOrder()
→ services/order.service.ts: createOrder(req.user.id, req.body)
   → config/db.ts: pool.request(), bind các p_* parameters
   → execute('sp_create_order'), output p_order_id
→ BE/SQLQuery1.sql: sp_create_order
   → BEGIN TRANSACTION
   → tìm carts theo user_id, kiểm tra giỏ có item và đủ tồn
   → tính tiền từ books.price và discount trong DB
   → INSERT orders (pending), INSERT order_items (snapshot tên/tác giả/giá)
   → UPDATE books: trừ stock, tăng sold_count
   → INSERT inventory_transactions (order, quantity âm)
   → INSERT order_status_history
   → DELETE cart_items của giỏ
   → COMMIT; lỗi thì ROLLBACK và THROW
→ controller trả HTTP 201 { orderId }
```

**Thông tin body:** paymentMethod, shippingName, shippingPhone, shippingAddress (chuỗi), shippingCity; tùy chọn shippingEmail, shippingState, shippingZipcode, shippingCountry, note. **Không phải** body shippingAddress object như tài liệu contract cũ. Service không nhận giá/tổng tiền/item từ body tạo đơn; item đến từ giỏ DB.

**Trả lời mẫu:** “Tạo đơn lấy userId từ token và giỏ từ DB. TypeScript truyền thông tin nhận hàng cho stored procedure; procedure tính giá từ DB và gói tạo đơn, chi tiết đơn, trừ tồn, log kho, lịch sử, xóa giỏ trong transaction. Thành công trả ID đơn, lỗi thì rollback.”

Chưa có gateway thanh toán: lưu paymentMethod không có nghĩa đã thanh toán thành công. Procedure SQL cũ chưa kiểm tra lại active/deleted của sách; kiểm tra đồng thời, idempotency và lỗi SQL thành 4xx còn cần hoàn thiện.

### 7.2 User/admin lấy danh sách đơn

```txt
GET /api/orders?page=1&limit=20
→ orders.routes.ts: authMiddleware
→ order.controller.ts: listOrders()
→ order.service.ts: listOrders(req.user, req.query)
   → parsePagination()
   → isOrderAdmin(auth) quyết định scope
      → nhánh quản trị: SELECT tất cả orders
      → nhánh thường: SELECT orders WHERE user_id=@userId
   → COUNT(*) và lấy order_items từng đơn
   → mapOrderToApi(): id dạng string, items, total, shippingAddress...
→ HTTP 200 { data, meta }
```

**Điểm quan trọng khi trả lời phân quyền:** Ý định là khách chỉ xem đơn mình, nhưng `isOrderAdmin()` hiện cho người có `orders.read` hoặc `orders.update` xem mọi đơn. `BE/SQLQuery1.sql` cấp `orders.read` cho role user, nên với seed này **user thường cũng vào nhánh mọi đơn**. Không trình bày flow cách ly dữ liệu như đã đúng; cần sửa và test bằng hai tài khoản.

Không có endpoint `/api/admin/orders` hoặc GET `/api/orders/:id`; quản trị dùng chung GET `/api/orders`. List hiện query items từng đơn (N+1), chưa tối ưu batch; FE yêu cầu limit=200 nhưng BE chặn tối đa 100.

## 8. Flow cập nhật trạng thái, hủy đơn, xác nhận nhận hàng

### 8.1 Quản trị đổi trạng thái hoặc hủy đơn

```txt
PATCH /api/orders/:id/status với { status, note? }
→ orders.routes.ts: authMiddleware
→ checkPermission(['admin', 'staff', 'orders.update']) + validateRequest
→ order.controller.ts: updateOrderStatus()
→ order.service.ts: updateOrderStatus(orderId, status, note, req.user.id)
   → kiểm tra status thuộc danh sách cho phép
   → execute('sp_update_order_status')
→ BE/SQLQuery1.sql: sp_update_order_status
   → transaction, đọc trạng thái hiện tại
   → không có đơn / đơn completed hoặc cancelled: báo lỗi
   → UPDATE orders và mốc thời gian/reason tương ứng
   → INSERT order_status_history với changed_by
   → nếu cancelled: hoàn stock, giảm sold_count, ghi log adjustment/order_cancel
   → commit/rollback
→ HTTP 204 (không body)
→ FE tải lại GET /api/orders để đọc trạng thái DB
```

Danh sách status: `pending`, `confirmed`, `processing`, `shipping`, `completed`, `cancelled`.

**Trả lời mẫu:** “Service kiểm tra giá trị trạng thái rồi gọi procedure. SQL cập nhật đơn và ghi lịch sử; nếu hủy thì hoàn kho trong cùng transaction. Hiện chỉ chặn đơn đã kết thúc, chưa kiểm soát đầy đủ mọi bước chuyển.”

Không có API khách tự hủy riêng. Không có realtime push/WebSocket/SSE. FE quản trị có cập nhật state cục bộ sau 204; khách cần fetch lại/reload để chắc đã thấy dữ liệu mới. Hai request hủy đồng thời cần test để tránh hoàn kho lặp.

### 8.2 Khách xác nhận đã nhận hàng

```txt
POST /api/orders/:id/confirm-received
→ orders.routes.ts: authMiddleware
→ order.controller.ts: confirmDeliveryByCustomer(), kiểm tra ID hữu hạn
→ order.service.ts: confirmDeliveryByCustomer(userId, orderId)
   → SELECT user_id, status FROM orders
   → không tồn tại: 404
   → không phải chủ đơn: 403
   → không ở shipping: 400
   → gọi updateOrderStatus(orderId, 'completed', undefined, userId)
→ procedure ghi trạng thái/lịch sử
→ HTTP 204
```

Ở đây quyền chủ đơn được kiểm tra trong **service**, không phải checkPermission. Kiểm tra chủ đơn/status trước và cập nhật sau chưa dùng chung transaction TypeScript; cần test đua với thao tác hủy.

## 9. Flow nhập/xuất kho

### 9.1 Tạo giao dịch kho

```txt
POST /api/admin/inventory
→ admin.routes.ts: auth → role admin/staff → validateRequest
→ inventory.controller.ts: createInventoryTransaction()
   → truyền {...body, createdBy: req.user.id}; không tin createdBy từ body
→ inventory.service.ts: createInventoryTransaction()
   → execute('sp_inventory_transaction') với p_book_id, p_quantity, ...
→ BE/SQLQuery1.sql: sp_inventory_transaction
   → BEGIN TRANSACTION
   → kiểm tra loại giao dịch, quantity khác 0, sách tồn tại
   → kiểm tra đủ tồn khi export hoặc adjustment âm
   → INSERT inventory_transactions
   → UPDATE books: stock = stock + quantity; cập nhật import_price nếu gửi
   → COMMIT / ROLLBACK
→ HTTP 201 { message: 'Inventory transaction created' }
→ FE tải lại sách và lịch sử kho
```

Ví dụ payload theo cách BE/SQL cũ đang xử lý, thay bookId bằng sách thực tế:

```json
{ "bookId": 1, "transactionType": "import", "quantity": 5, "importPrice": 50000 }
```

```json
{ "bookId": 1, "transactionType": "export", "quantity": -2, "note": "Xuất kho" }
```

**Trả lời mẫu:** “FE gửi loại giao dịch và số lượng có dấu. BE xác thực người thao tác rồi gọi procedure; SQL kiểm tra tồn, ghi lịch sử và cộng phần chênh vào stock trong transaction.”

**Không được nói “BE tự đổi export thành số âm”:** việc đổi dấu đang ở FE `BookstoreContext.addInventoryLog()`. Route chỉ kiểm tra quantity là integer, chưa ép dấu; export dương có thể tăng tồn. Lỗi thiếu tồn từ SQL hiện còn có thể trả 500 qua errorHandler thay vì 400.

### 9.2 Đọc tồn và lịch sử

| Endpoint | Route → Controller → Service | DB / response |
|---|---|---|
| GET `/api/admin/inventory` | admin.routes → inventory.controller.listInventory → inventory.service.listInventory | SELECT `v_inventory_summary` → `{ data, meta }`; search title/author, page/limit |
| GET `/api/admin/inventory/transactions` | admin.routes → inventory.controller.listInventoryTransactions → inventory.service.listInventoryTransactions | inventory_transactions LEFT JOIN users → `{ items, meta }`; tối đa 500/trang |

GET tổng hợp có lỗi đối chiếu: service sort `total_stock`, SQL cũ chỉ có `current_stock`. Mapper lịch sử biến order thành export, adjustment âm thành export/dương thành import và lấy trị tuyệt đối quantity; FE không còn nhận loại gốc/reference. Đây là lý do cần đối soát log hoàn đơn và số liệu nhập hàng.

## 10. Flow Admin Dashboard / thống kê

```txt
GET /api/admin/stats
→ routes/admin.routes.ts: auth + admin/staff
→ controllers/adminStats.controller.ts: getAdminStats()
→ services/user.service.ts: countActiveUsers()
→ SELECT COUNT(*) FROM users WHERE is_deleted=0
→ HTTP 200 { totalUsers }
```

**Trả lời mẫu:** “API thống kê BE hiện chỉ có tổng user chưa bị xóa. Các chỉ số doanh thu, tổng đơn, tổng sách trên dashboard đang được FE tính từ danh sách đã tải, chưa có API thống kê tổng hợp tương ứng.”

Tên countActiveUsers chưa đúng hoàn toàn với query vì không lọc is_active. SQL có view báo cáo nhưng không được nối route. FE cộng tiền mọi trạng thái và dùng danh sách có giới hạn phân trang; không khẳng định dashboard đã tính doanh thu chuẩn/toàn DB.

## 11. Flow health check và xử lý lỗi

### 11.1 Health check

- `GET /`: `app.ts` trả `{ message: 'Bookstore API is running' }`.
- `GET /api/health`: `routes/index.ts` → `health.controller.health()` → `{ status: 'ok' }`.
- `GET /api/health/db`: `routes/index.ts` → `health.controller.healthDb()` → `health.service.checkDbHealth()` → `getDb()` → `SELECT 1 AS ok` → `{ status: 'ok' }`.

Không cần token. Health app không tự query DB; health DB chỉ xác nhận kết nối/query đơn giản, không chứng minh các bảng/procedure phù hợp. Response hiện không có trường service như contract cũ.

### 11.2 Validate và đường đi của lỗi

```txt
Schema Zod không hợp lệ
→ validateRequest.ts tạo AppError(400)
→ errorHandler.ts trả { message }

Controller/service ném lỗi hoặc Promise reject
→ utils/asyncHandler.ts chuyển next(error)
→ middlewares/errorHandler.ts
   → AppError: dùng statusCode (400/401/403/404/409...)
   → lỗi khác: 500 và err.message

Không match endpoint
→ notFoundHandler() tạo AppError(404)
→ errorHandler trả JSON
```

**Câu hỏi “có xử lý lỗi tập trung không?”** Có, nhưng chưa map toàn bộ lỗi SQL, refresh JWT, JSON parser về mã phù hợp; thông điệp 500 còn lộ chi tiết nội bộ. `validateRequest` chỉ gọi schema.parse để kiểm tra, chưa gán kết quả đã parse vào request, nên không thể coi field ngoài schema đã bị loại trước service.

## 12. Database, config và transaction: câu hỏi thường gặp

| Thầy hỏi | Cách trả lời bám code |
|---|---|
| Kết nối DB ở đâu? | `src/config/db.ts:getDb()` quản lý connection pool `mssql`; `env.ts` đọc `.env`. Có SQL auth hoặc NTLM, port ưu tiên hơn instance khi đã set |
| Là SQL Server hay MySQL? | SQL Server: thư viện mssql, kiểu sql.BigInt/NVarChar, cú pháp TOP/OFFSET, procedure và GO trong script |
| Vì sao query có `.input()`? | Bind tham số cho giá trị đầu vào, không nối trực tiếp input thành câu SQL. Tên cột refresh được chọn từ hai tên cố định trong code |
| Hash mật khẩu khác JWT thế nào? | bcrypt lưu để đối chiếu mật khẩu; JWT có chữ ký và hạn dùng để mang danh tính. Refresh token có thể được hash SHA-256 trước lưu DB |
| Transaction ở đâu? | TypeScript: register, thay giỏ, thay ảnh. SQL: tạo đơn, đổi status, giao dịch kho. Không phải mọi thao tác nhiều bảng đều đã atomic chung |
| Giá đơn lấy từ FE hay DB? | SQL cũ lấy price/discount từ books, snapshot sang order_items. FE tạo object hiển thị tạm từ orderId, phải GET lại để đối chiếu DB |
| Vì sao lưu order_items riêng? | Lưu sách/số lượng/giá tại lúc đặt; giữ thông tin lịch sử. Mapper API hiện trả bookId/quantity/price, chưa đưa toàn bộ snapshot tên/tác giả ra FE |
| Có audit không? | Có inventory_transactions và order_status_history cho nghiệp vụ tương ứng; có bảng audit_logs nhưng chưa thấy luồng service ghi audit chung cho CRUD admin |
| Có phân quyền trong DB không? | DB chứa role/permission và liên kết. Code middleware/service sử dụng dữ liệu này để cho phép request; không phải SQL tự bảo vệ mọi endpoint |
| Có quản lý file ảnh không? | BE lưu URL vào book_images; scripts có thể map ảnh từ FE/public/img. Không có route upload/serve file ảnh trong app.ts |
| Có test tự động chưa? | `test:smoke` chỉ gọi build; `test:db` chỉ kiểm tra kết nối. Chưa thấy bộ unit/integration test nghiệp vụ BE |

### 12.1 Hai bộ SQL: không nhầm “có bảng” với “API đã chạy”

| Điểm | `BE/SQLQuery1.sql` mà code đang hướng tới | `DB_bookstore.sql` ở root |
|---|---|---|
| Sách | stock, discount, import_price, featured, bestseller, publish_date | stock_quantity, discount_percent, is_featured, is_bestseller, publication_year; còn khác các cột khác |
| User/role | gender/birth_date; role user | Thiếu gender; có bổ sung birth_date ở cuối; role customer |
| Quyền | permissions.name là key như orders.read | permissions.code là key, name là nhãn tiếng Việt; BE hiện đọc name |
| Refresh | token, script bổ sung đổi độ dài 1000 | token_hash, revoked_at; service nhận được token_hash nhưng refresh chưa tra DB |
| Đơn/kho | sp_create_order, sp_update_order_status, sp_inventory_transaction với tham số p_* | sp_CreateOrder, sp_UpdateOrderStatus, sp_AdjustInventory với tham số khác; tạo đơn dùng table-valued parameter |
| View tồn | v_inventory_summary | Không có view cùng tên này trong script |
| Blog/review | Không có bảng nghiệp vụ blog/review | Có bảng blogs/reviews và cơ chế SQL liên quan; BE vẫn chỉ trả 501 |

File SQL mới có tồn tại trong workspace không chứng minh nó đã được áp dụng. Ngược lại, build TypeScript pass không kiểm tra được tên cột SQL trong chuỗi query. Trước demo phải xác định schema DB thật và chạy các flow với dữ liệu thử.

Các SQL khác: `BE/fix-refresh-token-column.sql` mở rộng cột token cũ; hai `reset-dev-users*.sql` sửa tài khoản demo; các seed ở root nạp sách/ảnh/tag. `src/scripts/*` có các tác vụ kiểm tra DB, import/map ảnh và seed — đây là script hỗ trợ, **không phải HTTP endpoint**.

## 13. Những chức năng không được trình bày như đã hoàn thành

- Blog/review: `routes/index.ts` → `unsupported.controller.schemaNotImplemented()` → **501**. Có 5 route blog và 3 route review, chưa controller/service nghiệp vụ; route ghi còn chưa auth/permission.
- Category tree/CRUD, admin CRUD user/role, supplier CRUD, upload ảnh, báo cáo doanh thu qua API, thanh toán gateway: chưa có route thực thi tương ứng.
- Logout/reset thu hồi token, bảo vệ đọc đơn cá nhân, chuẩn dấu nhập/xuất, clear cart và hợp đồng cart FE–BE: có phần code nhưng còn lỗi cụ thể; xem [BE_STATUS_14_10.md](./BE_STATUS_14_10.md).
- UI có dữ liệu không chứng minh DB hoạt động: FE có recovered data/localStorage/fallback và một số nhánh bắt lỗi rồi trả mảng rỗng.

**Cách trả lời khi gặp phần chưa làm:** “Phần này hiện mới có ... trong code; phần ... chưa triển khai/còn lỗi. Em cần hoàn thiện ... và test lại với DB/FE, nên chưa khẳng định đã chạy đầy đủ.”

## 14. Bảng tra nhanh khi thầy yêu cầu mở code

Trong cột controller/service, tên file tương đối với `BE/src/controllers` và `BE/src/services`.

| Chức năng | Endpoint | Route | Controller → Service | Bảng/procedure chính |
|---|---|---|---|---|
| Login | POST `/api/auth/login` | auth.routes.ts | auth.controller.login → auth.service.login | users, bảng RBAC, refresh_tokens |
| Register | POST `/api/auth/register` | auth.routes.ts | auth.controller.register → auth.service.register | users, roles, user_roles |
| Refresh/logout | POST `/api/auth/refresh`, `/api/auth/logout` | auth.routes.ts | auth.controller → auth.service | Refresh chỉ lấy auth DB; logout DELETE refresh_tokens |
| Reset demo | POST `/api/auth/reset-password` | auth.routes.ts | auth.controller.resetPassword → auth.service.resetPasswordToDefault | users, refresh_tokens |
| Hồ sơ | GET/PATCH `/api/users/me` | users.routes.ts | user.controller → user.service | users, RBAC |
| List/detail sách | GET `/api/books`, `/api/books/:id` | books.routes.ts | book.controller → book.service | books, categories, book_images |
| CRUD sách | POST `/api/admin/books`; PUT/DELETE `/api/admin/books/:id` | admin.routes.ts | book.controller → book.service | books, book_images |
| Category | GET `/api/categories`, `/api/categories/detailed` | categories.routes.ts | category.controller → category.service | categories + map hardcode |
| Giỏ | GET/PUT `/api/cart` | cart.routes.ts | cart.controller → cart.service | carts, cart_items, books |
| Tạo đơn | POST `/api/orders` | orders.routes.ts | order.controller.createOrder → order.service.createOrder | sp_create_order |
| List đơn | GET `/api/orders` | orders.routes.ts | order.controller.listOrders → order.service.listOrders | orders, order_items |
| Status/hủy | PATCH `/api/orders/:id/status` | orders.routes.ts | order.controller.updateOrderStatus → order.service.updateOrderStatus | sp_update_order_status |
| Đã nhận hàng | POST `/api/orders/:id/confirm-received` | orders.routes.ts | order.controller.confirmDeliveryByCustomer → order.service.confirmDeliveryByCustomer | orders → sp_update_order_status |
| Giao dịch kho | POST `/api/admin/inventory` | admin.routes.ts | inventory.controller.createInventoryTransaction → inventory.service.createInventoryTransaction | sp_inventory_transaction |
| Tồn/lịch sử | GET `/api/admin/inventory`, `/api/admin/inventory/transactions` | admin.routes.ts | inventory.controller → inventory.service | v_inventory_summary, inventory_transactions, users |
| Thống kê user | GET `/api/admin/stats` | admin.routes.ts | adminStats.controller.getAdminStats → user.service.countActiveUsers | users |
| Health DB | GET `/api/health/db` | index.ts | health.controller.healthDb → health.service.checkDbHealth | SELECT 1 |

Khi ôn: chọn một chức năng trong bảng, nói rõ **đầu vào → bảo vệ → hàm xử lý → DB thay đổi gì → response → một lỗi/giới hạn cần test**. Với order/inventory, mở thêm stored procedure; với auth, mở JWT và RBAC; với cart, nhấn mạnh PUT thay toàn giỏ.
