/** Quản lý tài khoản dành riêng cho ADMIN, giữ dữ liệu đơn hàng bằng xóa mềm. */
import bcrypt from "bcryptjs";
import { getDb, sql } from "../config/db";
import { AppError } from "../utils/appError";
import type { AccountRole, CreateAccountInput, ListAccountsInput, UpdateAccountInput } from "../validators/adminUsers.schemas";

const primaryRoleSql = `CASE
  WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin') THEN 'admin'
  WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='staff') THEN 'staff'
  ELSE 'user' END`;

// Liệt kê rõ cột được phép trả; tuyệt đối không SELECT password_hash hoặc token.
const accountSelect = `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
  u.gender, u.birth_date, u.avatar_url, u.is_active, u.created_at, u.updated_at,
  ${primaryRoleSql} AS role_name FROM users u`;

const mapAccount = (row: Record<string, unknown>) => ({
  id: String(row.id), email: String(row.email),
  firstName: String(row.first_name ?? ""), lastName: String(row.last_name ?? ""),
  name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
  phone: String(row.phone ?? ""), gender: row.gender == null ? null : String(row.gender),
  birthDate: row.birth_date == null ? null : new Date(row.birth_date as string | Date).toISOString().slice(0, 10),
  avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
  role: String(row.role_name) as AccountRole,
  isActive: row.is_active === true || row.is_active === 1,
  createdAt: new Date(row.created_at as string | Date).toISOString(),
  updatedAt: new Date(row.updated_at as string | Date).toISOString()
});

const readAccount = async (request: sql.Request, id: number) => {
  const rs = await request.input("id", sql.BigInt, id).query(`${accountSelect} WHERE u.id=@id AND u.is_deleted=0`);
  if (!rs.recordset.length) throw new AppError(404, "Không tìm thấy tài khoản");
  return mapAccount(rs.recordset[0]);
};

export const getAccount = async (id: number) => readAccount((await getDb()).request(), id);

export const listAccounts = async (query: ListAccountsInput) => {
  const db = await getDb();
  // Escape wildcard LIKE để tìm kiếm ký tự người dùng nhập, không diễn giải %/_ như pattern.
  const search = query.search?.replace(/[~%_\[]/g, "~$&");
  const filter = `u.is_deleted=0
    AND (@search IS NULL OR u.email LIKE @search ESCAPE '~' OR u.phone LIKE @search ESCAPE '~'
      OR CONCAT(u.first_name, N' ', u.last_name) LIKE @search ESCAPE '~')
    AND (@role IS NULL OR ${primaryRoleSql} = @role)
    AND (@active IS NULL OR u.is_active=@active)`;
  const rs = await db.request()
    .input("search", sql.NVarChar(520), search ? `%${search}%` : null)
    .input("role", sql.NVarChar(20), query.role ?? null)
    .input("active", sql.Bit, query.isActive === undefined ? null : query.isActive === "true")
    .input("limit", sql.Int, query.limit)
    .input("offset", sql.Int, (query.page - 1) * query.limit)
    .query(`${accountSelect} WHERE ${filter}
      ORDER BY u.created_at DESC, u.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      SELECT COUNT(*) AS total FROM users u WHERE ${filter};`);
  const sets = rs.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  return { items: sets[0].map(mapAccount), meta: { page: query.page, limit: query.limit, total: Number(sets[1][0].total) } };
};

/** Mọi thay đổi tài khoản dùng chung khóa transaction để hai request không loại bỏ đồng thời admin cuối. */
const mutateAccounts = async <T>(actorId: number, operation: (tx: sql.Transaction) => Promise<T>): Promise<T> => {
  const tx = new sql.Transaction(await getDb());
  await tx.begin();
  try {
    const lock = await new sql.Request(tx).query(`DECLARE @result int;
      EXEC @result = sys.sp_getapplock @Resource=N'bookarazi:admin-users', @LockMode='Exclusive',
        @LockOwner='Transaction', @LockTimeout=10000;
      SELECT @result AS lock_result;`);
    if (Number(lock.recordset[0].lock_result) < 0) throw new AppError(409, "Tài khoản đang được cập nhật, vui lòng thử lại");
    // Kiểm tra lại người thao tác bên trong khóa, tránh dùng quyền đã bị thu hồi bởi request trước.
    const actor = await new sql.Request(tx).input("actorId", sql.BigInt, actorId).query(`
      SELECT u.id FROM users u WHERE u.id=@actorId AND u.is_active=1 AND u.is_deleted=0
      AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')`);
    if (!actor.recordset.length) throw new AppError(403, "Chỉ ADMIN đang hoạt động được quản lý tài khoản");
    const result = await operation(tx);
    await tx.commit();
    return result;
  } catch (error) {
    // Giữ lỗi nghiệp vụ gốc nếu SQL Server đã tự rollback transaction.
    try { await tx.rollback(); } catch { /* transaction đã kết thúc */ }
    const number = (error as { number?: number }).number;
    if (number === 2601 || number === 2627) throw new AppError(409, "Email đã được sử dụng");
    throw error;
  }
};

const protectLastAdmin = async (tx: sql.Transaction, id: number, remainsActiveAdmin: boolean) => {
  if (remainsActiveAdmin) return;
  const rs = await new sql.Request(tx).input("targetId", sql.BigInt, id).query(`
    SELECT u.id FROM users u WHERE u.is_active=1 AND u.is_deleted=0
      AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')`);
  if (rs.recordset.some((row: { id: number }) => Number(row.id) === id) && rs.recordset.length <= 1) {
    throw new AppError(409, "Không thể khóa, xóa hoặc hạ quyền ADMIN đang hoạt động cuối cùng");
  }
};

/** Giữ role public user/staff/admin; chấp nhận customer là tên lưu DB của schema mới. */
const resolveRoleId = async (tx: sql.Transaction, role: AccountRole): Promise<number> => {
  const rs = await new sql.Request(tx).input("role", sql.NVarChar(20), role).query(`
    SELECT TOP 1 id FROM roles WHERE name=@role OR (@role='user' AND name='customer')
    ORDER BY CASE WHEN name=@role THEN 0 ELSE 1 END`);
  if (!rs.recordset.length) throw new AppError(409, `Database chưa có role ${role}`);
  return Number(rs.recordset[0].id);
};

const clearRefreshTokens = async (tx: sql.Transaction, id: number) => {
  await new sql.Request(tx).input("id", sql.BigInt, id).query("DELETE FROM refresh_tokens WHERE user_id=@id");
};

export const createAccount = async (actorId: number, input: CreateAccountInput) => {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return mutateAccounts(actorId, async (tx) => {
    // Kiểm tra cả email đã xóa mềm, vì schema mới có unique email trên mọi bản ghi.
    const duplicate = await new sql.Request(tx).input("email", sql.NVarChar(255), input.email)
      .query("SELECT id FROM users WHERE LOWER(LTRIM(RTRIM(email)))=@email");
    if (duplicate.recordset.length) throw new AppError(409, "Email đã được sử dụng");
    const roleId = await resolveRoleId(tx, input.role);
    const rs = await new sql.Request(tx)
      .input("email", sql.NVarChar(255), input.email).input("hash", sql.NVarChar(255), passwordHash)
      .input("firstName", sql.NVarChar(100), input.firstName).input("lastName", sql.NVarChar(100), input.lastName)
      .input("phone", sql.NVarChar(20), input.phone || null).input("active", sql.Bit, input.isActive)
      .query(`INSERT INTO users (email,password_hash,first_name,last_name,phone,is_active,is_deleted,created_at,updated_at)
        OUTPUT INSERTED.id VALUES (@email,@hash,@firstName,@lastName,@phone,@active,0,GETUTCDATE(),GETUTCDATE())`);
    const id = Number(rs.recordset[0].id);
    await new sql.Request(tx).input("id", sql.BigInt, id).input("roleId", sql.BigInt, roleId)
      .query("INSERT INTO user_roles (user_id,role_id,created_at) VALUES (@id,@roleId,GETUTCDATE())");
    return readAccount(new sql.Request(tx), id);
  });
};

export const updateAccount = async (actorId: number, id: number, input: UpdateAccountInput) => mutateAccounts(actorId, async (tx) => {
  const current = await readAccount(new sql.Request(tx), id);
  const active = input.isActive ?? current.isActive;
  await protectLastAdmin(tx, id, current.role === "admin" && active);
  const request = new sql.Request(tx).input("id", sql.BigInt, id);
  const assignments = ["updated_at=GETUTCDATE()"];
  // Danh sách cột cố định; hỗ trợ gửi null để xóa giá trị optional, không ghép tên cột từ input.
  const fields = [
    ["firstName", "first_name", sql.NVarChar(100)], ["lastName", "last_name", sql.NVarChar(100)],
    ["phone", "phone", sql.NVarChar(20)], ["gender", "gender", sql.NVarChar(10)],
    ["birthDate", "birth_date", sql.Date], ["avatarUrl", "avatar_url", sql.NVarChar(500)],
    ["isActive", "is_active", sql.Bit]
  ] as const;
  for (const [key, column, type] of fields) {
    if (input[key] !== undefined) {
      assignments.push(`${column}=@${key}`);
      request.input(key, type, input[key]);
    }
  }
  await request.query(`UPDATE users SET ${assignments.join(",")} WHERE id=@id AND is_deleted=0`);
  if (input.isActive === false) await clearRefreshTokens(tx, id);
  return readAccount(new sql.Request(tx), id);
});

export const updateAccountRole = async (actorId: number, id: number, role: AccountRole) => mutateAccounts(actorId, async (tx) => {
  const current = await readAccount(new sql.Request(tx), id);
  await protectLastAdmin(tx, id, role === "admin" && current.isActive);
  const roleId = await resolveRoleId(tx, role);
  await new sql.Request(tx).input("id", sql.BigInt, id).query("DELETE FROM user_roles WHERE user_id=@id");
  await new sql.Request(tx).input("id", sql.BigInt, id).input("roleId", sql.BigInt, roleId)
    .query("INSERT INTO user_roles (user_id,role_id,created_at) VALUES (@id,@roleId,GETUTCDATE())");
  await new sql.Request(tx).input("id", sql.BigInt, id).query("UPDATE users SET updated_at=GETUTCDATE() WHERE id=@id");
  await clearRefreshTokens(tx, id);
  return readAccount(new sql.Request(tx), id);
});

export const deleteAccount = async (actorId: number, id: number) => {
  if (actorId === id) throw new AppError(409, "Không thể xóa tài khoản đang đăng nhập");
  return mutateAccounts(actorId, async (tx) => {
    await readAccount(new sql.Request(tx), id);
    await protectLastAdmin(tx, id, false);
    await new sql.Request(tx).input("id", sql.BigInt, id)
      .query("UPDATE users SET is_active=0,is_deleted=1,deleted_at=GETUTCDATE(),updated_at=GETUTCDATE() WHERE id=@id");
    await clearRefreshTokens(tx, id);
  });
};
