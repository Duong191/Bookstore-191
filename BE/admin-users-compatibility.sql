/* Bổ sung hồ sơ khi dựng DB từ DB_bookstore.sql; không xóa bảng/dữ liệu hoặc đổi role. */
USE bookstore_db;
GO
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
    THROW 50001, N'Cần tạo bảng users trước khi bổ sung cột hồ sơ.', 1;
GO
IF COL_LENGTH(N'dbo.users', N'gender') IS NULL
    ALTER TABLE dbo.users ADD gender NVARCHAR(10) NULL;
GO
IF COL_LENGTH(N'dbo.users', N'birth_date') IS NULL
    ALTER TABLE dbo.users ADD birth_date DATE NULL;
GO
