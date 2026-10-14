import {FormEvent,useState} from 'react';
import AdminCatalogModal from './AdminCatalogModal';
import type {AdminCategory} from '../../types/bookstore.types';
import type {CategoryPayload} from '../../api/adminCategoriesApi';
export default function CategoryFormModal({categories,initial,parentId=null,busy,onClose,onSave,onSaved}:{
  categories:AdminCategory[];initial?:AdminCategory;parentId?:string|null;busy:boolean;onClose:()=>void;
  onSave:(payload:CategoryPayload)=>Promise<AdminCategory>;onSaved:(item:AdminCategory)=>void}){
  const [form,setForm]=useState({name:initial?.name||'',slug:initial?.slug||'',description:initial?.description||'',
    parentId:initial?.parentId??parentId??'',sortOrder:initial?.sortOrder??0,isActive:initial?.isActive??true});
  const [error,setError]=useState('');const [sending,setSending]=useState(false);
  const save=async(e:FormEvent)=>{e.preventDefault();if(busy||sending)return;setError('');setSending(true);
    try{const item=await onSave({name:form.name.trim(),...(form.slug.trim()?{slug:form.slug.trim()}:{}),description:form.description.trim(),
      parentId:form.parentId||null,sortOrder:Number(form.sortOrder),isActive:form.isActive});onSaved(item);}
    catch(err){setError(err instanceof Error?err.message:'Không thể lưu danh mục');}finally{setSending(false);}};
  return <AdminCatalogModal title={initial?'Sửa danh mục':'Thêm danh mục'} busy={busy||sending} onClose={onClose}>
    <form onSubmit={save}><fieldset disabled={busy||sending}>
      <label>Tên danh mục<input required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Danh mục cha<select value={form.parentId} onChange={e=>setForm({...form,parentId:e.target.value})}>
        <option value="">Không có — tạo danh mục lớn</option>{categories.filter(c=>!c.parentId&&c.id!==initial?.id).map(c=><option key={c.id} value={c.id}>{c.name}{!c.isActive?' (đã ẩn)':''}</option>)}
      </select></label>
      <label>Slug<input maxLength={100} value={form.slug} placeholder="Để trống để tạo từ tên danh mục" onChange={e=>setForm({...form,slug:e.target.value})}/></label>
      <label>Mô tả<textarea maxLength={500} rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label>Thứ tự hiển thị<input required type="number" min={0} max={100000} value={form.sortOrder} onChange={e=>setForm({...form,sortOrder:Number(e.target.value)})}/></label>
      <label>Trạng thái<select value={form.isActive?'active':'inactive'} onChange={e=>setForm({...form,isActive:e.target.value==='active'})}>
        <option value="active">Hiển thị</option><option value="inactive">Ẩn</option></select></label>
    </fieldset>{error&&<p className="catalog-error" role="alert">{error}</p>}
    <footer><button type="button" className="btn-admin btn-admin-secondary" disabled={busy||sending} onClick={onClose}>Hủy</button>
      <button type="submit" className="btn-admin btn-admin-primary" disabled={busy||sending}>{busy||sending?'Đang lưu...':'Lưu danh mục'}</button></footer>
    </form>
  </AdminCatalogModal>;
}
