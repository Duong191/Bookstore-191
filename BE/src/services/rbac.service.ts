/** File này tải role và permission của user từ cơ sở dữ liệu. */
import { getDb, sql } from "../config/db";

export const getUserAuthData = async (userId: number) => {
  const pool = await getDb();
  const result = await pool
    .request()
    .input("userId", sql.BigInt, userId)
    .query(
      `
      SELECT 
        u.id,
        u.email,
        r.name AS role_name,
        p.name AS permission_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = @userId AND u.is_deleted = 0 AND u.is_active = 1
      `
    );

  if (!result.recordset.length) return null;

  const rows = result.recordset as { role_name: string | null; permission_name: string | null; id: number; email: string }[];
  // Schema mới lưu customer; giữ hợp đồng user/staff/admin của FE và middleware.
  const roles = Array.from(new Set(rows.map((x) => x.role_name === "customer" ? "user" : x.role_name).filter((x): x is string => Boolean(x))));
  const permissions = Array.from(new Set(rows.map((x) => x.permission_name).filter((x): x is string => Boolean(x))));

  return {
    id: Number(rows[0].id),
    email: String(rows[0].email),
    roles,
    permissions
  };
};
