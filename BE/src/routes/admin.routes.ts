/** File này khai báo route admin cho quản lý sách và tồn kho. */
import { Router } from "express";
import { z } from "zod";
import * as bookController from "../controllers/book.controller";
import * as adminStatsController from "../controllers/adminStats.controller";
import * as inventoryController from "../controllers/inventory.controller";
import { authMiddleware } from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/checkPermission";
import { validateRequest } from "../middlewares/validateRequest";
import { asyncHandler } from "../utils/asyncHandler";
import adminUsersRoutes from "./adminUsers.routes";
import { bookIdSchema, createBookSchema, updateBookSchema } from "../validators/books.schemas";

const router = Router();
router.use(authMiddleware);
router.use(checkPermission(["admin", "staff"]));

// Quản lý tài khoản chỉ dành cho ADMIN, STAFF không được truy cập.
router.use("/users", checkPermission("admin"), adminUsersRoutes);

router.get("/stats", asyncHandler(adminStatsController.getAdminStats));

router.post(
  "/books",
  validateRequest(
    z.object({ body: createBookSchema })
  ),
  asyncHandler(bookController.createBook)
);
router.put("/books/:id", validateRequest(z.object({ params: bookIdSchema, body: updateBookSchema })), asyncHandler(bookController.updateBook));
router.delete("/books/:id", validateRequest(z.object({ params: bookIdSchema })), asyncHandler(bookController.deleteBook));

router.get("/inventory/transactions", asyncHandler(inventoryController.listInventoryTransactions));
router.get("/inventory", asyncHandler(inventoryController.listInventory));
router.post(
  "/inventory",
  validateRequest(
    z.object({
      body: z.object({
        bookId: z.number().int().positive(),
        transactionType: z.enum(["import", "export", "adjustment"]),
        quantity: z.number().int(),
        importPrice: z.number().nonnegative().optional(),
        supplierId: z.number().int().positive().optional(),
        note: z.string().optional()
      })
    })
  ),
  asyncHandler(inventoryController.createInventoryTransaction)
);

export default router;
