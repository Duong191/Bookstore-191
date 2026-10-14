import { z } from "zod";
export const categoryIdValue = z.union([z.number().int().positive().safe(),z.string().regex(/^[1-9]\d*$/).refine(v=>Number.isSafeInteger(Number(v)))])
  .transform(Number);
export const categoryIdSchema = z.object({id:categoryIdValue});
export const categoryFields = {
  name:z.string().trim().min(1).max(100), slug:z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional(),
  parentId:categoryIdValue.nullable().optional(), description:z.string().trim().max(500).optional(),
  icon:z.string().trim().max(50).optional(), isActive:z.boolean().optional(), sortOrder:z.number().int().min(0).max(100000).optional()
};
export const createCategorySchema=z.object(categoryFields).strict();
export const updateCategorySchema=z.object(categoryFields).partial().strict().refine(v=>Object.keys(v).length>0,"Cần gửi trường cần cập nhật");
export const categoryStatusSchema=z.object({isActive:z.boolean()}).strict();
export const categoryListSchema=z.object({tree:z.enum(["true","false"]).default("false")}).strict();
