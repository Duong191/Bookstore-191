import {categoryScope,buildCategoryTree} from './categoryTree';
import type {AdminCategory} from '../types/bookstore.types';
import {getBestSellersByCategory} from './booksService';
const node=(id:string,parentId:string|null):AdminCategory=>({id,parentId,name:`Category ${id}`,slug:`c-${id}`,description:'',isActive:true,isVisible:true,sortOrder:0,bookCount:0});
test('ID động từ DB: dựng cây và chọn cha bao gồm sách trong con',()=>{
  const categories=[node('901',null),node('2345','901'),node('778',null)];
  expect(buildCategoryTree(categories)[0].children?.[0].id).toBe('2345');
  expect(Array.from(categoryScope(categories,'901'))).toEqual(['901','2345']);
  const books=[{id:'1',categoryId:'2345',soldCount:2},{id:'2',categoryId:'778',soldCount:10}] as Parameters<typeof getBestSellersByCategory>[0];
  expect(getBestSellersByCategory(books,'901',categories).map(b=>b.id)).toEqual(['1']);
});
