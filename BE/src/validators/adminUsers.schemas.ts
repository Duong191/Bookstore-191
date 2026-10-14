/** Kiểm tra dữ liệu quản lý tài khoản; không nhận role/password qua API sửa hồ sơ. */
import { z } from "zod";

export const accountRoleSchema = z.enum(["user", "staff", "admin"]);
const name = z.string().trim().min(1, "Họ/tên không được để trống").max(100);
const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Ngày sinh không hợp lệ");

export const accountIdSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/, "Mã tài khoản không hợp lệ")
    .refine((value) => Number.isSafeInteger(Number(value)), "Mã tài khoản quá lớn")
});

export const listAccountsSchema = z.object({
  search: z.string().trim().max(255).optional(),
  role: accountRoleSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict();

export const createAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự")
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Mật khẩu tối đa 72 byte"),
  firstName: name,
  lastName: name,
  phone: z.string().trim().max(20).default(""),
  role: accountRoleSchema.default("user"),
  isActive: z.boolean().default(true)
}).strict();

export const updateAccountSchema = z.object({
  firstName: name.optional(),
  lastName: name.optional(),
  phone: z.string().trim().max(20).optional(),
  gender: z.string().trim().max(10).nullable().optional(),
  birthDate: birthDate.nullable().optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0, "Cần gửi ít nhất một trường cập nhật");

export const updateRoleSchema = z.object({ role: accountRoleSchema }).strict();
export const updateStatusSchema = z.object({ isActive: z.boolean() }).strict();

export type AccountRole = z.infer<typeof accountRoleSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsInput = z.infer<typeof listAccountsSchema>;
