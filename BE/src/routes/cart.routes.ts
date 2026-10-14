/** File này khai báo route giỏ hàng, hỗ trợ cả guest và user login. */
import { Router } from "express";
import { z } from "zod";
import * as controller from "../controllers/cart.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { validateRequest } from "../middlewares/validateRequest";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// optional auth: if has bearer token then parse user, else continue as guest
router.use(async (req, res, next) => {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    await authMiddleware(req, res, next);
    return;
  }
  next();
});

router.get("/", asyncHandler(controller.getCart));
router.put(
  "/",
  validateRequest(
    z.object({
      body: z.object({
        items: z.array(z.object({ bookId: z.number().int().positive(), quantity: z.number().int().positive() }))
          .refine((items) => new Set(items.map((item) => item.bookId)).size === items.length, "Mỗi sách chỉ được có một dòng trong giỏ")
      })
    })
  ),
  asyncHandler(controller.upsertCart)
);

export default router;
