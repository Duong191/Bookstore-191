import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBookstore } from '../context/BookstoreContext';
import { getBestSellersByCategory } from '../services/booksService';
import { formatPrice, fixImagePath } from '../utils/format';

export default function BestsellerRankingPage() {
  const { data, loading } = useBookstore();
  const [category, setCategory] = useState('all');
  const ranking = useMemo(() => getBestSellersByCategory(data?.books || [], category,data?.categories||[]), [data?.books, category,data?.categories]);

  if (loading) {
    return <div className="container" style={{ padding: 60 }}>Đang tải…</div>;
  }

  return (
    <div className="bestseller-ranking-page">
      <div className="container" style={{ padding: 40 }}>
        <h1>Bảng Xếp Hạng Bán Chạy</h1>
        <div style={{ marginTop: 30 }}>
          <label>Danh mục: </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Tất cả</option>
            {(data?.categories||[]).map(c=><option key={c.id} value={c.id}>{c.parentId?'— ':''}{c.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 40 }}>
          {ranking.length === 0 ? (
            <p>Không có sách trong danh mục này</p>
          ) : (
            ranking.map((book, index) => (
              <Link
                key={book.id}
                to={`/books/${encodeURIComponent(String(book.id))}`}
                style={{
                  borderBottom: '1px solid #eee',
                  padding: 20,
                  display: 'flex',
                  gap: 20,
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
                className="bestseller-ranking-row-link"
              >
                <div style={{ fontWeight: 'bold', fontSize: 24 }}>{index + 1}</div>
                <img
                  src={fixImagePath((book as any).images?.[0] || book.image)}
                  alt={book.title}
                  style={{ width: 60, height: 90, objectFit: 'cover', flexShrink: 0 }}
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.onerror = null;
                    target.src = 'https://placehold.co/240x320?text=No+Image';
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ marginTop: 0, marginBottom: 8 }}>{book.title}</h3>
                  <p style={{ margin: '0 0 6px' }}>{book.author}</p>
                  <p style={{ margin: 0 }}>{formatPrice(book.price)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
