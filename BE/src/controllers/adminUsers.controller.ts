/** Controller quản lý tài khoản ADMIN; parse lại để dùng dữ liệu đã normalize/default. */
import { Request, Response } from "express";
import * as service from "../services/adminUsers.service";
import { accountIdSchema, createAccountSchema, listAccountsSchema, updateAccountSchema, updateRoleSchema, updateStatusSchema } from "../validators/adminUsers.schemas";

const accountId = (req: Request) => Number(accountIdSchema.parse(req.params).id);
export const listUsers = async (req: Request, res: Response) => {
  res.json(await service.listAccounts(listAccountsSchema.parse(req.query)));
};
export const getUser = async (req: Request, res: Response) => {
  res.json({ item: await service.getAccount(accountId(req)) });
};
export const createUser = async (req: Request, res: Response) => {
  res.status(201).json({ item: await service.createAccount(req.user!.id, createAccountSchema.parse(req.body)) });
};
export const updateUser = async (req: Request, res: Response) => {
  res.json({ item: await service.updateAccount(req.user!.id, accountId(req), updateAccountSchema.parse(req.body)) });
};
export const updateRole = async (req: Request, res: Response) => {
  res.json({ item: await service.updateAccountRole(req.user!.id, accountId(req), updateRoleSchema.parse(req.body).role) });
};
export const updateStatus = async (req: Request, res: Response) => {
  res.json({ item: await service.updateAccount(req.user!.id, accountId(req), updateStatusSchema.parse(req.body)) });
};
export const deleteUser = async (req: Request, res: Response) => {
  await service.deleteAccount(req.user!.id, accountId(req));
  res.status(204).send();
};
