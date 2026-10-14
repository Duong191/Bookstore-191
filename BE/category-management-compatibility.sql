/* Migration cộng thêm, chạy lại an toàn trên DB hiện tại. Không DROP, không đổi danh mục/sách cũ. */
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.categories',N'U') IS NULL
    THROW 50001, N'Chưa có bảng categories.', 1;
  IF COL_LENGTH(N'dbo.categories',N'is_deleted') IS NULL
    ALTER TABLE dbo.categories ADD is_deleted BIT NOT NULL CONSTRAINT DF_categories_is_deleted_compat DEFAULT(0) WITH VALUES;
  IF COL_LENGTH(N'dbo.categories',N'deleted_at') IS NULL
    ALTER TABLE dbo.categories ADD deleted_at DATETIME2 NULL;
  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.categories') AND name=N'IX_categories_management')
    EXEC(N'CREATE INDEX IX_categories_management ON dbo.categories(parent_id,is_deleted,is_active,display_order)');
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
END CATCH;
