import { useEffect, useMemo, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useBooks } from '../hooks/useBooks';
import BookCard from '../components/ui/BookCard';
import { filterBooks, isFeaturedBook, isMarkedNew, searchBooks, sortBooks } from '../services/booksService';
import {categoryScope} from '../services/categoryTree';

/** Tối đa 4 sách / 1 hàng; 3 hàng / trang → 12 sách mỗi trang */
const SHOP_COLS = 4;
const SHOP_ROWS = 3;
const BOOKS_PER_PAGE = SHOP_COLS * SHOP_ROWS;

function buildPaginationItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out: (number | 'ellipsis')[] = [];
  const ellipsis = () => {
    if (out[out.length - 1] !== 'ellipsis') out.push('ellipsis');
  };

  if (current <= 4) {
    const lastHead = Math.min(5, total);
    for (let p = 1; p <= lastHead; p++) out.push(p);
    if (total > lastHead + 1) {
      ellipsis();
      out.push(total);
    } else {
      for (let p = lastHead + 1; p <= total; p++) out.push(p);
    }
  } else if (current >= total - 3) {
    out.push(1);
    ellipsis();
    const start = Math.max(2, total - 4);
    for (let p = start; p <= total; p++) out.push(p);
  } else {
    out.push(1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total);
  }

  return out;
}

export default function ShopPage() {
  const { books, categories, loading } = useBooks();
  const [params, setParams] = useSearchParams();

  const [sortBy, setSortBy] = useState('default');
  const selectedCategory = params.get('category') || 'all';
  const search = params.get('search') || '';
  const selectedPrice = params.get('price') || 'all';
  const selectedRating = params.get('rating') || 'all';
  const listFilter = params.get('filter') || '';
  const pageParam = Number(params.get('page') || '1');

  const normalizeKey = (value: string): string =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, (ch) => (ch === 'đ' ? 'd' : 'D'))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const resolvedCategoryId = useMemo(() => {
    if (selectedCategory === 'all') return 'all';
    const byId = categories.find((c) => String(c.id) === String(selectedCategory));
    if (byId) return String(byId.id);
    const key = normalizeKey(selectedCategory);
    const bySlug = categories.find((c) => normalizeKey((c as any).slug || c.name || '') === key);
    return bySlug ? String(bySlug.id) : selectedCategory;
  }, [selectedCategory, categories]);

  const filtered = useMemo(() => {
    let list = filterBooks(books, 'all', selectedPrice, selectedRating);
    if(resolvedCategoryId!=='all'){const scope=categoryScope(categories,resolvedCategoryId);list=list.filter(book=>scope.has(String(book.categoryId)));}
    if (listFilter === 'featured') list = list.filter(isFeaturedBook);
    if (listFilter === 'new') list = list.filter(isMarkedNew);
    if (search) list = searchBooks(list, search);
    const effectiveSort =
      listFilter === 'new' && sortBy === 'default' ? 'newest' : sortBy;
    return sortBooks(list, effectiveSort);
  }, [books,categories, resolvedCategoryId, selectedPrice, selectedRating, listFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / BOOKS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, Number.isFinite(pageParam) ? pageParam : 1), totalPages);

  useEffect(() => {
    const raw = Number(params.get('page') || '1');
    if (!Number.isFinite(raw) || raw < 1) {
      const next = new URLSearchParams(params);
      next.delete('page');
      setParams(next, { replace: true });
      return;
    }
    if (raw > totalPages && totalPages >= 1) {
      const next = new URLSearchParams(params);
      if (totalPages <= 1) next.delete('page');
      else next.set('page', String(totalPages));
      setParams(next, { replace: true });
    }
  }, [params, totalPages, setParams]);

  const pagedBooks = useMemo(() => {
    const start = (currentPage - 1) * BOOKS_PER_PAGE;
    return filtered.slice(start, start + BOOKS_PER_PAGE);
  }, [filtered, currentPage]);

  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page');
    else next.set('page', String(p));
    setParams(next);
  };

  const handleCategoryChange = (catId: string) => {
    const newParams = new URLSearchParams(params);
    newParams.delete('page');
    /** Đổi danh mục = duyệt theo kệ; giữ `search` làm “Tất cả”/danh mục vẫn chỉ vài kết quả vì từ khóa cũ trong URL. */
    newParams.delete('search');
    if (catId === 'all') {
      newParams.delete('category');
    } else {
      newParams.set('category', catId);
    }
    setParams(newParams);
  };

  const handlePriceChange = (priceRange: string) => {
    const newParams = new URLSearchParams(params);
    newParams.delete('page');
    if (priceRange === 'all') {
      newParams.delete('price');
    } else {
      newParams.set('price', priceRange);
    }
    setParams(newParams);
  };

  const handleRatingChange = (rating: string) => {
    const newParams = new URLSearchParams(params);
    newParams.delete('page');
    if (rating === 'all') {
      newParams.delete('rating');
    } else {
      newParams.set('rating', rating);
    }
    setParams(newParams);
  };

  const clearFilters = () => {
    setParams({});
    setSortBy('default');
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    const next = new URLSearchParams(params);
    next.delete('page');
    setParams(next);
  };

  if (loading) {
    return <div className="container" style={{ padding: 60 }}>Đang tải…</div>;
  }

  return (
    <>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <div className="container">
          <NavLink to="/">Trang chủ</NavLink>
          <span>/</span>
          <span>Cửa hàng</span>
          {resolvedCategoryId !== 'all' && categories.find(c => String(c.id) === resolvedCategoryId) && (
            <>
              <span>/</span>
              <span>{categories.find(c => String(c.id) === resolvedCategoryId)?.name}</span>
            </>
          )}
        </div>
      </div>

      {/* Shop Section */}
      <section className="shop-section">
        <div className="container">
          <div className="shop-layout">
            {/* Sidebar Filters */}
            <aside className="shop-sidebar">
              <div className="filter-widget">
                <h3>DANH MỤC</h3>
                <div className="category-list">
                  <label>
                    <input
                      type="radio"
                      name="category"
                      value="all"
                      checked={selectedCategory === 'all'}
                      onChange={() => handleCategoryChange('all')}
                    />
                    <span>Tất cả</span>
                  </label>
                  {categories.map((cat) => (
                    <label key={cat.id}>
                      <input
                        type="radio"
                        name="category"
                        value={String(cat.id)}
                        checked={resolvedCategoryId === String(cat.id)}
                        onChange={() => handleCategoryChange(String(cat.id))}
                      />
                      <span>{cat.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="filter-widget">
                <h3>KHOẢNG GIÁ</h3>
                <div className="price-filter">
                  <label>
                    <input
                      type="radio"
                      name="price"
                      value="all"
                      checked={selectedPrice === 'all'}
                      onChange={() => handlePriceChange('all')}
                    />
                    <span>Tất cả</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="price"
                      value="0-100000"
                      checked={selectedPrice === '0-100000'}
                      onChange={() => handlePriceChange('0-100000')}
                    />
                    <span>Dưới 100.000đ</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="price"
                      value="100000-200000"
                      checked={selectedPrice === '100000-200000'}
                      onChange={() => handlePriceChange('100000-200000')}
                    />
                    <span>100.000đ - 200.000đ</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="price"
                      value="200000-500000"
                      checked={selectedPrice === '200000-500000'}
                      onChange={() => handlePriceChange('200000-500000')}
                    />
                    <span>200.000đ - 500.000đ</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="price"
                      value="500000-1000000"
                      checked={selectedPrice === '500000-1000000'}
                      onChange={() => handlePriceChange('500000-1000000')}
                    />
                    <span>Trên 500.000đ</span>
                  </label>
                </div>
              </div>

              <div className="filter-widget">
                <h3>ĐÁNH GIÁ</h3>
                <div className="rating-filter">
                  <label>
                    <input
                      type="radio"
                      name="rating"
                      value="all"
                      checked={selectedRating === 'all'}
                      onChange={() => handleRatingChange('all')}
                    />
                    <span>Tất cả</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="rating"
                      value="5"
                      checked={selectedRating === '5'}
                      onChange={() => handleRatingChange('5')}
                    />
                    <span>⭐⭐⭐⭐⭐</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="rating"
                      value="4"
                      checked={selectedRating === '4'}
                      onChange={() => handleRatingChange('4')}
                    />
                    <span>⭐⭐⭐⭐ trở lên</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="rating"
                      value="3"
                      checked={selectedRating === '3'}
                      onChange={() => handleRatingChange('3')}
                    />
                    <span>⭐⭐⭐ trở lên</span>
                  </label>
                </div>
              </div>

              <button className="btn btn-secondary btn-block" onClick={clearFilters}>
                Xóa Bộ Lọc
              </button>
            </aside>

            {/* Main Content */}
            <div className="shop-main">
              <div className="shop-header">
                <div className="shop-info">
                  <p>
                    Hiển thị{' '}
                    <span>
                      {filtered.length === 0
                        ? 0
                        : `${(currentPage - 1) * BOOKS_PER_PAGE + 1}–${Math.min(currentPage * BOOKS_PER_PAGE, filtered.length)}`}
                    </span>{' '}
                    / <span>{filtered.length}</span> kết quả
                  </p>
                </div>
                <div className="shop-sort">
                  <label>Sắp xếp:</label>
                  <select value={sortBy} onChange={(e) => handleSortChange(e.target.value)}>
                    <option value="default">Mặc định</option>
                    <option value="name-asc">Tên A-Z</option>
                    <option value="name-desc">Tên Z-A</option>
                    <option value="price-asc">Giá thấp đến cao</option>
                    <option value="price-desc">Giá cao đến thấp</option>
                    <option value="rating">Đánh giá cao nhất</option>
                    <option value="newest">Mới nhất</option>
                  </select>
                </div>
              </div>

              <div className="books-grid books-grid--shop-paged">
                {filtered.length === 0 ? (
                  <p>Không tìm thấy sản phẩm nào</p>
                ) : (
                  pagedBooks.map((book) => <BookCard key={book.id} book={book as any} />)
                )}
              </div>

              {filtered.length > 0 && totalPages > 1 && (
                <nav className="shop-pagination" aria-label="Phân trang sản phẩm">
                  {paginationItems.map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span key={`e-${idx}`} className="shop-pagination-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`shop-pagination-page${item === currentPage ? ' shop-pagination-page--active' : ''}`}
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="shop-pagination-next"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                    aria-label="Trang sau"
                  >
                    <i className="fas fa-chevron-right" aria-hidden />
                  </button>
                </nav>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
