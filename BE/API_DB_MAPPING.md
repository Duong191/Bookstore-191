# API -> Database Mapping

## Core mapping

- `POST /api/auth/register` -> `users`, `user_roles`, `roles`
- `POST /api/auth/login` -> `users`, `refresh_tokens`
- `POST /api/auth/refresh` -> `refresh_tokens`
- `POST /api/auth/logout` -> `refresh_tokens`
- `GET/PATCH /api/users/me` -> `users`
- `GET /api/books`, `GET /api/books/:id` -> `books`, `categories`
- `GET /api/categories` -> `categories`
- `GET /api/categories/detailed` -> `categories`, `books` (cây cha/con và link DB, chỉ danh mục đang hiển thị)
- `GET/PUT /api/cart` -> `carts`, `cart_items`, `books`
- `POST /api/orders` -> schema mới `sp_CreateOrder`, legacy `sp_create_order` (transaction: order + stock + inventory)
- `GET /api/orders` -> `orders`
- `PATCH /api/orders/:id/status` -> schema mới `sp_UpdateOrderStatus`, legacy `sp_update_order_status` (transaction + rollback stock on cancel)
- `GET /api/admin/inventory` -> schema mới `books`, `categories`, `inventory_transactions`; legacy `v_inventory_summary`
- `POST /api/admin/inventory` -> schema mới `sp_AdjustInventory`; legacy `sp_inventory_transaction`
- `GET/POST/PUT/DELETE /api/admin/books`, `PATCH /api/admin/books/:id/status` -> `books`, `categories`, `book_images`, `book_tags`, `tags` (schema mới); legacy lưu tags trực tiếp trong `book_tags`. Kho khởi tạo -> `inventory_transactions`.
- `GET/POST/PATCH/DELETE /api/admin/categories` -> `categories`, `books` (đếm sách và bảo vệ xóa). Soft-delete fields thêm bằng `category-management-compatibility.sql`.
- Public books/categories và cart/checkout kiểm tra trạng thái sách, danh mục và cha. Cây danh mục hai cấp; chi tiết tại `../docs/12_ADMIN_CATALOG.md`.

## RBAC mapping

- Admin account management: `GET/POST /api/admin/users`, `GET/PATCH/DELETE /api/admin/users/:id`,
  `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/users/:id/status` -> `users`, `roles`, `user_roles`, `refresh_tokens`.
- Only role `admin` can access this group. Mutations use a transaction-owned SQL application lock and protect the last active admin.
- API role `user` maps to DB role `user` when available, otherwise `customer`; authentication normalizes `customer` to `user`.
- Soft deletion keeps the user row and existing orders. No password/hash/token appears in admin account responses.

- `roles`, `permissions`, `user_roles`, `role_permissions`
- Middleware `checkPermission()` checks both role aliases (`admin`, `staff`) and permission keys (e.g. `orders.update`)

## Schema mismatch

- API spec contains blogs/reviews endpoints, but current schema has no `blogs`/`reviews` tables.
- Implemented as HTTP `501 Not Implemented` to keep behavior explicit and runtime-safe.

## Existing index coverage from SQL script

- Auth/users: `idx_users_email_unique`
- Books listing/filter: `idx_books_category_active`, `idx_books_featured`, `idx_books_bestseller`
- Orders listing: `idx_orders_user_created`, `idx_orders_status_created`
- Inventory: `idx_inventory_transactions_book_created`

These indexes already match current heavy query paths in the implemented services.
