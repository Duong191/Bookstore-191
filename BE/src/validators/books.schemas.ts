/** Dữ liệu CRUD sách; arrays rỗng nghĩa là xóa ảnh/tags, field không gửi được giữ nguyên. */
import { z } from "zod";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Ngày xuất bản không hợp lệ");
const fields = {
  title: z.string().trim().min(1).max(255), author: z.string().trim().min(1).max(255),
  categoryId: z.number().int().positive(), price: z.number().nonnegative(), stock: z.number().int().nonnegative(),
  isbn: z.string().trim().max(20).nullable().optional(), publisher: z.string().trim().max(255).nullable().optional(),
  publishDate: date.nullable().optional(), description: z.string().optional(),
  pages: z.number().int().positive().nullable().optional(), language: z.string().trim().max(50).nullable().optional(),
  format: z.string().trim().max(100).nullable().optional(), importPrice: z.number().nonnegative().nullable().optional(),
  discount: z.number().min(0).max(100).optional(), rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(), soldCount: z.number().int().nonnegative().optional(),
  images: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  image: z.string().trim().max(500).optional(), tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  featured: z.boolean().optional(), bestseller: z.boolean().optional(), trending: z.boolean().optional(), isNew: z.boolean().optional()
  ,isActive:z.boolean().optional()
};
export const createBookSchema = z.object(fields).strict();
export const updateBookSchema = z.object(fields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Cần gửi thông tin sách cần cập nhật");
export const bookIdSchema = z.object({ id: z.string().regex(/^[1-9]\d*$/)
  .refine((value) => Number.isSafeInteger(Number(value)), "Mã sách không hợp lệ") });
export const bookStatusSchema=z.object({isActive:z.boolean()}).strict();
export const adminBookListSchema=z.object({
  search:z.string().trim().max(255).optional(),parentCategoryId:z.coerce.number().int().positive().optional(),
  categoryId:z.coerce.number().int().positive().optional(),status:z.enum(['all','active','inactive']).default('all'),
  stock:z.enum(['all','in-stock','out-of-stock','low-stock']).default('all'),
  sort:z.enum(['newest','oldest','title-asc','title-desc','price-asc','price-desc','stock-asc','stock-desc']).default('newest'),
  page:z.coerce.number().int().min(1).max(1000000).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)
}).strict();
