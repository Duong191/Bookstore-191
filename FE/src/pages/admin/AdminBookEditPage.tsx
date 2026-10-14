import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { useBookstore } from '../../context/BookstoreContext';
import { formatPrice, discountedUnitPrice } from '../../utils/format';
import { fetchBookById } from '../../api/publicApi';

export default function AdminBookEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addBook, updateBook, showToast, data } = useBookstore();
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [capabilities, setCapabilities] = useState({ trending: false, format: true });
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    publisher: '',
    categoryId: '1',
    publishYear: '',
    price: '',
    discount: '0',
    stock: '0',
    description: '',
    images: '',
    tags: '',
    isbn: '',
    pages: '',
    language: 'Tiếng Việt',
    format: 'Paperback',
    /** Thêm sách mới: mặc định lên kệ “Sách mới”; sửa sách: mặc định tắt cho tới khi load dữ liệu. */
    isNew: !id,
    bestSeller: false,
    trending: false,
    featured: false,
    rating: '5',
    reviews: '0',
    salesCount: '0',
  });

  const isEdit = !!id;
  const supportsTrending = isEdit ? capabilities.trending : data?.books?.[0]?.supportsTrending === true;
  const supportsFormat = isEdit ? capabilities.format : data?.books?.[0]?.supportsFormat !== false;

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetchBookById(id).then((result) => {
      if (cancelled) return;
      const book: any = result;
        const imagesStr = Array.isArray(book.images) ? book.images.join(', ') : (book.image || '');
        const tagsStr = Array.isArray(book.tags) ? book.tags.join(', ') : '';
        const publishYear = book.publishYear
          ? String(book.publishYear)
          : book.publishDate
            ? String(book.publishDate).slice(0, 4)
            : '';
        setFormData({
          title: book.title || '',
          author: book.author || '',
          publisher: book.publisher || '',
          categoryId: book.categoryId || book.category || '1',
          publishYear,
          price: String(book.price ?? ''),
          discount: String(book.discount || '0'),
          stock: String(book.stock || '0'),
          description: book.description || '',
          images: imagesStr,
          tags: tagsStr,
          isbn: book.isbn || '',
          pages: String(book.pages || ''),
          language: book.language || 'Tiếng Việt',
          format: book.format === 'Bìa cứng' ? 'Hardcover' : book.format === 'Bìa mềm' ? 'Paperback' : book.format || 'Paperback',
          isNew: book.isNew || false,
          bestSeller: book.bestSeller || false,
          trending: book.trending || false,
          featured: book.featured || false,
          rating: String(book.rating ?? '5'),
          reviews: String(book.reviews || book.reviewCount || '0'),
          salesCount: String(book.salesCount || book.soldCount || '0'),
        });
      setCapabilities({ trending: book.supportsTrending === true, format: book.supportsFormat === true });
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Không thể tải thông tin sách');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (savingRef.current) return;
    setFormError('');
    
    const imagesArray = formData.images.split(',').map(s => s.trim()).filter(Boolean);
    const tagsArray = formData.tags.split(',').map(s => s.trim()).filter(Boolean);
    
    const bookData: any = {
      title: formData.title,
      author: formData.author,
      publisher: formData.publisher,
      categoryId: formData.categoryId,
      category: formData.categoryId,
      publishYear: formData.publishYear ? parseInt(formData.publishYear) : null,
      price: parseFloat(formData.price),
      discount: parseFloat(formData.discount),
      stock: parseInt(formData.stock),
      description: formData.description,
      /** Luôn gửi để backend ghi vào `book_images` và không mất sau khi tải lại từ API. */
      images: imagesArray,
      ...(imagesArray.length > 0 ? { image: imagesArray[0] } : {}),
      tags: tagsArray,
      isbn: formData.isbn,
      pages: formData.pages ? parseInt(formData.pages) : null,
      language: formData.language,
      ...(supportsFormat ? { format: formData.format } : {}),
      isNew: formData.isNew,
      bestSeller: formData.bestSeller,
      ...(supportsTrending ? { trending: formData.trending } : {}),
      featured: formData.featured,
      rating: parseFloat(formData.rating),
      reviews: parseInt(formData.reviews),
      reviewCount: parseInt(formData.reviews),
      salesCount: parseInt(formData.salesCount),
      soldCount: parseInt(formData.salesCount),
    };

    savingRef.current = true;
    setSaving(true);
    try {
      if (isEdit && id) {
        const saved = await Promise.resolve(updateBook(id, bookData));
        if (!saved) throw new Error('Không thể cập nhật sách. Vui lòng thử lại.');
        showToast('Đã cập nhật sách', 'success');
      } else {
        await Promise.resolve(addBook(bookData));
        showToast('Đã thêm sách mới', 'success');
      }
      navigate('/admin/books');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu sách';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const previewPayPrice = useMemo(() => {
    const p = parseFloat(formData.price);
    const d = parseFloat(formData.discount) || 0;
    if (!Number.isFinite(p) || p < 0) return null;
    return discountedUnitPrice({ price: p, discount: d });
  }, [formData.price, formData.discount]);

  if (loading) return <p role="status">Đang tải thông tin sách...</p>;
  if (loadError) return <div role="alert">{loadError} <NavLink to="/admin/books">Về danh sách sách</NavLink></div>;

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      {formError && <div role="alert" style={{ color: '#991b1b', background: '#fef2f2', padding: 12, marginBottom: 16 }}>{formError}</div>}
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {/* Basic Info */}
      <div className="form-group">
        <label className="form-label required">Tên sách</label>
        <input
          type="text"
          className="form-input"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Tác giả</label>
          <input
            type="text"
            className="form-input"
            value={formData.author}
            onChange={(e) => setFormData({ ...formData, author: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Nhà xuất bản</label>
          <input
            type="text"
            className="form-input"
            value={formData.publisher}
            onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Danh mục</label>
          <select
            className="form-select"
            value={formData.categoryId}
            onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            required
          >
            {(data?.categories || []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Năm xuất bản</label>
          <input
            type="number"
            className="form-input"
            min="1900"
            max="2100"
            value={formData.publishYear}
            onChange={(e) => setFormData({ ...formData, publishYear: e.target.value })}
          />
        </div>
      </div>

      {/* Price: một giá niêm yết; % giảm trừ vào khi tính tiền (cùng logic cửa hàng) */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Giá bán (VNĐ)</label>
          <input
            type="number"
            className="form-input"
            min="0"
            step="1000"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
          <small style={{ color: '#666', fontSize: '0.85rem' }}>
            Giá niêm yết hiển thị trên cửa hàng. Nếu có giảm giá bên dưới, khách chỉ trả phần đã trừ khuyến mãi.
          </small>
        </div>
        <div className="form-group">
          <label className="form-label">Giảm giá (%)</label>
          <input
            type="number"
            className="form-input"
            min="0"
            max="100"
            value={formData.discount}
            onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
          />
          {previewPayPrice != null && Number(formData.discount) > 0 && (
            <small style={{ color: '#27ae60', fontSize: '0.85rem', display: 'block', marginTop: 6 }}>
              Giá khách thanh toán: <strong>{formatPrice(previewPayPrice)}</strong>
            </small>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label {isEdit ? '' : 'required'}">Tồn kho {isEdit && '(chỉ đọc)'}</label>
          <input
            type="number"
            className="form-input"
            min="0"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
            disabled={isEdit}
            required={!isEdit}
            style={isEdit ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
          />
          {isEdit && (
            <small style={{ color: '#666', fontSize: '0.85rem', marginTop: 5, display: 'block' }}>
              <i className="fas fa-info-circle"></i> Để thay đổi tồn kho, vui lòng sử dụng trang{' '}
              <NavLink to="/admin/inventory" style={{ color: '#ff6b6b', fontWeight: 'bold' }}>
                Quản lý Kho
              </NavLink>
            </small>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="form-group">
        <label className="form-label required">Mô tả</label>
        <textarea
          className="form-textarea"
          rows={12}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
        <small style={{ color: '#666', marginTop: 6, display: 'block' }}>
          Xuống dòng: nhấn Enter. In đậm: bọc <code>**như thế này**</code> (dán từ Word thường mất định dạng — cần chỉnh trong ô này).
        </small>
      </div>

      {/* Images */}
      <div className="form-group">
        <label className={`form-label ${isEdit ? '' : 'required'}`}>Hình ảnh (URL, cách nhau bởi dấu phẩy)</label>
        <textarea
          className="form-textarea"
          rows={3}
          placeholder="img/book1.jpg, img/book2.jpg"
          value={formData.images}
          onChange={(e) => setFormData({ ...formData, images: e.target.value })}
          required={!isEdit}
        />
        <small style={{ color: '#666', marginTop: 5, display: 'block' }}>
          Nhập các URL hình ảnh, cách nhau bởi dấu phẩy. Hình đầu tiên sẽ là hình chính.
        </small>
      </div>

      {/* Additional Info */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">ISBN</label>
          <input
            type="text"
            className="form-input"
            value={formData.isbn}
            onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Số trang</label>
          <input
            type="number"
            className="form-input"
            min="0"
            value={formData.pages}
            onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Ngôn ngữ</label>
          <input
            type="text"
            className="form-input"
            value={formData.language}
            onChange={(e) => setFormData({ ...formData, language: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Hình thức bìa</label>
          <select
            className="form-select"
            value={formData.format}
            disabled={!supportsFormat}
            onChange={(e) => setFormData({ ...formData, format: e.target.value })}
          >
            <option value="Paperback">Bìa mềm</option>
            <option value="Hardcover">Bìa cứng</option>
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="form-group">
        <label className="form-label">Tags (cách nhau bởi dấu phẩy)</label>
        <input
          type="text"
          className="form-input"
          placeholder="ví dụ: sách hay, bestseller, mới"
          value={formData.tags}
          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
        />
      </div>

      {/* Badges */}
      <div className="form-group">
        <label className="form-label">Badges</label>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.isNew}
              onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
            />
            <span>Sách mới</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.bestSeller}
              onChange={(e) => setFormData({ ...formData, bestSeller: e.target.checked })}
            />
            <span>Bán chạy</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.trending}
              disabled={!supportsTrending}
              onChange={(e) => setFormData({ ...formData, trending: e.target.checked })}
            />
            <span>Xu hướng{!supportsTrending ? ' (chưa hỗ trợ)' : ''}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.featured}
              onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
            />
            <span>Nổi bật</span>
          </label>
        </div>
      </div>

      {/* Rating */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Đánh giá (0-5)</label>
          <input
            type="number"
            className="form-input"
            min="0"
            max="5"
            step="0.1"
            value={formData.rating}
            onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Số lượt đánh giá</label>
          <input
            type="number"
            className="form-input"
            min="0"
            value={formData.reviews}
            onChange={(e) => setFormData({ ...formData, reviews: e.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Số lượng đã bán</label>
        <input
          type="number"
          className="form-input"
          min="0"
          value={formData.salesCount}
          onChange={(e) => setFormData({ ...formData, salesCount: e.target.value })}
        />
      </div>

      {/* Form Actions */}
      <div className="form-actions">
        <NavLink to="/admin/books" className="btn-admin btn-admin-secondary">
          <i className="fas fa-times"></i> Hủy
        </NavLink>
        <button type="submit" className="btn-admin btn-admin-primary" disabled={saving}>
          <i className="fas fa-save"></i> {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
      </fieldset>
    </form>
  );
}
