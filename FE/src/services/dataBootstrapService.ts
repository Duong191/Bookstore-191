import { getAllPublicBooks,getCategories,getDetailedCategories } from '../api/publicApi';
import {getBlogs} from '../api/blogsApi';
import type {Blog,Book,BookstoreData,Category,DetailedCategory} from '../types/bookstore.types';
/** Catalog và danh mục chỉ lấy từ DB; không tạo nhóm con/ID bằng seed khi API lỗi. */
export async function bootstrapFromBackend():Promise<BookstoreData|null>{
  try{
    const [books,categories,detailedCategories,blogs]=await Promise.all([getAllPublicBooks<Book>(),getCategories<Category>(),getDetailedCategories<DetailedCategory>(),getBlogs().catch(()=>[])]);
    return {books,categories,detailedCategories,blogs:blogs as Blog[],users:[],orders:[],reviews:[],cart:[],inventoryLogs:[]};
  }catch{return null;}
}
