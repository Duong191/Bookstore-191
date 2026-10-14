import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useBooks } from '../hooks/useBooks';
import BookCard from '../components/ui/BookCard';
import { fixImagePath } from '../utils/format';
import RecommendationSection from '../components/recommendation/RecommendationSection';
import { getBestSellersByCategory, isMarkedNew } from '../services/booksService';
import type { Book } from '../types/bookstore.types';

const PER = 5;

interface BookWithExtras extends Book {
  featured?: boolean;
  category?: string;
  categoryName?: string;
  tags?: string[];
  salesCount?: number;
  reviews?: number;
  images?: string[];
  originalPrice?: number;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (ch) => (ch === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .trim();
}

function hasAnyKeyword(value: unknown, keywords: string[]): boolean {
  const normalized = normalizeText(value);
  return keywords.some((k) => normalized.includes(normalizeText(k)));
}

function isMangaComicBook(book: BookWithExtras): boolean {
  const categoryName = String((book as any).categoryName ?? '');
  const title = String(book.title || '');
  const imageRaw = String(book.images?.[0] || book.image || '');
  const tags = Array.isArray(book.tags) ? book.tags.map((t) => String(t)) : [];
  const tagText = tags.join(' ');
  if (hasAnyKeyword(categoryName, ['manga', 'comic'])) return true;
  if (hasAnyKeyword(tagText, ['manga', 'comic'])) return true;
  if (imageRaw.toLowerCase().includes('/manga-comic/')) return true;
  // Manga thường có format tập; không dùng đơn lẻ vì có thể dính sách thiếu nhi khác.
  if (hasAnyKeyword(title, ['chú thuật hồi chiến', 'doraemon', 'conan'])) return true;
  return false;
}

function isThieuNhiBook(book: BookWithExtras): boolean {
  const categoryName = String((book as any).categoryName ?? '');
  const tags = Array.isArray(book.tags) ? book.tags.map((t) => String(t)) : [];
  const tagText = tags.join(' ');
  if (hasAnyKeyword(categoryName, ['thieu nhi', 'thiếu nhi'])) return true;
  if (hasAnyKeyword(tagText, ['thieu nhi', 'thiếu nhi'])) return true;
  return false;
}

function slicePage<T>(items: T[], page: number, per = PER): T[] {
  const start = page * per;
  return items.slice(start, start + per);
}

/** Fisher–Yates shuffle (copy vào mảng mới, không chỉnh sửa danh gốc). */
function shuffleRandom<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Panel phải của section "Bảng xếp hạng bán chạy tuần" (trang chủ).
 * Nhiệm vụ: hiển thị ảnh + tiêu đề + mô tả rút gọn của **một** cuốn sách — dữ liệu do cha truyền vào khi user hover hàng bên trái (không gọi API).
 */
function RankingPreviewDetailPanel({ book }: { book: BookWithExtras }) {
  const cover = fixImagePath(book.images?.[0] || book.image);
  const desc = (book.description || '').trim();
  const shortDesc =
    desc.length > 360 ? `${desc.slice(0, 360).trim()}…` : desc || 'Đang cập nhật mô tả sách.';

  return (
    <div className="ranking-preview-detail-card ranking-preview-detail-simple">
      <div className="ranking-preview-detail-media">
        <img
          src={cover}
          alt={book.title}
          className="ranking-preview-detail-cover"
          onError={(e) => {
            const el = e.currentTarget;
            el.onerror = null;
            el.src = 'https://placehold.co/400x560?text=No+Image';
          }}
        />
      </div>
      <h2 className="ranking-preview-detail-heading">
        <NavLink to={`/books/${book.id}`}>{book.title}</NavLink>
      </h2>
      <p className="ranking-preview-detail-desc">{shortDesc}</p>
    </div>
  );
}

export default function HomePage() {
  const { books: baseBooks, loading,categories } = useBooks();
  const { addToCart } = useCart();
  const books = baseBooks as BookWithExtras[];

  /** Xáo thứ tự sách nổi bật khi vào trang chủ (mỗi lần mount / khi danh sách books đổi). */
  const featured = useMemo(
    () => shuffleRandom(books.filter((b) => b.featured)),
    [books]
  );
  const [featPage, setFeatPage] = useState(0);
  const featPages = Math.max(1, Math.ceil(featured.length / PER));

  const newBooks = useMemo(() => {
    const marked = books.filter((b) => isMarkedNew(b));
    return [...marked].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [books]);
  const [newBooksPage, setNewBooksPage] = useState(0);
  const newBooksPages = Math.max(1, Math.ceil(newBooks.length / PER));

  useEffect(() => {
    setFeatPage(0);
    setNewBooksPage(0);
  }, [books]);

  const comicsAll = useMemo(
    () => books.filter((b) => isMangaComicBook(b) || isThieuNhiBook(b)),
    [books]
  );
  const [comicTab,setComicTab]=useState('all');
  const [comicPage,setComicPage]=useState(0);
  const comicTabs=[{id:'all',label:'Tất cả'},...categories.filter(c=>comicsAll.some(b=>String(b.categoryId)===c.id)).map(c=>({id:c.id,label:c.name}))];
  const comicFiltered=useMemo(()=>comicTab==='all'?comicsAll:comicsAll.filter(b=>String(b.categoryId)===comicTab),[comicsAll,comicTab]);
  const comicPages = Math.max(1, Math.ceil(comicFiltered.length / PER));

  /** Tab danh mục cho bảng xếp hạng (id category khớp backend / booksService). */
  const [rankCat, setRankCat] = useState('all');

  /** Top 5 sách bán chạy theo category — từ context, không fetch thêm. */
  const rankingPreview = useMemo(() => getBestSellersByCategory(books, rankCat,categories).slice(0, 5), [books, rankCat,categories]);
  
  /**
   * Id sách đang được hover ở cột trái; `null` = coi như chọn mặc định **hạng 1** (xem activeRankBook).
   * Reset khi đổi tab danh mục để panel không hiển thị sách của category cũ.
   */
  const [activeRankBookId, setActiveRankBookId] = useState<string | null>(null);

  /* Đổi tab danh mục → panel phải phải khớp list mới → bỏ id hover cũ (mặc định lại = hạng 1). */
  useEffect(() => {
    setActiveRankBookId(null);
  }, [rankCat]);

  /** Cuốn sách đang hiển thị ở panel phải: hover hoặc mặc định phần tử đầu danh sách. */
  const activeRankBook = useMemo(() => {
    if (!rankingPreview.length) return null;
    const id = activeRankBookId ?? rankingPreview[0].id;
    return rankingPreview.find((b) => String(b.id) === String(id)) ?? rankingPreview[0];
  }, [rankingPreview, activeRankBookId]);

  const foreignAll=useMemo(()=>books.filter(b=>hasAnyKeyword([b.language,(b as any).categoryName,...(b.tags||[])].join(' '),
    ['ngoại ngữ','tiếng anh','tiếng nhật','tiếng trung','english','japanese','chinese'])),[books]);
  const [foreignTab,setForeignTab]=useState('all');
  const [foreignPage,setForeignPage]=useState(0);
  const foreignTabs=[{id:'all',label:'Tất cả'},...categories.filter(c=>foreignAll.some(b=>String(b.categoryId)===c.id)).map(c=>({id:c.id,label:c.name}))];
  const foreignFiltered=useMemo(()=>foreignTab==='all'?foreignAll:foreignAll.filter(b=>String(b.categoryId)===foreignTab),[foreignAll,foreignTab]);
  const foreignPages = Math.max(1, Math.ceil(foreignFiltered.length / PER));

  const recommendations = useMemo(() => {
    const shuffled = [...books].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(100, books.length));
  }, [books]);

  if (loading) {
    return (
      <div className="container" style={{ padding: 60 }}>
        Đang tải…
      </div>
    );
  }

  return (
    <div className="home-liquid-bg">
      <section className="hero">
        <div className="hero-slider">
          <div className="hero-slide active">
            <img src="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1600" alt="Books" />
            <div className="hero-content">
              <div className="container">
                <h1>Khám Phá Thế Giới Sách</h1>
                <p>Hàng ngàn đầu sách hay đang chờ bạn khám phá</p>
                <NavLink to="/shop" className="btn btn-primary">
                  Mua Sắm Ngay
                </NavLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="featured-books">
        <div className="container">
          <div className="section-header">
            <h2>Sách Nổi Bật</h2>
          </div>
          <div className="featured-books-carousel">
            <button
              type="button"
              className="carousel-nav prev"
              disabled={featPage <= 0}
              onClick={() => setFeatPage((p) => Math.max(0, p - 1))}
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="books-container">
              <div className="books-carousel" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {slicePage(featured, featPage).map((book) => (
                  <div key={book.id} className="home-book-slot">
                    <BookCard book={book as any} onAddToCart={addToCart} />
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="carousel-nav next"
              disabled={featPage >= featPages - 1}
              onClick={() => setFeatPage((p) => Math.min(featPages - 1, p + 1))}
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="view-more-container">
            <NavLink to="/shop?filter=featured" className="view-more-btn">
              Xem Thêm
            </NavLink>
          </div>
        </div>
      </section>

      <section className="featured-books">
        <div className="container">
          <div className="section-header">
            <h2>Sách Mới</h2>
          </div>
          <div className="featured-books-carousel">
            <button
              type="button"
              className="carousel-nav prev"
              disabled={newBooksPage <= 0}
              onClick={() => setNewBooksPage((p) => Math.max(0, p - 1))}
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="books-container">
              <div className="books-carousel" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {newBooks.length === 0 ? (
                  <p style={{ padding: 40, color: '#666' }}>Chưa có sách mới — hãy thêm sách và bật “Mới” trong admin.</p>
                ) : (
                  slicePage(newBooks, newBooksPage).map((book) => (
                    <div key={book.id} className="home-book-slot">
                      <BookCard book={book as any} onAddToCart={addToCart} />
                    </div>
                  ))
                )}
              </div>
            </div>
            <button
              type="button"
              className="carousel-nav next"
              disabled={newBooksPage >= newBooksPages - 1}
              onClick={() => setNewBooksPage((p) => Math.min(newBooksPages - 1, p + 1))}
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="view-more-container">
            <NavLink to="/shop?filter=new" className="view-more-btn">
              Xem Thêm
            </NavLink>
          </div>
        </div>
      </section>

      <section className="featured-books">
        <div className="container">
          <div className="section-header comic-section-header">
            <h2>Truyện Tranh</h2>
          </div>
          <div className="comic-tabs-wrapper"><div className="swiper-wrapper">
  {comicTabs.map(t=><button key={t.id} type="button" className={`comic-tab-btn ${comicTab===t.id?'active':''}`} onClick={()=>{setComicTab(t.id);setComicPage(0);}}>{t.label}</button>)}
</div></div>
          <div className="featured-books-carousel">
            <button
              type="button"
              className="carousel-nav prev"
              disabled={comicPage <= 0}
              onClick={() => setComicPage((p) => Math.max(0, p - 1))}
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="books-container">
              <div className="books-carousel" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {comicFiltered.length === 0 ? (
                  <p style={{ padding: 40, color: '#666' }}>Chưa có sản phẩm nào</p>
                ) : (
                  slicePage(comicFiltered, comicPage).map((book) => (
                    <div key={book.id} className="home-book-slot">
                      <BookCard book={book as any} onAddToCart={addToCart} />
                    </div>
                  ))
                )}
              </div>
            </div>
            <button
              type="button"
              className="carousel-nav next"
              disabled={comicPage >= comicPages - 1}
              onClick={() => setComicPage((p) => Math.min(comicPages - 1, p + 1))}
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="view-more-container">
            <NavLink to={comicTab==='all'?'/shop':`/shop?category=${comicTab}`} className="view-more-btn">
              Xem Thêm
            </NavLink>
          </div>
        </div>
      </section>

      {/*
        Section: Bảng xếp hạng bán chạy tuần (Fahasa-style).
        Trái: danh sách top 5 — hover / focus hàng → setActiveRankBookId.
        Phải: RankingPreviewDetailPanel theo activeRankBook (không reload, không API).
      */}
      <section className="bestseller-ranking-preview">
        <div className="container">
          <div className="section-header ranking-preview-header">
            <h2>Bảng xếp hạng bán chạy tuần</h2>
          </div>
          <div className="ranking-preview-tabs-wrapper">
            <div className="ranking-preview-tabs">
              {[{id: 'all',label: 'Tất cả'},...categories.filter(c=>!c.parentId).map(c=>({id:c.id,label:c.name}))].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ranking-preview-tab-btn ${rankCat === t.id ? 'active' : ''}`}
                  onClick={() => setRankCat(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {rankingPreview.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 40, color: '#666' }}>Chưa có sách trong danh mục này</p>
          ) : (
            <div className="ranking-preview-layout">
              {/* Cột trái: scroll dọc; CSS chặn overflow ngang (xem bestseller-ranking.css) */}
              <div className="ranking-preview-list-col">
                <div className="ranking-list ranking-preview-list-inner">
                  {rankingPreview.map((book, index) => {
                    const rank = index + 1;
                    /* Điểm hiển thị — cùng công thức score với booksService (ranking nội bộ UI) */
                    const score =
                      (book.salesCount || 0) * 10 + (book.rating || 0) * 100 + (book.reviews || 0) * 2;
                    const imgRaw = book.images?.[0] || book.image;
                    const img = fixImagePath(imgRaw);
                    const isActive = Boolean(
                      activeRankBook && String(activeRankBook.id) === String(book.id)
                    );
                    return (
                      <div
                        key={book.id}
                        className={`ranking-item ranking-preview-row ${isActive ? 'selected' : ''}`}
                        onMouseEnter={() => setActiveRankBookId(String(book.id))}
                        onFocus={() => setActiveRankBookId(String(book.id))}
                        tabIndex={0}
                        role="button"
                        aria-label={`Hạng ${rank}: ${book.title}`}
                        aria-pressed={isActive}
                      >
                        <div className="ranking-preview-rank">
                          <div className="ranking-preview-rank-number">{String(rank).padStart(2, '0')}</div>
                          <div className="ranking-preview-rank-trend">
                            <i className="fas fa-arrow-up" aria-hidden />
                          </div>
                        </div>
                        <div className="ranking-item-content">
                          <img
                            src={img}
                            alt={book.title}
                            className="ranking-preview-book-image"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.onerror = null;
                              target.src = 'https://placehold.co/240x320?text=No+Image';
                            }}
                          />
                          <div className="ranking-preview-book-info">
                            <h3 className="ranking-book-title">
                              <NavLink to={`/books/${book.id}`} onClick={(e) => e.stopPropagation()}>
                                {book.title}
                              </NavLink>
                            </h3>
                            <p className="ranking-preview-book-author">{book.author}</p>
                            <div className="ranking-preview-book-score">
                              <span className="score-value">{score.toLocaleString('vi-VN')}</span> điểm
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cột phải: nội dung đổi theo activeRankBook; aria-live để SR biết khi đổi sách */}
              <aside className="ranking-preview-detail-col" aria-live="polite">
                {activeRankBook && (
                  <RankingPreviewDetailPanel key={activeRankBook.id} book={activeRankBook as BookWithExtras} />
                )}
              </aside>
            </div>
          )}
          <div className="view-more-container">
            <NavLink to="/bestseller-ranking" className="view-more-btn">
              Xem thêm
            </NavLink>
          </div>
        </div>
      </section>

      <section className="featured-books">
        <div className="container">
          <div className="section-header">
            <h2>Sách Ngoại Ngữ</h2>
          </div>
          <div className="comic-tabs-wrapper">
            <div className="swiper-wrapper">
              {foreignTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`comic-tab-btn ${foreignTab === t.id ? 'active' : ''}`}
                  onClick={() => {
                    setForeignTab(t.id);
                    setForeignPage(0);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="featured-books-carousel">
            <button
              type="button"
              className="carousel-nav prev"
              disabled={foreignPage <= 0}
              onClick={() => setForeignPage((p) => Math.max(0, p - 1))}
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="books-container">
              <div className="books-carousel" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {foreignFiltered.length === 0 ? (
                  <p style={{ padding: 40, color: '#666' }}>Chưa có sản phẩm nào</p>
                ) : (
                  slicePage(foreignFiltered, foreignPage).map((book) => (
                    <div key={book.id} className="home-book-slot">
                      <BookCard book={book as any} onAddToCart={addToCart} />
                    </div>
                  ))
                )}
              </div>
            </div>
            <button
              type="button"
              className="carousel-nav next"
              disabled={foreignPage >= foreignPages - 1}
              onClick={() => setForeignPage((p) => Math.min(foreignPages - 1, p + 1))}
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="view-more-container">
            <NavLink to={foreignTab==='all'?'/shop':`/shop?category=${foreignTab}`} className="view-more-btn">
              Xem Thêm
            </NavLink>
          </div>
        </div>
      </section>

      <section className="recommendations-section">
        <div className="container">
          <RecommendationSection title="Gợi ý cho bạn" books={recommendations} moreHref="/shop" moreLabel="Xem thêm" />
        </div>
      </section>

      <section className="newsletter">
        <div className="container">
          <div className="newsletter-content">
            <h2>Đăng Ký Nhận Tin</h2>
            <p>Nhận thông tin về sách mới và khuyến mãi đặc biệt</p>
            <form
              className="newsletter-form"
              onSubmit={(e) => {
                e.preventDefault();
                alert('Cảm ơn bạn đã đăng ký nhận tin!');
                (e.target as HTMLFormElement).reset();
              }}
            >
              <input type="email" placeholder="Nhập email của bạn" required />
              <button type="submit" className="btn btn-primary">
                Đăng Ký
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
