Base
GET / — check server đang chạy (Bookstore API is running)
Health
GET /api/health
GET /api/health/db
Auth
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
Users (cần Bearer token)
GET /api/users/me
PATCH /api/users/me
Books (public)
GET /api/books
GET /api/books/:id
Reviews
GET /api/books/:bookId/reviews (public)
POST /api/books/:bookId/reviews (cần Bearer token)
DELETE /api/books/:bookId/reviews/:reviewId (cần Bearer token)
Categories (public)
GET /api/categories
GET /api/categories/detailed
Cart
GET /api/cart
guest: cần header X-Guest-Session
user đăng nhập: dùng Bearer token
PUT /api/cart
guest/user tương tự như trên
Orders (cần Bearer token)
POST /api/orders
GET /api/orders
PATCH /api/orders/:id/status (cần role admin hoặc staff)
Blogs
GET /api/blogs (public)
GET /api/blogs/:id (public)
POST /api/blogs (cần admin|staff)
PUT /api/blogs/:id (cần admin|staff)
DELETE /api/blogs/:id (cần admin|staff)
Admin Books (cần admin|staff)
GET /api/admin/books?search=...&parentCategoryId=...&categoryId=...&status=all|active|inactive&stock=all|in-stock|out-of-stock|low-stock&sort=newest&page=1&limit=20
GET /api/admin/books/:id (đọc cả sách ẩn)
POST /api/admin/books
PUT /api/admin/books/:id
PATCH /api/admin/books/:id/status
DELETE /api/admin/books/:id
Admin Categories (đọc: admin|staff; ghi: chỉ admin)
GET /api/admin/categories?tree=true|false
GET /api/admin/categories/:id
POST /api/admin/categories
PATCH /api/admin/categories/:id
PATCH /api/admin/categories/:id/status
DELETE /api/admin/categories/:id (xóa mềm, chặn khi có sách/con active)
Chi tiết quy tắc, migration và kiểm thử: ../docs/12_ADMIN_CATALOG.md
Admin Inventory (cần admin|staff)
GET /api/admin/inventory
POST /api/admin/inventory

Admin Users (CHỈ admin; staff/user bị 403, không token bị 401)
GET /api/admin/users?search=...&role=user|staff|admin&isActive=true|false&page=1&limit=20
GET /api/admin/users/:id
POST /api/admin/users
PATCH /api/admin/users/:id
PATCH /api/admin/users/:id/role
PATCH /api/admin/users/:id/status
DELETE /api/admin/users/:id (xóa mềm, giữ đơn hàng)

Chi tiết payload/response, role customer và bảo vệ admin cuối: ../docs/09_ADMIN_USERS.md
