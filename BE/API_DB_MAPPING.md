# API -> Database Mapping

## Core mapping

- `POST /api/auth/register` -> `users`, `user_roles`, `roles`
- `POST /api/auth/login` -> `users`, `refresh_tokens`
- `POST /api/auth/refresh` -> `refresh_tokens`
- `POST /api/auth/logout` -> `refresh_tokens`
- `GET/PATCH /api/users/me` -> `users`
- `GET /api/books`, `GET /api/books/:id` -> `books`, `categories`
- `GET /api/categories` -> `categories`
- `GET /api/categories/detailed` -> `v_category_performance`
- `GET/PUT /api/cart` -> `carts`, `cart_items`, `books`
- `POST /api/orders` -> `sp_create_order` (transaction: order + stock + inventory)
- `GET /api/orders` -> `orders`
- `PATCH /api/orders/:id/status` -> `sp_update_order_status` (transaction + rollback stock on cancel)
- `GET /api/admin/inventory` -> `v_inventory_summary`
- `POST /api/admin/inventory` -> `sp_inventory_transaction`
- `POST/PUT/DELETE /api/admin/books` -> `books`

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
