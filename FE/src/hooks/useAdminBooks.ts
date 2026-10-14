import {useCallback,useEffect,useRef,useState} from 'react';
import {getAdminBooksRequest,deleteBookRequest,updateAdminBookStatusRequest} from '../api/adminBooksApi';
import type {AdminBooksParams} from '../api/adminBooksApi';
import type {Book} from '../types/bookstore.types';
import {useBookstore} from '../context/BookstoreContext';
export function useAdminBooks(params:AdminBooksParams){
  const {refreshBooksFromApi}=useBookstore();const [books,setBooks]=useState<Book[]>([]);const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [refresh,setRefresh]=useState(0);
  const version=useRef(0);const action=useRef(false);const {search,parentCategoryId,categoryId,status,stock,sort,page,limit}=params;
  const reload=useCallback(()=>setRefresh(n=>n+1),[]);
  useEffect(()=>{let cancelled=false;const v=++version.current;setLoading(true);setError('');
    getAdminBooksRequest(localStorage.getItem('bookstoreAccessToken')||'',{search,parentCategoryId,categoryId,status,stock,sort,page,limit})
      .then(r=>{if(!cancelled&&v===version.current){setBooks(r.items);setTotal(r.meta.total);}})
      .catch(e=>{if(!cancelled&&v===version.current){setError(e instanceof Error?e.message:'Không thể tải sách');setBooks([]);}})
      .finally(()=>{if(!cancelled&&v===version.current)setLoading(false);});
    return()=>{cancelled=true;};
  },[search,parentCategoryId,categoryId,status,stock,sort,page,limit,refresh]);
  const run=async(task:()=>Promise<unknown>)=>{if(action.current)throw new Error('Đang xử lý, vui lòng chờ');action.current=true;setBusy(true);
    try{await task();reload();await refreshBooksFromApi();}finally{action.current=false;setBusy(false);}};
  return {books,total,loading,busy,error,reload,
    remove:(id:string)=>run(()=>deleteBookRequest(localStorage.getItem('bookstoreAccessToken')||'',id)),
    status:(id:string,active:boolean)=>run(()=>updateAdminBookStatusRequest(localStorage.getItem('bookstoreAccessToken')||'',id,active))};
}
