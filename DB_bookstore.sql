/*
===============================================================================
 BOOKARAZI / BOOKSTORE_DB - FULL REBUILD SCRIPT (SQL SERVER 2022)
===============================================================================
 Mục đích:
 - Tạo lại database bookstore_db sau khi database cũ bị xóa.
 - Khôi phục cấu trúc chính đã dùng trong dự án Bookarazi:
   Auth/RBAC, danh mục cha-con, sách/ảnh/tag, giỏ hàng, đơn hàng,
   kho, đánh giá, blog, audit log, báo cáo doanh thu và bảng xếp hạng.

 CẢNH BÁO:
 - Script này sẽ XÓA và tạo lại các object trong bookstore_db nếu chúng tồn tại.
 - Không thể phục hồi chính xác dữ liệu phát sinh đã mất nếu không có file .bak.
 - Dữ liệu cuối file là dữ liệu seed để chạy/demo dự án.

 Tài khoản seed:
 - Admin:    admin@bookstore.com / 1
 - Staff:    staff@bookstore.com / Staff@123
 - Customer: customer@bookstore.com / Customer@123

 Database name giữ là bookstore_db để khớp file .env/backend hiện tại.
===============================================================================
*/

USE [master];
GO

IF DB_ID(N'bookstore_db') IS NULL
BEGIN
    PRINT N'Đang tạo database bookstore_db...';
    CREATE DATABASE [bookstore_db];
END
ELSE
BEGIN
    PRINT N'Database bookstore_db đã tồn tại, tiếp tục dựng lại cấu trúc...';
END;
GO

IF DB_ID(N'bookstore_db') IS NULL
    THROW 50000, N'Không thể tạo database bookstore_db.', 1;
GO

ALTER DATABASE [bookstore_db] SET RECOVERY SIMPLE;
GO

USE [bookstore_db];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*=============================================================================
 1. XÓA OBJECT CŨ THEO ĐÚNG THỨ TỰ PHỤ THUỘC
=============================================================================*/

DROP VIEW IF EXISTS dbo.vw_LowStockBooks;
DROP VIEW IF EXISTS dbo.vw_MonthlyRevenue;
DROP VIEW IF EXISTS dbo.vw_DailyRevenue;
DROP VIEW IF EXISTS dbo.vw_BestsellingBooks;
DROP VIEW IF EXISTS dbo.vw_BookCatalog;
GO

DROP PROCEDURE IF EXISTS dbo.sp_GetRevenueSummary;
DROP PROCEDURE IF EXISTS dbo.sp_RecalculateBookRating;
DROP PROCEDURE IF EXISTS dbo.sp_UpdateOrderStatus;
DROP PROCEDURE IF EXISTS dbo.sp_CreateOrder;
DROP PROCEDURE IF EXISTS dbo.sp_AdjustInventory;
DROP PROCEDURE IF EXISTS dbo.sp_GetBooksByParentCategory;
GO

DROP TRIGGER IF EXISTS dbo.trg_reviews_recalculate_book_rating;
GO

DROP TABLE IF EXISTS dbo.audit_logs;
DROP TABLE IF EXISTS dbo.blogs;
DROP TABLE IF EXISTS dbo.inventory_transactions;
DROP TABLE IF EXISTS dbo.order_status_history;
DROP TABLE IF EXISTS dbo.order_items;
DROP TABLE IF EXISTS dbo.orders;
DROP TABLE IF EXISTS dbo.cart_items;
DROP TABLE IF EXISTS dbo.carts;
DROP TABLE IF EXISTS dbo.reviews;
DROP TABLE IF EXISTS dbo.book_tags;
DROP TABLE IF EXISTS dbo.tags;
DROP TABLE IF EXISTS dbo.book_images;
DROP TABLE IF EXISTS dbo.books;
DROP TABLE IF EXISTS dbo.suppliers;
DROP TABLE IF EXISTS dbo.publishers;
DROP TABLE IF EXISTS dbo.authors;
DROP TABLE IF EXISTS dbo.categories;
DROP TABLE IF EXISTS dbo.password_reset_tokens;
DROP TABLE IF EXISTS dbo.refresh_tokens;
DROP TABLE IF EXISTS dbo.user_roles;
DROP TABLE IF EXISTS dbo.role_permissions;
DROP TABLE IF EXISTS dbo.[users];
DROP TABLE IF EXISTS dbo.permissions;
DROP TABLE IF EXISTS dbo.roles;
GO

IF TYPE_ID(N'dbo.OrderItemInput') IS NOT NULL
    DROP TYPE dbo.OrderItemInput;
GO

/*=============================================================================
 2. AUTHENTICATION VÀ PHÂN QUYỀN
=============================================================================*/

CREATE TABLE dbo.roles
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(50)  NOT NULL,
    description     NVARCHAR(255) NULL,
    is_active       BIT NOT NULL CONSTRAINT DF_roles_is_active DEFAULT (1),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_roles_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_roles_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_roles_name UNIQUE (name)
);
GO

CREATE TABLE dbo.permissions
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    code            NVARCHAR(100) NOT NULL,
    name            NVARCHAR(150) NOT NULL,
    module          NVARCHAR(50)  NOT NULL,
    description     NVARCHAR(255) NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_permissions_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_permissions_code UNIQUE (code)
);
GO

CREATE TABLE dbo.[users]
(
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    email               NVARCHAR(255) NOT NULL,
    password_hash       NVARCHAR(255) NOT NULL,
    first_name          NVARCHAR(100) NULL,
    last_name           NVARCHAR(100) NULL,
    phone               NVARCHAR(30)  NULL,
    address             NVARCHAR(500) NULL,
    avatar_url          NVARCHAR(1000) NULL,
    email_verified      BIT NOT NULL CONSTRAINT DF_users_email_verified DEFAULT (0),
    is_active           BIT NOT NULL CONSTRAINT DF_users_is_active DEFAULT (1),
    is_deleted          BIT NOT NULL CONSTRAINT DF_users_is_deleted DEFAULT (0),
    last_login_at       DATETIME2(0) NULL,
    created_at          DATETIME2(0) NOT NULL CONSTRAINT DF_users_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at          DATETIME2(0) NOT NULL CONSTRAINT DF_users_updated_at DEFAULT (SYSUTCDATETIME()),
    deleted_at          DATETIME2(0) NULL,
    CONSTRAINT UQ_users_email UNIQUE (email)
);
GO

CREATE TABLE dbo.role_permissions
(
    role_id         INT NOT NULL,
    permission_id   INT NOT NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_role_permissions_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES dbo.permissions(id) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.user_roles
(
    user_id         INT NOT NULL,
    role_id         INT NOT NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_user_roles_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES dbo.[users](id) ON DELETE CASCADE,
    CONSTRAINT FK_user_roles_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.refresh_tokens
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id         INT NOT NULL,
    token_hash      NVARCHAR(500) NOT NULL,
    user_agent      NVARCHAR(1000) NULL,
    ip_address      NVARCHAR(64) NULL,
    expires_at      DATETIME2(0) NOT NULL,
    revoked_at      DATETIME2(0) NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_refresh_tokens_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_refresh_tokens_token_hash UNIQUE (token_hash),
    CONSTRAINT FK_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES dbo.[users](id) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.password_reset_tokens
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id         INT NOT NULL,
    token_hash      NVARCHAR(500) NULL,
    otp_code        NVARCHAR(10) NULL,
    request_ip      NVARCHAR(64) NULL,
    expires_at      DATETIME2(0) NOT NULL,
    used_at         DATETIME2(0) NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_password_reset_tokens_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_password_reset_token_value CHECK (token_hash IS NOT NULL OR otp_code IS NOT NULL),
    CONSTRAINT FK_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES dbo.[users](id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_refresh_tokens_user_expires ON dbo.refresh_tokens(user_id, expires_at);
CREATE INDEX IX_password_reset_tokens_user_expires ON dbo.password_reset_tokens(user_id, expires_at);
GO

/*=============================================================================
 3. DANH MỤC, TÁC GIẢ, NHÀ XUẤT BẢN, NHÀ CUNG CẤP
=============================================================================*/

CREATE TABLE dbo.categories
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(150) NOT NULL,
    slug            NVARCHAR(180) NOT NULL,
    icon            NVARCHAR(255) NULL,
    description     NVARCHAR(1000) NULL,
    parent_id       INT NULL,
    display_order   INT NOT NULL CONSTRAINT DF_categories_display_order DEFAULT (0),
    is_active       BIT NOT NULL CONSTRAINT DF_categories_is_active DEFAULT (1),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_categories_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_categories_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_categories_slug UNIQUE (slug),
    CONSTRAINT CK_categories_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT FK_categories_parent FOREIGN KEY (parent_id) REFERENCES dbo.categories(id)
);
GO

CREATE INDEX IX_categories_parent_active_order
ON dbo.categories(parent_id, is_active, display_order)
INCLUDE(name, slug);
GO

CREATE TABLE dbo.authors
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(255) NOT NULL,
    slug            NVARCHAR(280) NOT NULL,
    biography       NVARCHAR(MAX) NULL,
    avatar_url      NVARCHAR(1000) NULL,
    is_active       BIT NOT NULL CONSTRAINT DF_authors_is_active DEFAULT (1),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_authors_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_authors_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_authors_slug UNIQUE (slug)
);
GO

CREATE TABLE dbo.publishers
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(255) NOT NULL,
    slug            NVARCHAR(280) NOT NULL,
    phone           NVARCHAR(30) NULL,
    email           NVARCHAR(255) NULL,
    address         NVARCHAR(500) NULL,
    is_active       BIT NOT NULL CONSTRAINT DF_publishers_is_active DEFAULT (1),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_publishers_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_publishers_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_publishers_slug UNIQUE (slug)
);
GO

CREATE TABLE dbo.suppliers
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(255) NOT NULL,
    contact_name    NVARCHAR(255) NULL,
    phone           NVARCHAR(30) NULL,
    email           NVARCHAR(255) NULL,
    address         NVARCHAR(500) NULL,
    tax_code        NVARCHAR(50) NULL,
    is_active       BIT NOT NULL CONSTRAINT DF_suppliers_is_active DEFAULT (1),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_suppliers_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_suppliers_updated_at DEFAULT (SYSUTCDATETIME())
);
GO

/*=============================================================================
 4. SÁCH, ẢNH, TAG, ĐÁNH GIÁ
=============================================================================*/

CREATE TABLE dbo.books
(
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    title               NVARCHAR(500) NOT NULL,
    slug                NVARCHAR(550) NOT NULL,
    isbn                NVARCHAR(30) NULL,
    category_id         INT NOT NULL,
    author_id           INT NULL,
    publisher_id        INT NULL,
    supplier_id         INT NULL,
    author              NVARCHAR(255) NULL,
    publisher           NVARCHAR(255) NULL,
    description         NVARCHAR(MAX) NULL,
    short_description   NVARCHAR(1200) NULL,
    price               DECIMAL(18,2) NOT NULL,
    original_price      DECIMAL(18,2) NULL,
    discount_percent    DECIMAL(5,2) NOT NULL CONSTRAINT DF_books_discount_percent DEFAULT (0),
    stock_quantity      INT NOT NULL CONSTRAINT DF_books_stock_quantity DEFAULT (0),
    sold_count          INT NOT NULL CONSTRAINT DF_books_sold_count DEFAULT (0),
    rating              DECIMAL(3,2) NOT NULL CONSTRAINT DF_books_rating DEFAULT (0),
    review_count        INT NOT NULL CONSTRAINT DF_books_review_count DEFAULT (0),
    view_count          INT NOT NULL CONSTRAINT DF_books_view_count DEFAULT (0),
    pages               INT NULL,
    language            NVARCHAR(100) NULL,
    publication_year    INT NULL,
    weight_grams        INT NULL,
    dimensions          NVARCHAR(100) NULL,
    cover_type          NVARCHAR(100) NULL,
    is_featured         BIT NOT NULL CONSTRAINT DF_books_is_featured DEFAULT (0),
    is_bestseller       BIT NOT NULL CONSTRAINT DF_books_is_bestseller DEFAULT (0),
    is_new              BIT NOT NULL CONSTRAINT DF_books_is_new DEFAULT (0),
    is_active           BIT NOT NULL CONSTRAINT DF_books_is_active DEFAULT (1),
    is_deleted          BIT NOT NULL CONSTRAINT DF_books_is_deleted DEFAULT (0),
    created_at          DATETIME2(0) NOT NULL CONSTRAINT DF_books_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at          DATETIME2(0) NOT NULL CONSTRAINT DF_books_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_books_slug UNIQUE (slug),
    CONSTRAINT CK_books_price CHECK (price >= 0),
    CONSTRAINT CK_books_original_price CHECK (original_price IS NULL OR original_price >= 0),
    CONSTRAINT CK_books_discount CHECK (discount_percent BETWEEN 0 AND 100),
    CONSTRAINT CK_books_stock CHECK (stock_quantity >= 0),
    CONSTRAINT CK_books_sold CHECK (sold_count >= 0),
    CONSTRAINT CK_books_rating CHECK (rating BETWEEN 0 AND 5),
    CONSTRAINT CK_books_review_count CHECK (review_count >= 0),
    CONSTRAINT FK_books_category FOREIGN KEY (category_id) REFERENCES dbo.categories(id),
    CONSTRAINT FK_books_author FOREIGN KEY (author_id) REFERENCES dbo.authors(id),
    CONSTRAINT FK_books_publisher FOREIGN KEY (publisher_id) REFERENCES dbo.publishers(id),
    CONSTRAINT FK_books_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id)
);
GO

CREATE UNIQUE INDEX UX_books_isbn ON dbo.books(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX IX_books_category_active ON dbo.books(category_id, is_active, is_deleted);
CREATE INDEX IX_books_title ON dbo.books(title);
CREATE INDEX IX_books_ranking ON dbo.books(sold_count DESC, rating DESC, review_count DESC);
CREATE INDEX IX_books_stock ON dbo.books(stock_quantity, is_active) INCLUDE(title, price);
GO

CREATE TABLE dbo.book_images
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    book_id         INT NOT NULL,
    image_url       NVARCHAR(1000) NOT NULL,
    alt_text        NVARCHAR(500) NULL,
    is_primary      BIT NOT NULL CONSTRAINT DF_book_images_is_primary DEFAULT (0),
    display_order   INT NOT NULL CONSTRAINT DF_book_images_display_order DEFAULT (0),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_book_images_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_book_images_book FOREIGN KEY (book_id) REFERENCES dbo.books(id) ON DELETE CASCADE
);
GO

CREATE UNIQUE INDEX UX_book_images_primary
ON dbo.book_images(book_id)
WHERE is_primary = 1;
GO

CREATE TABLE dbo.tags
(
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(100) NOT NULL,
    slug        NVARCHAR(120) NOT NULL,
    CONSTRAINT UQ_tags_name UNIQUE(name),
    CONSTRAINT UQ_tags_slug UNIQUE(slug)
);
GO

CREATE TABLE dbo.book_tags
(
    book_id     INT NOT NULL,
    tag_id      INT NOT NULL,
    created_at  DATETIME2(0) NOT NULL CONSTRAINT DF_book_tags_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_book_tags PRIMARY KEY(book_id, tag_id),
    CONSTRAINT FK_book_tags_book FOREIGN KEY(book_id) REFERENCES dbo.books(id) ON DELETE CASCADE,
    CONSTRAINT FK_book_tags_tag FOREIGN KEY(tag_id) REFERENCES dbo.tags(id) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.reviews
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    book_id         INT NOT NULL,
    user_id         INT NOT NULL,
    rating          TINYINT NOT NULL,
    title           NVARCHAR(255) NULL,
    comment         NVARCHAR(2000) NULL,
    is_approved     BIT NOT NULL CONSTRAINT DF_reviews_is_approved DEFAULT (1),
    is_deleted      BIT NOT NULL CONSTRAINT DF_reviews_is_deleted DEFAULT (0),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_reviews_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_reviews_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_reviews_user_book UNIQUE(user_id, book_id),
    CONSTRAINT CK_reviews_rating CHECK(rating BETWEEN 1 AND 5),
    CONSTRAINT FK_reviews_book FOREIGN KEY(book_id) REFERENCES dbo.books(id) ON DELETE CASCADE,
    CONSTRAINT FK_reviews_user FOREIGN KEY(user_id) REFERENCES dbo.[users](id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_reviews_book_approved ON dbo.reviews(book_id, is_approved, is_deleted);
GO

/*=============================================================================
 5. GIỎ HÀNG
=============================================================================*/

CREATE TABLE dbo.carts
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id         INT NULL,
    session_id      NVARCHAR(150) NULL,
    status          NVARCHAR(30) NOT NULL CONSTRAINT DF_carts_status DEFAULT (N'active'),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_carts_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_carts_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_carts_owner CHECK(user_id IS NOT NULL OR session_id IS NOT NULL),
    CONSTRAINT CK_carts_status CHECK(status IN (N'active', N'converted', N'abandoned')),
    CONSTRAINT FK_carts_user FOREIGN KEY(user_id) REFERENCES dbo.[users](id)
);
GO

CREATE UNIQUE INDEX UX_carts_active_user
ON dbo.carts(user_id)
WHERE user_id IS NOT NULL AND status = N'active';
GO

CREATE UNIQUE INDEX UX_carts_active_session
ON dbo.carts(session_id)
WHERE session_id IS NOT NULL AND status = N'active';
GO

CREATE TABLE dbo.cart_items
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    cart_id         BIGINT NOT NULL,
    book_id         INT NOT NULL,
    quantity        INT NOT NULL CONSTRAINT DF_cart_items_quantity DEFAULT (1),
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_cart_items_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_cart_items_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_cart_items_cart_book UNIQUE(cart_id, book_id),
    CONSTRAINT CK_cart_items_quantity CHECK(quantity > 0),
    CONSTRAINT FK_cart_items_cart FOREIGN KEY(cart_id) REFERENCES dbo.carts(id) ON DELETE CASCADE,
    CONSTRAINT FK_cart_items_book FOREIGN KEY(book_id) REFERENCES dbo.books(id)
);
GO

CREATE INDEX IX_cart_items_cart ON dbo.cart_items(cart_id) INCLUDE(book_id, quantity);
GO

/*=============================================================================
 6. ĐƠN HÀNG VÀ LỊCH SỬ TRẠNG THÁI
=============================================================================*/

CREATE TABLE dbo.orders
(
    id                  BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_code          NVARCHAR(50) NOT NULL,
    user_id             INT NULL,
    guest_session_id    NVARCHAR(150) NULL,
    customer_name       NVARCHAR(255) NOT NULL,
    customer_email      NVARCHAR(255) NULL,
    customer_phone      NVARCHAR(30) NOT NULL,
    shipping_address    NVARCHAR(1000) NOT NULL,
    note                NVARCHAR(1000) NULL,
    subtotal            DECIMAL(18,2) NOT NULL,
    shipping_fee        DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_shipping_fee DEFAULT (0),
    discount_amount     DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_discount_amount DEFAULT (0),
    total_amount        DECIMAL(18,2) NOT NULL,
    status              NVARCHAR(30) NOT NULL CONSTRAINT DF_orders_status DEFAULT (N'pending'),
    payment_method      NVARCHAR(30) NOT NULL CONSTRAINT DF_orders_payment_method DEFAULT (N'cod'),
    payment_status      NVARCHAR(30) NOT NULL CONSTRAINT DF_orders_payment_status DEFAULT (N'unpaid'),
    cancel_reason       NVARCHAR(1000) NULL,
    cancelled_at        DATETIME2(0) NULL,
    created_at          DATETIME2(0) NOT NULL CONSTRAINT DF_orders_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at          DATETIME2(0) NOT NULL CONSTRAINT DF_orders_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_orders_order_code UNIQUE(order_code),
    CONSTRAINT CK_orders_money CHECK(subtotal >= 0 AND shipping_fee >= 0 AND discount_amount >= 0 AND total_amount >= 0),
    CONSTRAINT CK_orders_status CHECK(status IN (N'pending', N'confirmed', N'processing', N'shipping', N'completed', N'cancelled')),
    CONSTRAINT CK_orders_payment_method CHECK(payment_method IN (N'cod', N'bank_transfer', N'vnpay', N'momo')),
    CONSTRAINT CK_orders_payment_status CHECK(payment_status IN (N'unpaid', N'pending', N'paid', N'failed', N'refunded')),
    CONSTRAINT FK_orders_user FOREIGN KEY(user_id) REFERENCES dbo.[users](id)
);
GO

CREATE INDEX IX_orders_user_created ON dbo.orders(user_id, created_at DESC);
CREATE INDEX IX_orders_guest_created ON dbo.orders(guest_session_id, created_at DESC);
CREATE INDEX IX_orders_status_created ON dbo.orders(status, created_at DESC);
GO

CREATE TABLE dbo.order_items
(
    id                  BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_id            BIGINT NOT NULL,
    book_id             INT NULL,
    book_title          NVARCHAR(500) NOT NULL,
    isbn                NVARCHAR(30) NULL,
    quantity            INT NOT NULL,
    unit_price          DECIMAL(18,2) NOT NULL,
    discount_amount     DECIMAL(18,2) NOT NULL CONSTRAINT DF_order_items_discount DEFAULT (0),
    line_total          DECIMAL(18,2) NOT NULL,
    created_at          DATETIME2(0) NOT NULL CONSTRAINT DF_order_items_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_order_items_quantity CHECK(quantity > 0),
    CONSTRAINT CK_order_items_money CHECK(unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0),
    CONSTRAINT FK_order_items_order FOREIGN KEY(order_id) REFERENCES dbo.orders(id) ON DELETE CASCADE,
    CONSTRAINT FK_order_items_book FOREIGN KEY(book_id) REFERENCES dbo.books(id) ON DELETE SET NULL
);
GO

CREATE INDEX IX_order_items_order ON dbo.order_items(order_id);
CREATE INDEX IX_order_items_book ON dbo.order_items(book_id);
GO

CREATE TABLE dbo.order_status_history
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    old_status      NVARCHAR(30) NULL,
    new_status      NVARCHAR(30) NOT NULL,
    note            NVARCHAR(1000) NULL,
    changed_by      INT NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_order_status_history_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_order_status_history_order FOREIGN KEY(order_id) REFERENCES dbo.orders(id) ON DELETE CASCADE,
    CONSTRAINT FK_order_status_history_user FOREIGN KEY(changed_by) REFERENCES dbo.[users](id)
);
GO

CREATE INDEX IX_order_status_history_order_created ON dbo.order_status_history(order_id, created_at DESC);
GO

/*=============================================================================
 7. KHO, BLOG VÀ AUDIT LOG
=============================================================================*/

CREATE TABLE dbo.inventory_transactions
(
    id                  BIGINT IDENTITY(1,1) PRIMARY KEY,
    book_id             INT NOT NULL,
    supplier_id         INT NULL,
    transaction_type    NVARCHAR(30) NOT NULL,
    quantity_delta      INT NOT NULL,
    quantity_before     INT NOT NULL,
    quantity_after      INT NOT NULL,
    unit_cost           DECIMAL(18,2) NULL,
    reference_type      NVARCHAR(50) NULL,
    reference_id        NVARCHAR(100) NULL,
    note                NVARCHAR(1000) NULL,
    created_by          INT NULL,
    created_at          DATETIME2(0) NOT NULL CONSTRAINT DF_inventory_transactions_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_inventory_transaction_type CHECK(transaction_type IN (N'opening', N'import', N'sale', N'cancel_restore', N'return', N'adjustment')),
    CONSTRAINT CK_inventory_quantity_delta CHECK(quantity_delta <> 0),
    CONSTRAINT CK_inventory_quantities CHECK(quantity_before >= 0 AND quantity_after >= 0),
    CONSTRAINT FK_inventory_book FOREIGN KEY(book_id) REFERENCES dbo.books(id),
    CONSTRAINT FK_inventory_supplier FOREIGN KEY(supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_inventory_user FOREIGN KEY(created_by) REFERENCES dbo.[users](id)
);
GO

CREATE INDEX IX_inventory_book_created ON dbo.inventory_transactions(book_id, created_at DESC);
CREATE INDEX IX_inventory_reference ON dbo.inventory_transactions(reference_type, reference_id);
GO

CREATE TABLE dbo.blogs
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    title           NVARCHAR(500) NOT NULL,
    slug            NVARCHAR(550) NOT NULL,
    excerpt         NVARCHAR(1200) NULL,
    content         NVARCHAR(MAX) NOT NULL,
    cover_image     NVARCHAR(1000) NULL,
    author_id       INT NULL,
    status          NVARCHAR(30) NOT NULL CONSTRAINT DF_blogs_status DEFAULT (N'draft'),
    published_at    DATETIME2(0) NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_blogs_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at      DATETIME2(0) NOT NULL CONSTRAINT DF_blogs_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_blogs_slug UNIQUE(slug),
    CONSTRAINT CK_blogs_status CHECK(status IN (N'draft', N'published', N'archived')),
    CONSTRAINT FK_blogs_author FOREIGN KEY(author_id) REFERENCES dbo.[users](id)
);
GO

CREATE TABLE dbo.audit_logs
(
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id         INT NULL,
    action          NVARCHAR(100) NOT NULL,
    entity_type     NVARCHAR(100) NOT NULL,
    entity_id       NVARCHAR(100) NULL,
    old_values      NVARCHAR(MAX) NULL,
    new_values      NVARCHAR(MAX) NULL,
    ip_address      NVARCHAR(64) NULL,
    user_agent      NVARCHAR(1000) NULL,
    created_at      DATETIME2(0) NOT NULL CONSTRAINT DF_audit_logs_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_audit_logs_user FOREIGN KEY(user_id) REFERENCES dbo.[users](id)
);
GO

CREATE INDEX IX_audit_logs_entity ON dbo.audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IX_audit_logs_user ON dbo.audit_logs(user_id, created_at DESC);
GO

/*=============================================================================
 8. TYPE VÀ STORED PROCEDURES
=============================================================================*/

CREATE TYPE dbo.OrderItemInput AS TABLE
(
    book_id     INT NOT NULL,
    quantity    INT NOT NULL
);
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetBooksByParentCategory
    @ParentCategoryId INT = NULL,
    @Keyword NVARCHAR(255) = NULL,
    @OnlyActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH CategoryScope AS
    (
        SELECT id
        FROM dbo.categories
        WHERE @ParentCategoryId IS NOT NULL AND id = @ParentCategoryId

        UNION ALL

        SELECT c.id
        FROM dbo.categories c
        INNER JOIN CategoryScope cs ON c.parent_id = cs.id
    )
    SELECT
        b.id,
        b.title,
        b.slug,
        b.isbn,
        b.author,
        b.publisher,
        b.category_id,
        c.name AS category_name,
        c.parent_id,
        pc.name AS parent_category_name,
        b.price,
        b.original_price,
        b.discount_percent,
        CAST(ROUND(b.price * (1 - b.discount_percent / 100.0), 2) AS DECIMAL(18,2)) AS sale_price,
        b.stock_quantity,
        b.sold_count,
        b.rating,
        b.review_count,
        b.is_featured,
        b.is_bestseller,
        b.is_new,
        img.image_url AS primary_image
    FROM dbo.books b
    INNER JOIN dbo.categories c ON c.id = b.category_id
    LEFT JOIN dbo.categories pc ON pc.id = c.parent_id
    OUTER APPLY
    (
        SELECT TOP (1) bi.image_url
        FROM dbo.book_images bi
        WHERE bi.book_id = b.id
        ORDER BY bi.is_primary DESC, bi.display_order ASC, bi.id ASC
    ) img
    WHERE
        b.is_deleted = 0
        AND (@OnlyActive = 0 OR b.is_active = 1)
        AND
        (
            @ParentCategoryId IS NULL
            OR b.category_id IN (SELECT id FROM CategoryScope)
        )
        AND
        (
            NULLIF(LTRIM(RTRIM(@Keyword)), N'') IS NULL
            OR b.title LIKE N'%' + @Keyword + N'%'
            OR b.author LIKE N'%' + @Keyword + N'%'
            OR b.isbn LIKE N'%' + @Keyword + N'%'
        )
    ORDER BY b.created_at DESC, b.id DESC
    OPTION (MAXRECURSION 100);
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_AdjustInventory
    @BookId INT,
    @QuantityDelta INT,
    @TransactionType NVARCHAR(30),
    @SupplierId INT = NULL,
    @UnitCost DECIMAL(18,2) = NULL,
    @ReferenceType NVARCHAR(50) = NULL,
    @ReferenceId NVARCHAR(100) = NULL,
    @Note NVARCHAR(1000) = NULL,
    @CreatedBy INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @QuantityDelta = 0
        THROW 50001, N'Số lượng thay đổi phải khác 0.', 1;

    BEGIN TRANSACTION;

    DECLARE @Before INT;
    SELECT @Before = stock_quantity
    FROM dbo.books WITH (UPDLOCK, HOLDLOCK)
    WHERE id = @BookId AND is_deleted = 0;

    IF @Before IS NULL
        THROW 50002, N'Không tìm thấy sách.', 1;

    IF @Before + @QuantityDelta < 0
        THROW 50003, N'Số lượng tồn kho không đủ.', 1;

    UPDATE dbo.books
    SET stock_quantity = stock_quantity + @QuantityDelta,
        updated_at = SYSUTCDATETIME()
    WHERE id = @BookId;

    INSERT INTO dbo.inventory_transactions
    (
        book_id, supplier_id, transaction_type, quantity_delta,
        quantity_before, quantity_after, unit_cost,
        reference_type, reference_id, note, created_by
    )
    VALUES
    (
        @BookId, @SupplierId, @TransactionType, @QuantityDelta,
        @Before, @Before + @QuantityDelta, @UnitCost,
        @ReferenceType, @ReferenceId, @Note, @CreatedBy
    );

    COMMIT TRANSACTION;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_CreateOrder
    @UserId INT = NULL,
    @GuestSessionId NVARCHAR(150) = NULL,
    @CustomerName NVARCHAR(255),
    @CustomerEmail NVARCHAR(255) = NULL,
    @CustomerPhone NVARCHAR(30),
    @ShippingAddress NVARCHAR(1000),
    @Note NVARCHAR(1000) = NULL,
    @ShippingFee DECIMAL(18,2) = 0,
    @DiscountAmount DECIMAL(18,2) = 0,
    @PaymentMethod NVARCHAR(30) = N'cod',
    @Items dbo.OrderItemInput READONLY,
    @OrderId BIGINT OUTPUT,
    @OrderCode NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM @Items)
        THROW 50010, N'Đơn hàng phải có ít nhất một sản phẩm.', 1;

    IF EXISTS (SELECT 1 FROM @Items WHERE quantity <= 0)
        THROW 50011, N'Số lượng sản phẩm phải lớn hơn 0.', 1;

    BEGIN TRANSACTION;

    IF EXISTS
    (
        SELECT 1
        FROM @Items i
        LEFT JOIN dbo.books b WITH (UPDLOCK, HOLDLOCK) ON b.id = i.book_id
        WHERE b.id IS NULL
           OR b.is_active = 0
           OR b.is_deleted = 1
           OR b.stock_quantity < i.quantity
    )
        THROW 50012, N'Có sách không tồn tại, ngừng bán hoặc không đủ tồn kho.', 1;

    DECLARE @Subtotal DECIMAL(18,2);

    SELECT @Subtotal = SUM
    (
        CAST
        (
            ROUND(b.price * (1 - b.discount_percent / 100.0), 2) * i.quantity
            AS DECIMAL(18,2)
        )
    )
    FROM @Items i
    INNER JOIN dbo.books b ON b.id = i.book_id;

    SET @OrderCode = N'ORD' +
                     CONVERT(NVARCHAR(8), GETDATE(), 112) +
                     REPLACE(CONVERT(NVARCHAR(8), CONVERT(TIME(0), GETDATE()), 108), N':', N'') +
                     RIGHT(REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''), 6);

    INSERT INTO dbo.orders
    (
        order_code, user_id, guest_session_id,
        customer_name, customer_email, customer_phone,
        shipping_address, note,
        subtotal, shipping_fee, discount_amount, total_amount,
        status, payment_method, payment_status
    )
    VALUES
    (
        @OrderCode, @UserId, @GuestSessionId,
        @CustomerName, @CustomerEmail, @CustomerPhone,
        @ShippingAddress, @Note,
        @Subtotal, @ShippingFee, @DiscountAmount,
        @Subtotal + @ShippingFee - @DiscountAmount,
        N'pending', @PaymentMethod,
        CASE WHEN @PaymentMethod = N'cod' THEN N'unpaid' ELSE N'pending' END
    );

    SET @OrderId = SCOPE_IDENTITY();

    INSERT INTO dbo.order_items
    (
        order_id, book_id, book_title, isbn,
        quantity, unit_price, discount_amount, line_total
    )
    SELECT
        @OrderId,
        b.id,
        b.title,
        b.isbn,
        i.quantity,
        CAST(ROUND(b.price * (1 - b.discount_percent / 100.0), 2) AS DECIMAL(18,2)),
        CAST(ROUND((b.price * b.discount_percent / 100.0) * i.quantity, 2) AS DECIMAL(18,2)),
        CAST(ROUND((b.price * (1 - b.discount_percent / 100.0)) * i.quantity, 2) AS DECIMAL(18,2))
    FROM @Items i
    INNER JOIN dbo.books b ON b.id = i.book_id;

    DECLARE @StockChanges TABLE
    (
        book_id INT,
        quantity_delta INT,
        quantity_before INT,
        quantity_after INT
    );

    UPDATE b
    SET
        stock_quantity = b.stock_quantity - i.quantity,
        sold_count = b.sold_count + i.quantity,
        updated_at = SYSUTCDATETIME()
    OUTPUT
        inserted.id,
        -i.quantity,
        deleted.stock_quantity,
        inserted.stock_quantity
    INTO @StockChanges(book_id, quantity_delta, quantity_before, quantity_after)
    FROM dbo.books b
    INNER JOIN @Items i ON i.book_id = b.id;

    INSERT INTO dbo.inventory_transactions
    (
        book_id, transaction_type, quantity_delta,
        quantity_before, quantity_after,
        reference_type, reference_id, note
    )
    SELECT
        book_id, N'sale', quantity_delta,
        quantity_before, quantity_after,
        N'order', CONVERT(NVARCHAR(100), @OrderId),
        N'Trừ kho khi tạo đơn ' + @OrderCode
    FROM @StockChanges;

    INSERT INTO dbo.order_status_history(order_id, old_status, new_status, note, changed_by)
    VALUES(@OrderId, NULL, N'pending', N'Tạo đơn hàng', @UserId);

    UPDATE dbo.carts
    SET status = N'converted', updated_at = SYSUTCDATETIME()
    WHERE status = N'active'
      AND
      (
          (@UserId IS NOT NULL AND user_id = @UserId)
          OR (@GuestSessionId IS NOT NULL AND session_id = @GuestSessionId)
      );

    COMMIT TRANSACTION;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_UpdateOrderStatus
    @OrderId BIGINT,
    @NewStatus NVARCHAR(30),
    @ChangedBy INT = NULL,
    @Note NVARCHAR(1000) = NULL,
    @CancelReason NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @NewStatus NOT IN (N'pending', N'confirmed', N'processing', N'shipping', N'completed', N'cancelled')
        THROW 50020, N'Trạng thái đơn hàng không hợp lệ.', 1;

    BEGIN TRANSACTION;

    DECLARE @OldStatus NVARCHAR(30);
    SELECT @OldStatus = status
    FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
    WHERE id = @OrderId;

    IF @OldStatus IS NULL
        THROW 50021, N'Không tìm thấy đơn hàng.', 1;

    IF @OldStatus = @NewStatus
    BEGIN
        COMMIT TRANSACTION;
        RETURN;
    END;

    IF @OldStatus IN (N'completed', N'cancelled')
        THROW 50022, N'Không thể đổi trạng thái của đơn đã hoàn tất hoặc đã hủy.', 1;

    IF @NewStatus = N'cancelled'
    BEGIN
        DECLARE @Restore TABLE
        (
            book_id INT,
            quantity_delta INT,
            quantity_before INT,
            quantity_after INT
        );

        UPDATE b
        SET
            stock_quantity = b.stock_quantity + oi.quantity,
            sold_count = CASE WHEN b.sold_count >= oi.quantity THEN b.sold_count - oi.quantity ELSE 0 END,
            updated_at = SYSUTCDATETIME()
        OUTPUT
            inserted.id,
            oi.quantity,
            deleted.stock_quantity,
            inserted.stock_quantity
        INTO @Restore(book_id, quantity_delta, quantity_before, quantity_after)
        FROM dbo.books b
        INNER JOIN dbo.order_items oi ON oi.book_id = b.id
        WHERE oi.order_id = @OrderId;

        INSERT INTO dbo.inventory_transactions
        (
            book_id, transaction_type, quantity_delta,
            quantity_before, quantity_after,
            reference_type, reference_id, note, created_by
        )
        SELECT
            book_id, N'cancel_restore', quantity_delta,
            quantity_before, quantity_after,
            N'order', CONVERT(NVARCHAR(100), @OrderId),
            N'Hoàn kho do hủy đơn', @ChangedBy
        FROM @Restore;
    END;

    UPDATE dbo.orders
    SET
        status = @NewStatus,
        cancel_reason = CASE WHEN @NewStatus = N'cancelled' THEN @CancelReason ELSE cancel_reason END,
        cancelled_at = CASE WHEN @NewStatus = N'cancelled' THEN SYSUTCDATETIME() ELSE cancelled_at END,
        payment_status = CASE
            WHEN @NewStatus = N'completed' AND payment_method = N'cod' THEN N'paid'
            ELSE payment_status
        END,
        updated_at = SYSUTCDATETIME()
    WHERE id = @OrderId;

    INSERT INTO dbo.order_status_history(order_id, old_status, new_status, note, changed_by)
    VALUES(@OrderId, @OldStatus, @NewStatus, COALESCE(@Note, @CancelReason), @ChangedBy);

    COMMIT TRANSACTION;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_RecalculateBookRating
    @BookId INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE b
    SET
        rating = COALESCE(r.avg_rating, 0),
        review_count = COALESCE(r.review_count, 0),
        updated_at = SYSUTCDATETIME()
    FROM dbo.books b
    OUTER APPLY
    (
        SELECT
            CAST(ROUND(AVG(CAST(rv.rating AS DECIMAL(10,2))), 2) AS DECIMAL(3,2)) AS avg_rating,
            COUNT_BIG(*) AS review_count
        FROM dbo.reviews rv
        WHERE rv.book_id = b.id
          AND rv.is_approved = 1
          AND rv.is_deleted = 0
    ) r
    WHERE b.id = @BookId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetRevenueSummary
    @FromDate DATE = NULL,
    @ToDate DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @FromDate = COALESCE(@FromDate, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));
    SET @ToDate = COALESCE(@ToDate, CAST(GETDATE() AS DATE));

    SELECT
        COUNT_BIG(*) AS completed_orders,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COALESCE(AVG(total_amount), 0) AS average_order_value,
        COALESCE(SUM(discount_amount), 0) AS total_discount,
        COALESCE(SUM(shipping_fee), 0) AS total_shipping_fee
    FROM dbo.orders
    WHERE status = N'completed'
      AND payment_status <> N'refunded'
      AND created_at >= @FromDate
      AND created_at < DATEADD(DAY, 1, @ToDate);
END;
GO

/*=============================================================================
 9. TRIGGER ĐỒNG BỘ RATING
=============================================================================*/

CREATE OR ALTER TRIGGER dbo.trg_reviews_recalculate_book_rating
ON dbo.reviews
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH ChangedBooks AS
    (
        SELECT book_id FROM inserted
        UNION
        SELECT book_id FROM deleted
    ),
    RatingData AS
    (
        SELECT
            cb.book_id,
            CAST(ROUND(AVG(CAST(r.rating AS DECIMAL(10,2))), 2) AS DECIMAL(3,2)) AS avg_rating,
            COUNT(r.id) AS review_count
        FROM ChangedBooks cb
        LEFT JOIN dbo.reviews r
            ON r.book_id = cb.book_id
           AND r.is_approved = 1
           AND r.is_deleted = 0
        GROUP BY cb.book_id
    )
    UPDATE b
    SET
        rating = COALESCE(rd.avg_rating, 0),
        review_count = COALESCE(rd.review_count, 0),
        updated_at = SYSUTCDATETIME()
    FROM dbo.books b
    INNER JOIN RatingData rd ON rd.book_id = b.id;
END;
GO

/*=============================================================================
 10. VIEW CHO SHOP, BẢNG XẾP HẠNG, KHO VÀ DOANH THU
=============================================================================*/

CREATE OR ALTER VIEW dbo.vw_BookCatalog
AS
SELECT
    b.id,
    b.title,
    b.slug,
    b.isbn,
    b.author_id,
    COALESCE(a.name, b.author) AS author_name,
    b.publisher_id,
    COALESCE(p.name, b.publisher) AS publisher_name,
    b.category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    c.parent_id,
    pc.name AS parent_category_name,
    pc.slug AS parent_category_slug,
    b.description,
    b.short_description,
    b.price,
    b.original_price,
    b.discount_percent,
    CAST(ROUND(b.price * (1 - b.discount_percent / 100.0), 2) AS DECIMAL(18,2)) AS sale_price,
    b.stock_quantity,
    b.sold_count,
    b.rating,
    b.review_count,
    b.view_count,
    b.pages,
    b.language,
    b.publication_year,
    b.is_featured,
    b.is_bestseller,
    b.is_new,
    b.is_active,
    b.is_deleted,
    img.image_url AS primary_image,
    b.created_at,
    b.updated_at
FROM dbo.books b
INNER JOIN dbo.categories c ON c.id = b.category_id
LEFT JOIN dbo.categories pc ON pc.id = c.parent_id
LEFT JOIN dbo.authors a ON a.id = b.author_id
LEFT JOIN dbo.publishers p ON p.id = b.publisher_id
OUTER APPLY
(
    SELECT TOP (1) bi.image_url
    FROM dbo.book_images bi
    WHERE bi.book_id = b.id
    ORDER BY bi.is_primary DESC, bi.display_order ASC, bi.id ASC
) img;
GO

CREATE OR ALTER VIEW dbo.vw_BestsellingBooks
AS
SELECT
    ROW_NUMBER() OVER
    (
        PARTITION BY COALESCE(c.parent_id, c.id)
        ORDER BY b.sold_count DESC, b.rating DESC, b.review_count DESC, b.id ASC
    ) AS rank_in_parent_category,
    b.id AS book_id,
    b.title,
    b.slug,
    b.author,
    b.category_id,
    c.name AS category_name,
    COALESCE(c.parent_id, c.id) AS parent_category_id,
    COALESCE(pc.name, c.name) AS parent_category_name,
    b.sold_count,
    b.rating,
    b.review_count,
    b.price,
    b.discount_percent,
    CAST(ROUND(b.price * (1 - b.discount_percent / 100.0), 2) AS DECIMAL(18,2)) AS sale_price
FROM dbo.books b
INNER JOIN dbo.categories c ON c.id = b.category_id
LEFT JOIN dbo.categories pc ON pc.id = c.parent_id
WHERE b.is_active = 1 AND b.is_deleted = 0;
GO

CREATE OR ALTER VIEW dbo.vw_DailyRevenue
AS
SELECT
    CAST(created_at AS DATE) AS revenue_date,
    COUNT_BIG(*) AS order_count,
    SUM(subtotal) AS subtotal,
    SUM(discount_amount) AS discount_amount,
    SUM(shipping_fee) AS shipping_fee,
    SUM(total_amount) AS revenue
FROM dbo.orders
WHERE status = N'completed'
  AND payment_status <> N'refunded'
GROUP BY CAST(created_at AS DATE);
GO

CREATE OR ALTER VIEW dbo.vw_MonthlyRevenue
AS
SELECT
    YEAR(created_at) AS revenue_year,
    MONTH(created_at) AS revenue_month,
    COUNT_BIG(*) AS order_count,
    SUM(subtotal) AS subtotal,
    SUM(discount_amount) AS discount_amount,
    SUM(shipping_fee) AS shipping_fee,
    SUM(total_amount) AS revenue
FROM dbo.orders
WHERE status = N'completed'
  AND payment_status <> N'refunded'
GROUP BY YEAR(created_at), MONTH(created_at);
GO

CREATE OR ALTER VIEW dbo.vw_LowStockBooks
AS
SELECT
    b.id,
    b.title,
    b.isbn,
    b.stock_quantity,
    c.name AS category_name,
    s.name AS supplier_name,
    b.updated_at
FROM dbo.books b
INNER JOIN dbo.categories c ON c.id = b.category_id
LEFT JOIN dbo.suppliers s ON s.id = b.supplier_id
WHERE b.is_active = 1
  AND b.is_deleted = 0
  AND b.stock_quantity <= 10;
GO

/*=============================================================================
 11. DỮ LIỆU SEED: ROLE, PERMISSION, USER
=============================================================================*/

INSERT INTO dbo.roles(name, description)
VALUES
(N'admin', N'Quản trị toàn bộ hệ thống'),
(N'staff', N'Nhân viên quản lý sách, kho và đơn hàng'),
(N'customer', N'Khách hàng mua sách');
GO

INSERT INTO dbo.permissions(code, name, module, description)
VALUES
(N'book.read',       N'Xem sách',                 N'book',       N'Xem danh sách và chi tiết sách'),
(N'book.create',     N'Thêm sách',                N'book',       N'Tạo sách mới'),
(N'book.update',     N'Cập nhật sách',            N'book',       N'Cập nhật thông tin sách'),
(N'book.delete',     N'Xóa sách',                 N'book',       N'Xóa mềm sách'),
(N'category.manage', N'Quản lý danh mục',         N'category',   N'Quản lý danh mục cha/con'),
(N'order.create',    N'Tạo đơn hàng',             N'order',      N'Đặt hàng'),
(N'order.read.own',  N'Xem đơn hàng cá nhân',     N'order',      N'Xem đơn của chính mình'),
(N'order.manage',    N'Quản lý đơn hàng',         N'order',      N'Xem và cập nhật mọi đơn hàng'),
(N'inventory.manage',N'Quản lý kho',              N'inventory',  N'Nhập, điều chỉnh và xem tồn kho'),
(N'revenue.view',    N'Xem doanh thu',            N'revenue',    N'Xem báo cáo doanh thu'),
(N'blog.manage',     N'Quản lý blog',             N'blog',       N'Tạo và cập nhật bài viết'),
(N'user.manage',     N'Quản lý người dùng',       N'user',       N'Quản lý tài khoản và phân quyền'),
(N'review.create',   N'Đánh giá sách',            N'review',     N'Tạo đánh giá sách');
GO

-- Admin có toàn bộ quyền.
INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.name = N'admin';

-- Staff có quyền vận hành, không có quyền quản lý user.
INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
INNER JOIN dbo.permissions p
    ON p.code IN
    (
        N'book.read', N'book.create', N'book.update', N'book.delete',
        N'category.manage', N'order.manage', N'inventory.manage',
        N'revenue.view', N'blog.manage'
    )
WHERE r.name = N'staff';

-- Customer có quyền mua hàng và đánh giá.
INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
INNER JOIN dbo.permissions p
    ON p.code IN (N'book.read', N'order.create', N'order.read.own', N'review.create')
WHERE r.name = N'customer';
GO

-- Hash bcrypt tương thích bcrypt/bcryptjs.
INSERT INTO dbo.[users]
(
    email, password_hash, first_name, last_name,
    phone, email_verified, is_active, is_deleted
)
VALUES
(
    N'admin@bookstore.com',
    N'$2b$10$qqZgrX3okgjOkLozfUXSd.5F2zstYCZ3vQv7iH0ojTAXTUwkkUj.y',
    N'Admin', N'System', N'0900000001', 1, 1, 0
),
(
    N'staff@bookstore.com',
    N'$2b$10$lW7P5ZUyKZJ8NUSPpqLSD.1.i38AFTK/mqJ7j/AwtGDH6Qytvg5Qy',
    N'Nhân viên', N'Bookarazi', N'0900000002', 1, 1, 0
),
(
    N'customer@bookstore.com',
    N'$2b$10$W6htdmtuXU/pfXqKoGnl5OxejR25Exjga057.lZUxgS/PzaN2y.XG',
    N'Khách hàng', N'Mẫu', N'0900000003', 1, 1, 0
);
GO

INSERT INTO dbo.user_roles(user_id, role_id)
SELECT u.id, r.id
FROM dbo.[users] u
INNER JOIN dbo.roles r
    ON (u.email = N'admin@bookstore.com' AND r.name = N'admin')
    OR (u.email = N'staff@bookstore.com' AND r.name = N'staff')
    OR (u.email = N'customer@bookstore.com' AND r.name = N'customer');
GO

/*=============================================================================
 12. DỮ LIỆU SEED: DANH MỤC CHA / CON
=============================================================================*/

INSERT INTO dbo.categories(name, slug, description, parent_id, display_order)
VALUES
(N'Văn học',                 N'van-hoc',                 N'Sách văn học trong và ngoài nước', NULL, 1),
(N'Kinh tế',                 N'kinh-te',                 N'Sách kinh doanh, kinh tế và tài chính', NULL, 2),
(N'Tâm lý - Kỹ năng sống',   N'tam-ly-ky-nang-song',    N'Sách tâm lý và phát triển bản thân', NULL, 3),
(N'Thiếu nhi',               N'thieu-nhi',               N'Sách dành cho trẻ em', NULL, 4),
(N'Ngoại ngữ',               N'ngoai-ngu',               N'Sách học ngoại ngữ', NULL, 5),
(N'Khoa học',                N'khoa-hoc',                N'Sách khoa học và khám phá', NULL, 6),
(N'Lịch sử',                 N'lich-su',                 N'Sách lịch sử Việt Nam và thế giới', NULL, 7),
(N'Công nghệ',               N'cong-nghe',               N'Sách công nghệ thông tin', NULL, 8);
GO

INSERT INTO dbo.categories(name, slug, parent_id, display_order)
SELECT N'Tiểu thuyết', N'tieu-thuyet', id, 1 FROM dbo.categories WHERE slug = N'van-hoc'
UNION ALL SELECT N'Ngôn tình', N'ngon-tinh', id, 2 FROM dbo.categories WHERE slug = N'van-hoc'
UNION ALL SELECT N'Light Novel', N'light-novel', id, 3 FROM dbo.categories WHERE slug = N'van-hoc'
UNION ALL SELECT N'Văn học Việt Nam', N'van-hoc-viet-nam', id, 4 FROM dbo.categories WHERE slug = N'van-hoc'
UNION ALL SELECT N'Văn học nước ngoài', N'van-hoc-nuoc-ngoai', id, 5 FROM dbo.categories WHERE slug = N'van-hoc'

UNION ALL SELECT N'Kinh doanh', N'kinh-doanh', id, 1 FROM dbo.categories WHERE slug = N'kinh-te'
UNION ALL SELECT N'Marketing', N'marketing', id, 2 FROM dbo.categories WHERE slug = N'kinh-te'
UNION ALL SELECT N'Tài chính', N'tai-chinh', id, 3 FROM dbo.categories WHERE slug = N'kinh-te'
UNION ALL SELECT N'Quản trị', N'quan-tri', id, 4 FROM dbo.categories WHERE slug = N'kinh-te'

UNION ALL SELECT N'Phát triển bản thân', N'phat-trien-ban-than', id, 1 FROM dbo.categories WHERE slug = N'tam-ly-ky-nang-song'
UNION ALL SELECT N'Kỹ năng sống', N'ky-nang-song', id, 2 FROM dbo.categories WHERE slug = N'tam-ly-ky-nang-song'
UNION ALL SELECT N'Tâm lý học', N'tam-ly-hoc', id, 3 FROM dbo.categories WHERE slug = N'tam-ly-ky-nang-song'

UNION ALL SELECT N'Truyện thiếu nhi', N'truyen-thieu-nhi', id, 1 FROM dbo.categories WHERE slug = N'thieu-nhi'
UNION ALL SELECT N'Kỹ năng cho bé', N'ky-nang-cho-be', id, 2 FROM dbo.categories WHERE slug = N'thieu-nhi'
UNION ALL SELECT N'Manga - Comic', N'manga-comic', id, 3 FROM dbo.categories WHERE slug = N'thieu-nhi'
UNION ALL SELECT N'Sách tô màu', N'sach-to-mau', id, 4 FROM dbo.categories WHERE slug = N'thieu-nhi'

UNION ALL SELECT N'Tiếng Anh', N'tieng-anh', id, 1 FROM dbo.categories WHERE slug = N'ngoai-ngu'
UNION ALL SELECT N'Tiếng Nhật', N'tieng-nhat', id, 2 FROM dbo.categories WHERE slug = N'ngoai-ngu'
UNION ALL SELECT N'IELTS', N'ielts', id, 3 FROM dbo.categories WHERE slug = N'ngoai-ngu'
UNION ALL SELECT N'TOEIC', N'toeic', id, 4 FROM dbo.categories WHERE slug = N'ngoai-ngu'
UNION ALL SELECT N'JLPT', N'jlpt', id, 5 FROM dbo.categories WHERE slug = N'ngoai-ngu'

UNION ALL SELECT N'Khám phá', N'kham-pha', id, 1 FROM dbo.categories WHERE slug = N'khoa-hoc'
UNION ALL SELECT N'Khoa học thường thức', N'khoa-hoc-thuong-thuc', id, 2 FROM dbo.categories WHERE slug = N'khoa-hoc'
UNION ALL SELECT N'Kiến thức bách khoa', N'kien-thuc-bach-khoa', id, 3 FROM dbo.categories WHERE slug = N'khoa-hoc'

UNION ALL SELECT N'Lịch sử Việt Nam', N'lich-su-viet-nam', id, 1 FROM dbo.categories WHERE slug = N'lich-su'
UNION ALL SELECT N'Lịch sử thế giới', N'lich-su-the-gioi', id, 2 FROM dbo.categories WHERE slug = N'lich-su'

UNION ALL SELECT N'Lập trình', N'lap-trinh', id, 1 FROM dbo.categories WHERE slug = N'cong-nghe'
UNION ALL SELECT N'Cơ sở dữ liệu', N'co-so-du-lieu', id, 2 FROM dbo.categories WHERE slug = N'cong-nghe'
UNION ALL SELECT N'Thiết kế web', N'thiet-ke-web', id, 3 FROM dbo.categories WHERE slug = N'cong-nghe'
UNION ALL SELECT N'Kỹ thuật phần mềm', N'ky-thuat-phan-mem', id, 4 FROM dbo.categories WHERE slug = N'cong-nghe';
GO

/*=============================================================================
 13. DỮ LIỆU SEED: TÁC GIẢ, NXB, NHÀ CUNG CẤP, TAG
=============================================================================*/

INSERT INTO dbo.authors(name, slug)
VALUES
(N'Alexandre Dumas', N'alexandre-dumas'),
(N'Dale Carnegie', N'dale-carnegie'),
(N'Paulo Coelho', N'paulo-coelho'),
(N'Tô Hoài', N'to-hoai'),
(N'Stephen Hawking', N'stephen-hawking'),
(N'Robert C. Martin', N'robert-c-martin'),
(N'Philip Kotler', N'philip-kotler'),
(N'Gege Akutami', N'gege-akutami'),
(N'Els Van Geyte', N'els-van-geyte'),
(N'Nhiều tác giả', N'nhieu-tac-gia');
GO

INSERT INTO dbo.publishers(name, slug)
VALUES
(N'NXB Văn Học', N'nxb-van-hoc'),
(N'NXB Trẻ', N'nxb-tre'),
(N'NXB Kim Đồng', N'nxb-kim-dong'),
(N'NXB Thế Giới', N'nxb-the-gioi'),
(N'NXB Tổng Hợp TP.HCM', N'nxb-tong-hop-tphcm'),
(N'NXB Lao Động', N'nxb-lao-dong');
GO

INSERT INTO dbo.suppliers(name, contact_name, phone, email, address)
VALUES
(N'Nhà sách Fahasa', N'Phòng kinh doanh', N'0280000001', N'sales@fahasa.local', N'TP. Hồ Chí Minh'),
(N'Nhà sách Phương Nam', N'Phòng phân phối', N'0280000002', N'sales@phuongnam.local', N'TP. Hồ Chí Minh'),
(N'Nhà phân phối Bookarazi', N'Kho trung tâm', N'0900000010', N'warehouse@bookarazi.local', N'Hà Nội');
GO

INSERT INTO dbo.tags(name, slug)
VALUES
(N'Bán chạy', N'ban-chay'),
(N'Xu hướng', N'xu-huong'),
(N'Mới', N'moi'),
(N'Giảm giá', N'giam-gia');
GO

/*=============================================================================
 14. DỮ LIỆU SEED: SÁCH
=============================================================================*/

DECLARE @SeedBooks TABLE
(
    title NVARCHAR(500),
    slug NVARCHAR(550),
    isbn NVARCHAR(30),
    category_slug NVARCHAR(180),
    author_slug NVARCHAR(280),
    publisher_slug NVARCHAR(280),
    description NVARCHAR(MAX),
    price DECIMAL(18,2),
    original_price DECIMAL(18,2),
    discount_percent DECIMAL(5,2),
    stock_quantity INT,
    sold_count INT,
    rating DECIMAL(3,2),
    review_count INT,
    pages INT,
    language NVARCHAR(100),
    publication_year INT,
    is_featured BIT,
    is_bestseller BIT,
    is_new BIT
);

INSERT INTO @SeedBooks
VALUES
(N'Bá Tước Monte Cristo', N'ba-tuoc-monte-cristo', N'9786040000011', N'tieu-thuyet', N'alexandre-dumas', N'nxb-van-hoc',
 N'Tác phẩm kinh điển về công lý, sự trả thù, tình yêu và lòng vị tha.', 176000, 176000, 25, 10, 770, 4.80, 1600, 1280, N'Tiếng Việt', 2024, 1, 1, 0),

(N'Đắc Nhân Tâm', N'dac-nhan-tam', N'9786040000012', N'phat-trien-ban-than', N'dale-carnegie', N'nxb-tong-hop-tphcm',
 N'Cuốn sách nổi tiếng về nghệ thuật giao tiếp và ứng xử.', 120000, 150000, 20, 35, 1250, 4.90, 2500, 320, N'Tiếng Việt', 2023, 1, 1, 0),

(N'Nhà Giả Kim', N'nha-gia-kim', N'9786040000013', N'van-hoc-nuoc-ngoai', N'paulo-coelho', N'nxb-van-hoc',
 N'Câu chuyện về hành trình theo đuổi ước mơ và vận mệnh.', 79000, 99000, 20, 42, 980, 4.75, 1800, 228, N'Tiếng Việt', 2023, 1, 1, 0),

(N'Dế Mèn Phiêu Lưu Ký', N'de-men-phieu-luu-ky', N'9786040000014', N'truyen-thieu-nhi', N'to-hoai', N'nxb-kim-dong',
 N'Tác phẩm thiếu nhi kinh điển của nhà văn Tô Hoài.', 65000, 65000, 0, 50, 690, 4.70, 900, 180, N'Tiếng Việt', 2024, 1, 1, 0),

(N'Lược Sử Thời Gian', N'luoc-su-thoi-gian', N'9786040000015', N'khoa-hoc-thuong-thuc', N'stephen-hawking', N'nxb-tre',
 N'Giới thiệu các khái niệm về vũ trụ, thời gian và không gian.', 145000, 170000, 15, 23, 460, 4.60, 620, 256, N'Tiếng Việt', 2022, 1, 1, 0),

(N'Clean Code', N'clean-code', N'9786040000016', N'lap-trinh', N'robert-c-martin', N'nxb-lao-dong',
 N'Nguyên tắc viết mã sạch, dễ đọc, dễ kiểm thử và dễ bảo trì.', 320000, 350000, 9, 18, 520, 4.85, 760, 464, N'Tiếng Việt', 2024, 1, 1, 0),

(N'Marketing 4.0', N'marketing-4-0', N'9786040000017', N'marketing', N'philip-kotler', N'nxb-tre',
 N'Chuyển dịch từ marketing truyền thống sang marketing số.', 169000, 199000, 15, 30, 410, 4.50, 500, 280, N'Tiếng Việt', 2023, 0, 1, 0),

(N'Collins Reading for IELTS', N'collins-reading-for-ielts', N'9786040000018', N'ielts', N'els-van-geyte', N'nxb-the-gioi',
 N'Tài liệu luyện kỹ năng đọc cho kỳ thi IELTS.', 210000, 210000, 0, 26, 350, 4.60, 430, 144, N'Tiếng Anh', 2024, 1, 1, 0),

(N'Từ Vựng Tiếng Nhật Theo Cấp Độ', N'tu-vung-tieng-nhat-theo-cap-do', N'9786040000019', N'tieng-nhat', N'nhieu-tac-gia', N'nxb-the-gioi',
 N'Hệ thống từ vựng tiếng Nhật theo các cấp độ học tập.', 115000, 115000, 0, 64, 270, 4.30, 280, 240, N'Tiếng Nhật - Việt', 2024, 0, 0, 1),

(N'Luyện Thi JLPT N3 - Nghe Hiểu', N'luyen-thi-jlpt-n3-nghe-hieu', N'9786040000020', N'jlpt', N'nhieu-tac-gia', N'nxb-the-gioi',
 N'Tài liệu luyện nghe dành cho kỳ thi năng lực tiếng Nhật JLPT N3.', 145000, 145000, 2, 50, 320, 4.45, 350, 220, N'Tiếng Nhật - Việt', 2024, 0, 1, 1),

(N'Từ Vựng Tiếng Nhật Tổng Hợp', N'tu-vung-tieng-nhat-tong-hop', N'9786040000021', N'tieng-nhat', N'nhieu-tac-gia', N'nxb-the-gioi',
 N'Tổng hợp từ vựng tiếng Nhật thông dụng.', 105000, 105000, 0, 60, 210, 4.20, 200, 200, N'Tiếng Nhật - Việt', 2024, 0, 0, 1),

(N'Ngữ Pháp Tiếng Nhật Cơ Bản', N'ngu-phap-tieng-nhat-co-ban', N'9786040000022', N'tieng-nhat', N'nhieu-tac-gia', N'nxb-the-gioi',
 N'Giáo trình ngữ pháp tiếng Nhật dành cho người mới bắt đầu.', 95000, 95000, 0, 72, 240, 4.35, 230, 180, N'Tiếng Nhật - Việt', 2024, 0, 0, 1),

(N'Kanji Trung Cấp', N'kanji-trung-cap', N'9786040000023', N'jlpt', N'nhieu-tac-gia', N'nxb-the-gioi',
 N'Sách học Kanji trình độ trung cấp.', 125000, 125000, 0, 58, 250, 4.40, 260, 230, N'Tiếng Nhật - Việt', 2024, 0, 0, 1),

(N'Chú Thuật Hồi Chiến - Tập 20', N'chu-thuat-hoi-chien-tap-20', N'9786040000024', N'manga-comic', N'gege-akutami', N'nxb-kim-dong',
 N'Tập 20 của bộ truyện Chú Thuật Hồi Chiến.', 35000, 35000, 0, 80, 1350, 4.60, 1350, 192, N'Tiếng Việt', 2024, 1, 1, 0),

(N'Chú Thuật Hồi Chiến - Tập 25', N'chu-thuat-hoi-chien-tap-25', N'9786040000025', N'manga-comic', N'gege-akutami', N'nxb-kim-dong',
 N'Tập 25 của bộ truyện Chú Thuật Hồi Chiến.', 35000, 35000, 0, 75, 1450, 4.70, 1450, 192, N'Tiếng Việt', 2025, 1, 1, 1),

(N'Chú Thuật Hồi Chiến - Tập 25 Bản Đặc Biệt', N'chu-thuat-hoi-chien-tap-25-ban-dac-biet', N'9786040000026', N'manga-comic', N'gege-akutami', N'nxb-kim-dong',
 N'Phiên bản đặc biệt của tập 25.', 45000, 45000, 0, 40, 890, 4.85, 890, 192, N'Tiếng Việt', 2025, 1, 1, 1),

(N'Chú Thuật Hồi Chiến - Tập 26', N'chu-thuat-hoi-chien-tap-26', N'9786040000027', N'manga-comic', N'gege-akutami', N'nxb-kim-dong',
 N'Tập 26 của bộ truyện Chú Thuật Hồi Chiến.', 35000, 35000, 0, 90, 1600, 4.80, 1600, 192, N'Tiếng Việt', 2026, 1, 1, 1),

(N'SQL Server Căn Bản', N'sql-server-can-ban', N'9786040000028', N'co-so-du-lieu', N'nhieu-tac-gia', N'nxb-lao-dong',
 N'Kiến thức nền tảng về SQL Server và thiết kế cơ sở dữ liệu.', 185000, 210000, 12, 20, 180, 4.30, 160, 360, N'Tiếng Việt', 2025, 0, 0, 1),

(N'React và TypeScript Thực Chiến', N'react-va-typescript-thuc-chien', N'9786040000029', N'thiet-ke-web', N'nhieu-tac-gia', N'nxb-lao-dong',
 N'Xây dựng giao diện web hiện đại với React và TypeScript.', 245000, 280000, 13, 22, 220, 4.55, 200, 410, N'Tiếng Việt', 2026, 1, 0, 1),

(N'Đại Việt Sử Ký Toàn Thư', N'dai-viet-su-ky-toan-thu', N'9786040000030', N'lich-su-viet-nam', N'nhieu-tac-gia', N'nxb-van-hoc',
 N'Bộ sử liệu quan trọng về lịch sử Việt Nam.', 290000, 320000, 9, 12, 190, 4.70, 210, 800, N'Tiếng Việt', 2023, 0, 0, 0);

INSERT INTO dbo.books
(
    title, slug, isbn, category_id, author_id, publisher_id, supplier_id,
    author, publisher, description, short_description,
    price, original_price, discount_percent,
    stock_quantity, sold_count, rating, review_count,
    pages, language, publication_year,
    is_featured, is_bestseller, is_new
)
SELECT
    sb.title,
    sb.slug,
    sb.isbn,
    c.id,
    a.id,
    p.id,
    (SELECT TOP (1) id FROM dbo.suppliers ORDER BY id),
    a.name,
    p.name,
    sb.description,
    LEFT(sb.description, 1200),
    sb.price,
    sb.original_price,
    sb.discount_percent,
    sb.stock_quantity,
    sb.sold_count,
    sb.rating,
    sb.review_count,
    sb.pages,
    sb.language,
    sb.publication_year,
    sb.is_featured,
    sb.is_bestseller,
    sb.is_new
FROM @SeedBooks sb
INNER JOIN dbo.categories c ON c.slug = sb.category_slug
LEFT JOIN dbo.authors a ON a.slug = sb.author_slug
LEFT JOIN dbo.publishers p ON p.slug = sb.publisher_slug;
GO

-- Ảnh seed dùng đường dẫn tương đối. Có thể đổi sang đúng tên file trong FE/public hoặc uploads.
INSERT INTO dbo.book_images(book_id, image_url, alt_text, is_primary, display_order)
SELECT
    b.id,
    N'/images/books/' + b.slug + N'.jpg',
    b.title,
    1,
    0
FROM dbo.books b;
GO

-- Tag tự động từ trạng thái sách.
INSERT INTO dbo.book_tags(book_id, tag_id)
SELECT b.id, t.id
FROM dbo.books b
INNER JOIN dbo.tags t ON
       (b.is_bestseller = 1 AND t.slug = N'ban-chay')
    OR (b.is_new = 1 AND t.slug = N'moi')
    OR (b.discount_percent > 0 AND t.slug = N'giam-gia')
    OR (b.sold_count >= 500 AND t.slug = N'xu-huong');
GO

-- Ghi nhận số tồn đầu kỳ.
INSERT INTO dbo.inventory_transactions
(
    book_id, supplier_id, transaction_type, quantity_delta,
    quantity_before, quantity_after, unit_cost,
    reference_type, reference_id, note,
    created_by
)
SELECT
    b.id,
    b.supplier_id,
    N'opening',
    b.stock_quantity,
    0,
    b.stock_quantity,
    b.original_price,
    N'seed',
    N'initial',
    N'Tồn kho khởi tạo khi dựng lại database',
    u.id
FROM dbo.books b
CROSS JOIN dbo.[users] u
WHERE u.email = N'admin@bookstore.com'
  AND b.stock_quantity > 0;
GO

/*=============================================================================
 15. DỮ LIỆU DEMO: GIỎ HÀNG, ĐƠN HÀNG, BLOG
=============================================================================*/

DECLARE @CustomerId INT = (SELECT id FROM dbo.[users] WHERE email = N'customer@bookstore.com');
DECLARE @CartId BIGINT;

INSERT INTO dbo.carts(user_id, status)
VALUES(@CustomerId, N'active');

SET @CartId = SCOPE_IDENTITY();

INSERT INTO dbo.cart_items(cart_id, book_id, quantity)
SELECT @CartId, id, 1
FROM dbo.books
WHERE slug IN (N'nha-gia-kim', N'clean-code');
GO

DECLARE @AdminId INT = (SELECT id FROM dbo.[users] WHERE email = N'admin@bookstore.com');

INSERT INTO dbo.blogs(title, slug, excerpt, content, author_id, status, published_at)
VALUES
(
    N'5 cách lựa chọn sách phù hợp với bạn',
    N'5-cach-lua-chon-sach-phu-hop',
    N'Một số gợi ý giúp người đọc tìm được cuốn sách phù hợp.',
    N'<h2>Chọn sách theo mục tiêu</h2><p>Hãy xác định mục tiêu đọc, chủ đề quan tâm và thời gian có thể dành cho việc đọc.</p>',
    @AdminId,
    N'published',
    SYSUTCDATETIME()
);
GO

-- Hai đơn demo để trang quản lý đơn hàng và doanh thu có dữ liệu.
DECLARE @DemoCustomerId INT = (SELECT id FROM dbo.[users] WHERE email = N'customer@bookstore.com');
DECLARE @AdminId2 INT = (SELECT id FROM dbo.[users] WHERE email = N'admin@bookstore.com');
DECLARE @Book1 INT = (SELECT id FROM dbo.books WHERE slug = N'dac-nhan-tam');
DECLARE @Book2 INT = (SELECT id FROM dbo.books WHERE slug = N'collins-reading-for-ielts');
DECLARE @Price1 DECIMAL(18,2) = (SELECT CAST(ROUND(price * (1 - discount_percent / 100.0), 2) AS DECIMAL(18,2)) FROM dbo.books WHERE id = @Book1);
DECLARE @Price2 DECIMAL(18,2) = (SELECT CAST(ROUND(price * (1 - discount_percent / 100.0), 2) AS DECIMAL(18,2)) FROM dbo.books WHERE id = @Book2);
DECLARE @DemoOrderId BIGINT;

INSERT INTO dbo.orders
(
    order_code, user_id, customer_name, customer_email, customer_phone,
    shipping_address, subtotal, shipping_fee, discount_amount, total_amount,
    status, payment_method, payment_status,
    created_at, updated_at
)
VALUES
(
    N'ORD-DEMO-0001', @DemoCustomerId, N'Khách hàng Mẫu', N'customer@bookstore.com', N'0900000003',
    N'Hà Nội', @Price1, 30000, 0, @Price1 + 30000,
    N'completed', N'cod', N'paid',
    DATEADD(DAY, -2, SYSUTCDATETIME()), DATEADD(DAY, -1, SYSUTCDATETIME())
);

SET @DemoOrderId = SCOPE_IDENTITY();

INSERT INTO dbo.order_items(order_id, book_id, book_title, isbn, quantity, unit_price, discount_amount, line_total)
SELECT @DemoOrderId, id, title, isbn, 1, @Price1,
       CAST(ROUND(price * discount_percent / 100.0, 2) AS DECIMAL(18,2)), @Price1
FROM dbo.books WHERE id = @Book1;

INSERT INTO dbo.order_status_history(order_id, old_status, new_status, note, changed_by, created_at)
VALUES
(@DemoOrderId, NULL, N'pending', N'Tạo đơn demo', @DemoCustomerId, DATEADD(DAY, -2, SYSUTCDATETIME())),
(@DemoOrderId, N'pending', N'completed', N'Hoàn tất đơn demo', @AdminId2, DATEADD(DAY, -1, SYSUTCDATETIME()));

INSERT INTO dbo.orders
(
    order_code, user_id, customer_name, customer_email, customer_phone,
    shipping_address, subtotal, shipping_fee, discount_amount, total_amount,
    status, payment_method, payment_status
)
VALUES
(
    N'ORD-DEMO-0002', @DemoCustomerId, N'Khách hàng Mẫu', N'customer@bookstore.com', N'0900000003',
    N'Hưng Yên', @Price2, 30000, 0, @Price2 + 30000,
    N'pending', N'cod', N'unpaid'
);

SET @DemoOrderId = SCOPE_IDENTITY();

INSERT INTO dbo.order_items(order_id, book_id, book_title, isbn, quantity, unit_price, discount_amount, line_total)
SELECT @DemoOrderId, id, title, isbn, 1, @Price2,
       CAST(ROUND(price * discount_percent / 100.0, 2) AS DECIMAL(18,2)), @Price2
FROM dbo.books WHERE id = @Book2;

INSERT INTO dbo.order_status_history(order_id, old_status, new_status, note, changed_by)
VALUES(@DemoOrderId, NULL, N'pending', N'Tạo đơn demo', @DemoCustomerId);
GO

/*=============================================================================
 16. KIỂM TRA SAU KHI IMPORT
=============================================================================*/

PRINT N'============================================================';
PRINT N'ĐÃ TẠO XONG DATABASE bookstore_db';
PRINT N'Admin: admin@bookstore.com / 1';
PRINT N'============================================================';

SELECT DB_NAME() AS current_database;

SELECT
    (SELECT COUNT(*) FROM dbo.[users]) AS users_count,
    (SELECT COUNT(*) FROM dbo.roles) AS roles_count,
    (SELECT COUNT(*) FROM dbo.categories WHERE parent_id IS NULL) AS parent_categories_count,
    (SELECT COUNT(*) FROM dbo.categories WHERE parent_id IS NOT NULL) AS child_categories_count,
    (SELECT COUNT(*) FROM dbo.books) AS books_count,
    (SELECT COUNT(*) FROM dbo.orders) AS orders_count;

SELECT
    u.id,
    u.email,
    u.is_active,
    u.is_deleted,
    STRING_AGG(r.name, N', ') AS roles
FROM dbo.[users] u
LEFT JOIN dbo.user_roles ur ON ur.user_id = u.id
LEFT JOIN dbo.roles r ON r.id = ur.role_id
GROUP BY u.id, u.email, u.is_active, u.is_deleted
ORDER BY u.id;

SELECT
    p.id AS parent_id,
    p.name AS parent_name,
    COUNT(c.id) AS child_count
FROM dbo.categories p
LEFT JOIN dbo.categories c ON c.parent_id = p.id AND c.is_active = 1
WHERE p.parent_id IS NULL
GROUP BY p.id, p.name, p.display_order
ORDER BY p.display_order, p.name;

SELECT TOP (20)
    id, title, author_name AS author, category_name, parent_category_name,
    sale_price, stock_quantity, sold_count
FROM dbo.vw_BookCatalog
WHERE is_active = 1 AND is_deleted = 0
ORDER BY sold_count DESC, id;
GO



USE bookstore_db;
GO

IF COL_LENGTH('dbo.users', 'birth_date') IS NULL
BEGIN
    ALTER TABLE dbo.users
    ADD birth_date DATE NULL;
END;
GO