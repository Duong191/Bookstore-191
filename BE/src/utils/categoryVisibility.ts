/** Alias chỉ do code cung cấp; danh mục con ẩn theo cha, giữ nguyên cờ riêng của con. */
export const visibleCategorySql = (alias = "c") => `${alias}.is_deleted=0 AND ${alias}.is_active=1
  AND (${alias}.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories visible_parent
    WHERE visible_parent.id=${alias}.parent_id AND visible_parent.is_deleted=0 AND visible_parent.is_active=1))`;
