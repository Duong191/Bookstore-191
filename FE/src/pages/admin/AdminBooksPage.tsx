import {useEffect,useState} from 'react';
import {NavLink} from 'react-router-dom';
import {useBookstore} from '../../context/BookstoreContext';
import {useAdminBooks} from '../../hooks/useAdminBooks';
import {useAdminCategories} from '../../hooks/useAdminCategories';
import {formatPrice,fixImagePath,discountedUnitPrice} from '../../utils/format';
import type {Book} from '../../types/bookstore.types';
import './AdminCatalog.css';
export default function AdminBooksPage(){
  const {showToast}=useBookstore();const categories=useAdminCategories();
  const [search,setSearch]=useState('');const [term,setTerm]=useState('');const [parent,setParent]=useState('');const [child,setChild]=useState('');
  const [status,setStatus]=useState('all');const [stock,setStock]=useState('all');const [sort,setSort]=useState('newest');const [page,setPage]=useState(1);
  const books=useAdminBooks({search:term||undefined,parentCategoryId:parent||undefined,categoryId:child||undefined,status,stock,sort,page,limit:20});
  const pages=Math.max(1,Math.ceil(books.total/20));
  useEffect(()=>{const id=window.setTimeout(()=>{setTerm(search.trim());setPage(1);},300);return()=>window.clearTimeout(id);},[search]);
  useEffect(()=>{if(!books.loading&&!books.error&&page>pages)setPage(pages);},[books.loading,books.error,page,pages]);
  const roots=categories.categories.filter(c=>!c.parentId);const children=categories.categories.filter(c=>c.parentId===parent);
  const report=(e:unknown)=>showToast(e instanceof Error?e.message:'Không thể cập nhật sách','error');
  const remove=async(book:Book)=>{if(!window.confirm(`Xóa sách "${book.title}"? Đơn hàng cũ được giữ lại.`))return;
    try{await books.remove(book.id);showToast('Đã xóa sách','success');}catch(e){report(e);}};
  const toggle=async(book:Book)=>{try{await books.status(book.id,!book.isActive);showToast('Đã cập nhật trạng thái sách','success');}catch(e){report(e);}};
  return <section className="catalog-page">
    <div className="catalog-heading"><div><h2>Quản lý sách</h2><p>Tìm kiếm và quản lý toàn bộ sách, gồm cả sách đã ẩn.</p></div>
      <NavLink to="/admin/books/new" className="btn-admin btn-admin-primary">+ Thêm sách</NavLink></div>
    <div className="catalog-filters">
      <label>Tìm sách<input type="search" placeholder="Tên, tác giả hoặc ISBN..." value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label>Danh mục cha<select value={parent} onChange={e=>{setParent(e.target.value);setChild('');setPage(1);}}>
        <option value="">Tất cả danh mục</option>{roots.map(c=><option key={c.id} value={c.id}>{c.name}{!c.isActive?' (ẩn)':''}</option>)}</select></label>
      <label>Danh mục con<select value={child} disabled={!parent} onChange={e=>{setChild(e.target.value);setPage(1);}}>
        <option value="">Tất cả trong nhóm cha</option>{children.map(c=><option key={c.id} value={c.id}>{c.name}{!c.isActive?' (ẩn)':''}</option>)}</select></label>
      <label>Trạng thái<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">Tất cả</option><option value="active">Đang hiện</option><option value="inactive">Đã ẩn</option></select></label>
      <label>Tồn kho<select value={stock} onChange={e=>{setStock(e.target.value);setPage(1);}}><option value="all">Tất cả tồn kho</option><option value="in-stock">Còn hàng</option><option value="out-of-stock">Hết hàng</option><option value="low-stock">Sắp hết (1–10)</option></select></label>
      <label>Sắp xếp<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}>
        <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="title-asc">Tên A–Z</option><option value="title-desc">Tên Z–A</option><option value="price-asc">Giá tăng</option><option value="price-desc">Giá giảm</option><option value="stock-asc">Tồn tăng</option><option value="stock-desc">Tồn giảm</option></select></label>
      <button className="btn-admin btn-admin-secondary" disabled={books.loading||books.busy} onClick={books.reload}>Làm mới</button>
    </div>
    {(books.error||categories.error)&&<p className="catalog-error" role="alert">{books.error||categories.error}</p>}
    <div className="admin-table-wrapper"><div className="admin-table-header"><h3>Danh sách sách ({books.total})</h3></div>
      <div className="catalog-scroll"><table className="admin-table"><thead><tr><th>Ảnh</th><th>Tên sách / ISBN</th><th>Tác giả</th><th>Danh mục</th><th>Giá bán</th><th>Giảm giá</th><th>Tồn</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
        <tbody>{books.loading?<tr><td colSpan={9} className="catalog-tree-empty" role="status">Đang tải sách...</td></tr>:books.books.length?books.books.map(book=>{
          const category=categories.categories.find(c=>c.id===book.categoryId);const parentCategory=category?.parentId?categories.categories.find(c=>c.id===category.parentId):undefined;
          return <tr key={book.id}><td><img src={fixImagePath(book.image)} alt={book.title} style={{width:45,height:65,objectFit:'cover',borderRadius:5}}/></td>
            <td>{book.title}<small className="catalog-note">{book.isbn||'Chưa có ISBN'}</small></td><td>{book.author}</td><td>{parentCategory&&<small className="catalog-note">{parentCategory.name} /</small>}{category?.name||(book as Book&{categoryName?:string}).categoryName||'—'}</td>
            <td>{formatPrice(discountedUnitPrice(book))}</td><td>{book.discount}%</td><td>{book.stock}</td>
            <td><span className={`catalog-badge ${book.isActive?'active':'inactive'}`}>{book.isActive?'Đang hiện':'Đã ẩn'}</span>{book.categoryVisible===false&&<small className="catalog-note">Danh mục đang ẩn</small>}</td>
            <td><div className="catalog-actions"><NavLink className="btn-admin btn-admin-primary" to={`/admin/books/${book.id}/edit`}>Sửa</NavLink>
              <button className="btn-admin btn-admin-secondary" disabled={books.busy} onClick={()=>toggle(book)}>{book.isActive?'Ẩn':'Hiện'}</button>
              <button className="btn-admin btn-admin-danger" disabled={books.busy} onClick={()=>remove(book)}>Xóa</button></div></td></tr>;
        }):<tr><td colSpan={9} className="catalog-tree-empty">Không tìm thấy sách phù hợp.</td></tr>}</tbody></table></div>
      <nav className="catalog-pagination" aria-label="Phân trang sách"><span>Trang {page} / {pages} · {books.total} sách</span><div>
        <button className="btn-admin btn-admin-secondary" disabled={page<=1||books.loading||books.busy} onClick={()=>setPage(n=>n-1)}>Trước</button>
        <button className="btn-admin btn-admin-secondary" disabled={page>=pages||books.loading||books.busy} onClick={()=>setPage(n=>n+1)}>Sau</button></div></nav>
    </div>
  </section>;
}
