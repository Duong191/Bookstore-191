/**
 * File này chứa các hàm gọi API liên quan đến quản lý sách phía admin.
 * Không xử lý UI, chỉ gửi request tới backend và chuẩn hóa dữ liệu trả về.
 */
import { httpRequest } from './httpClient';
import type { Book } from '../types/bookstore.types';
import { mapBook, type RawBook } from './publicApi';

// Kiểu response backend có thể bọc dữ liệu sách trong `item`.
interface BookResponseWrapped {
  item: Book;
}

// Backend có thể trả trực tiếp Book hoặc object bọc Book.
type BookResponse = Book | BookResponseWrapped;

// Chuẩn hóa response về một object sách thống nhất.
function unwrapBook(payload: BookResponse): unknown {
  return (payload as BookResponseWrapped).item ?? (payload as Book);
}

// Ánh xạ object backend sang kiểu Book frontend chuẩn.
function toClientBook(row: unknown): Book {
  return mapBook(row as RawBook) as Book;
}

/**
 * Gửi request tạo sách mới.
 * Dùng cho trang AdminBooksPage/AdminBookEditPage.
 * Yêu cầu token admin/staff để xác thực.
 */
export async function createBookRequest(token: string, payload: Record<string, unknown>): Promise<Book> {
  const data = await httpRequest<BookResponse>('/admin/books', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
  // Chuẩn hóa dữ liệu backend trả về sang định dạng Book dùng ở frontend.
  return toClientBook(unwrapBook(data));
}

/**
 * Gửi request cập nhật thông tin sách theo `bookId`.
 * Dùng cho trang chỉnh sửa sách admin.
 * Yêu cầu token admin/staff.
 */
export async function updateBookRequest(token: string, bookId: string, payload: Record<string, unknown>): Promise<Book> {
  const data = await httpRequest<BookResponse>(`/admin/books/${bookId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  });
  // Chuẩn hóa dữ liệu backend trả về sang định dạng Book dùng ở frontend.
  return toClientBook(unwrapBook(data));
}

/**
 * Gửi request xóa sách theo `bookId`.
 * Yêu cầu token admin/staff.
 */
export async function deleteBookRequest(token: string, bookId: string): Promise<void> {
  await httpRequest(`/admin/books/${bookId}`, {
    method: 'DELETE',
    token,
  });
}
export interface AdminBooksParams {search?:string;parentCategoryId?:string;categoryId?:string;status?:string;stock?:string;sort?:string;page?:number;limit?:number}
export async function getAdminBooksRequest(token:string,params:AdminBooksParams={}){
  const query=new URLSearchParams();Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!=='')query.set(key,String(value));});
  const response=await httpRequest<{data:RawBook[];meta:{page:number;limit:number;total:number}}>(`/admin/books?${query}`,{token});
  return {items:response.data.map(mapBook),meta:response.meta};
}
export async function getAllAdminBooksRequest(token:string){
  const items:Book[]=[];for(let page=1;page<=10000;page++){
    const response=await getAdminBooksRequest(token,{page,limit:100});items.push(...response.items);
    if(!response.items.length||items.length>=response.meta.total)break;
  }return items;
}
export async function getAdminBookDetailRequest(token:string,id:string){return mapBook(await httpRequest<RawBook>(`/admin/books/${encodeURIComponent(id)}`,{token}));}
export async function updateAdminBookStatusRequest(token:string,id:string,isActive:boolean){return mapBook(await httpRequest<RawBook>(`/admin/books/${encodeURIComponent(id)}/status`,{token,method:'PATCH',body:JSON.stringify({isActive})}));}
