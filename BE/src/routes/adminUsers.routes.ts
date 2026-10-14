/** Nhóm route được mount sau authMiddleware và checkPermission('admin'). */
import { Router } from "express";
import { z } from "zod";
import * as controller from "../controllers/adminUsers.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { asyncHandler } from "../utils/asyncHandler";
import { accountIdSchema, createAccountSchema, listAccountsSchema, updateAccountSchema, updateRoleSchema, updateStatusSchema } from "../validators/adminUsers.schemas";

const router = Router();
router.get("/", validateRequest(z.object({ query: listAccountsSchema })), asyncHandler(controller.listUsers));
router.post("/", validateRequest(z.object({ body: createAccountSchema })), asyncHandler(controller.createUser));
router.use("/:id", validateRequest(z.object({ params: accountIdSchema })));
router.get("/:id", asyncHandler(controller.getUser));
router.patch("/:id", validateRequest(z.object({ body: updateAccountSchema })), asyncHandler(controller.updateUser));
router.patch("/:id/role", validateRequest(z.object({ body: updateRoleSchema })), asyncHandler(controller.updateRole));
router.patch("/:id/status", validateRequest(z.object({ body: updateStatusSchema })), asyncHandler(controller.updateStatus));
router.delete("/:id", asyncHandler(controller.deleteUser));
export default router;
