import {httpRequest} from './httpClient';
import type {AdminCategory} from '../types/bookstore.types';
export interface CategoryPayload {name:string;slug?:string;parentId:string|null;description:string;isActive:boolean;sortOrder:number;icon?:string}
export async function getAdminCategoriesRequest(token:string,tree=false){
  return (await httpRequest<{items:AdminCategory[]}>(`/admin/categories?tree=${tree}`,{token})).items;
}
export async function createAdminCategoryRequest(token:string,payload:CategoryPayload){
  return (await httpRequest<{item:AdminCategory}>('/admin/categories',{token,method:'POST',body:JSON.stringify(payload)})).item;
}
export async function updateAdminCategoryRequest(token:string,id:string,payload:CategoryPayload){
  return (await httpRequest<{item:AdminCategory}>(`/admin/categories/${encodeURIComponent(id)}`,{token,method:'PATCH',body:JSON.stringify(payload)})).item;
}
export async function updateAdminCategoryStatusRequest(token:string,id:string,isActive:boolean){
  return (await httpRequest<{item:AdminCategory}>(`/admin/categories/${encodeURIComponent(id)}/status`,{token,method:'PATCH',body:JSON.stringify({isActive})})).item;
}
export function deleteAdminCategoryRequest(token:string,id:string){return httpRequest<void>(`/admin/categories/${encodeURIComponent(id)}`,{token,method:'DELETE'});}
