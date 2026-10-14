import {useMemo,useState} from 'react';
import {useAdminCategories} from '../../hooks/useAdminCategories';
import {useBookstore} from '../../context/BookstoreContext';
import {buildCategoryTree} from '../../services/categoryTree';
import CategoryFormModal from '../../components/ui/CategoryFormModal';
import type {AdminCategory} from '../../types/bookstore.types';
import './AdminCatalog.css';
export default function AdminCategoriesPage(){
  const categories=useAdminCategories();const {showToast}=useBookstore();
  const [modal,setModal]=useState<{initial?:AdminCategory;parentId?:string|null}|null>(null);
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');
  const tree=useMemo(()=>buildCategoryTree(categories.categories),[categories.categories]);
  const matches=(c:AdminCategory)=>(!search.trim()||`${c.name} ${c.slug}`.toLowerCase().includes(search.trim().toLowerCase()))&&(status==='all'||c.isActive===(status==='active'));
  const filtered=tree.filter(c=>matches(c)||c.children?.some(matches));
  const report=(err:unknown)=>showToast(err instanceof Error?err.message:'Không thể cập nhật danh mục','error');
  const toggle=async(c:AdminCategory)=>{
    if(!window.confirm(`${c.isActive?'Ẩn':'Hiện'} danh mục "${c.name}"? Danh mục con sẽ chịu trạng thái hiển thị của cha.`))return;
    try{await categories.status(c.id,!c.isActive);showToast('Đã cập nhật trạng thái danh mục','success');}catch(err){report(err);}
  };
  const remove=async(c:AdminCategory)=>{
    if(!window.confirm(`Xóa danh mục "${c.name}"? Danh mục con đã ẩn và không có sách cũng sẽ được xóa mềm.`))return;
    try{await categories.remove(c.id);showToast('Đã xóa danh mục','success');}catch(err){report(err);}
  };
  const row=(c:AdminCategory,child=false)=>{
    const children=c.children||[];const blocked=c.bookCount>0||children.some(i=>i.isActive||i.bookCount>0);
    return <tr key={c.id} className={child?'':'catalog-tree-parent'}>
      <td><div className={`catalog-tree-name ${child?'catalog-tree-child':'catalog-tree-root'}`}><i className={`fas ${child?'fa-turn-up':'fa-folder'}`} aria-hidden="true"/>{c.name}</div><small className="catalog-note">/{c.slug}</small></td>
      <td>{c.bookCount}{children.length>0&&<small className="catalog-note">Danh mục con: {children.reduce((n,i)=>n+i.bookCount,0)} sách</small>}</td>
      <td>{c.sortOrder}</td><td><span className={`catalog-badge ${c.isVisible?'active':'inactive'}`}>{c.isVisible?'Hiển thị':c.isActive?'Ẩn theo cha':'Đã ẩn'}</span></td>
      <td><div className="catalog-actions">
        {!child&&<button className="btn-admin btn-admin-success" disabled={categories.busy} onClick={()=>setModal({parentId:c.id})}>+ Danh mục con</button>}
        <button className="btn-admin btn-admin-primary" disabled={categories.busy} onClick={()=>setModal({initial:c})}>Sửa</button>
        <button className="btn-admin btn-admin-secondary" disabled={categories.busy} onClick={()=>toggle(c)}>{c.isActive?'Ẩn':'Hiện'}</button>
        <button className="btn-admin btn-admin-danger" disabled={categories.busy||blocked} title={blocked?'Không xóa khi có sách hoặc danh mục con đang hoạt động':'Xóa mềm danh mục'} onClick={()=>remove(c)}>Xóa</button>
      </div></td>
    </tr>;
  };
  return <section className="catalog-page">
    <div className="catalog-heading"><div><h2>Quản lý danh mục</h2><p>Tổ chức danh mục lớn và danh mục con từ dữ liệu cửa hàng.</p></div>
      <button className="btn-admin btn-admin-primary" disabled={categories.busy||categories.loading} onClick={()=>setModal({parentId:null})}>+ Thêm danh mục</button></div>
    <div className="catalog-filters"><label>Tìm danh mục<input type="search" value={search} placeholder="Tên hoặc slug..." onChange={e=>setSearch(e.target.value)}/></label>
      <label>Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Tất cả</option><option value="active">Đang hoạt động</option><option value="inactive">Đã ẩn</option></select></label>
      <button className="btn-admin btn-admin-secondary" disabled={categories.loading||categories.busy} onClick={()=>void categories.reload().catch(()=>{})}>Làm mới</button></div>
    {categories.error&&<p className="catalog-error" role="alert">{categories.error}</p>}
    <div className="admin-table-wrapper catalog-scroll"><table className="admin-table"><thead><tr><th>Danh mục cha/con</th><th>Số sách</th><th>Thứ tự</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
      <tbody>{categories.loading?<tr><td colSpan={5} className="catalog-tree-empty" role="status">Đang tải danh mục...</td></tr>:filtered.length?filtered.flatMap(c=>[row(c),...(c.children||[]).filter(i=>matches(c)||matches(i)).map(i=>row(i,true))]):<tr><td colSpan={5} className="catalog-tree-empty">Không tìm thấy danh mục.</td></tr>}</tbody>
    </table></div>
    {modal&&<CategoryFormModal categories={categories.categories} initial={modal.initial} parentId={modal.parentId} busy={categories.busy}
      onClose={()=>setModal(null)} onSave={p=>modal.initial?categories.update(modal.initial.id,p):categories.create(p)}
      onSaved={()=>{setModal(null);showToast('Đã lưu danh mục','success');}}/>}
  </section>;
}
