import {useCallback,useEffect,useRef,useState} from 'react';
import {useBookstore} from '../context/BookstoreContext';
import * as api from '../api/adminCategoriesApi';
import type {CategoryPayload} from '../api/adminCategoriesApi';
import type {AdminCategory} from '../types/bookstore.types';
export function useAdminCategories(){
  const {refreshCategoriesFromApi}=useBookstore();
  const [categories,setCategories]=useState<AdminCategory[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const alive=useRef(true);const action=useRef(false);const version=useRef(0);
  const token=()=>{const t=localStorage.getItem('bookstoreAccessToken');if(!t)throw new Error('Vui lòng đăng nhập');return t;};
  const reload=useCallback(async()=>{
    const v=++version.current;setLoading(true);setError('');
    try{const items=await api.getAdminCategoriesRequest(token());if(alive.current&&v===version.current)setCategories(items);return items;}
    catch(e){if(alive.current&&v===version.current)setError(e instanceof Error?e.message:'Không thể tải danh mục');throw e;}
    finally{if(alive.current&&v===version.current)setLoading(false);}
  },[]);
  useEffect(()=>{alive.current=true;void reload().catch(()=>{});return()=>{alive.current=false;};},[reload]);
  const run=async<T,>(task:()=>Promise<T>):Promise<T>=>{
    if(action.current)throw new Error('Vui lòng chờ thao tác đang thực hiện');action.current=true;setBusy(true);
    try{
      const result=await task();
      // Giữ kết quả đã lưu kể cả khi request tải lại bị lỗi mạng.
      if(alive.current&&result&&typeof result==='object'&&'id' in result){
        const item=result as AdminCategory;
        setCategories(items=>items.some(c=>c.id===item.id)?items.map(c=>c.id===item.id?item:c):[...items,item]);
      }
      await reload().catch(()=>{});await refreshCategoriesFromApi().catch(()=>{});return result;
    }
    finally{action.current=false;if(alive.current)setBusy(false);}
  };
  return {categories,loading,busy,error,reload,
    create:(p:CategoryPayload)=>run(()=>api.createAdminCategoryRequest(token(),p)),
    update:(id:string,p:CategoryPayload)=>run(()=>api.updateAdminCategoryRequest(token(),id,p)),
    status:(id:string,active:boolean)=>run(()=>api.updateAdminCategoryStatusRequest(token(),id,active)),
    remove:(id:string)=>run(()=>api.deleteAdminCategoryRequest(token(),id))};
}
