/** File này xử lý API sách: danh sách, chi tiết và CRUD cho admin. */
import { Request, Response } from "express";
import * as bookService from "../services/book.service";
import {adminBookListSchema} from "../validators/books.schemas";
export const listAdminBooks=async(req:Request,res:Response)=>{res.json(await bookService.listAdminBooks(adminBookListSchema.parse(req.query)));};
export const getAdminBook=async(req:Request,res:Response)=>{res.json(await bookService.getBookById(Number(req.params.id),true));};

export const listBooks = async (req: Request, res: Response) => {
  const data = await bookService.listBooks(req.query as Record<string, unknown>);
  res.json(data);
};

export const getBookById = async (req: Request, res: Response) => {
  const data = await bookService.getBookById(Number(req.params.id));
  res.json(data);
};

export const createBook = async (req: Request, res: Response) => {
  const data = await bookService.createBook(req.body,req.user!.id);
  res.status(201).json(data);
};

export const updateBook = async (req: Request, res: Response) => {
  const data = await bookService.updateBook(Number(req.params.id), req.body);
  res.json(data);
};

export const deleteBook = async (req: Request, res: Response) => {
  await bookService.deleteBook(Number(req.params.id));
  res.status(204).send();
};
