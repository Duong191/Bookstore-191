/**
 * Service tiện ích cho catalog sách phía FE:
 * - lọc theo danh mục/giá/đánh giá,
 * - tìm kiếm theo từ khóa,
 * - sắp xếp,
 * - tính điểm xếp hạng "best seller" để hiển thị bảng xếp hạng.
 *
 * Thiết kế: pure function, nhận mảng sách + tham số → trả mảng mới.
 * Không gọi API ở đây (việc đó nằm ở `src/api/*` và `BookstoreContext`).
 */
import type { Book,Category } from '../types/bookstore.types';
import {categoryScope} from './categoryTree';

/** categoryId / category từ API hoặc seed có thể là string hoặc number — chuẩn hóa để lọc khớp sidebar. */
export function normalizedBookCategoryId(book: Book): string {
  const b = book as Book & { category?: string | number; category_id?: string | number };
  const raw = b.categoryId ?? b.category ?? b.category_id;
  if (raw === null || raw === undefined || raw === '') return '';
  return String(raw);
}

/** Cờ “sách mới” từ API (camelCase hoặc snake_case). */
export function isMarkedNew(book: Book): boolean {
  const b = book as Book & { isNew?: boolean; is_new?: boolean };
  return Boolean(b.isNew ?? b.is_new);
}

export function isFeaturedBook(book: Book): boolean {
  return Boolean((book as Book & { featured?: boolean }).featured);
}

/**
 * Lọc sách theo danh mục, khoảng giá và rating tối thiểu.
 * - `category = 'all'` → bỏ qua filter danh mục.
 * - `priceRange` dạng "min-max" hoặc "min-" (không có max).
 * - `rating` truyền số tối thiểu (ví dụ "4" → ≥ 4 sao).
 */
export function filterBooks(books: Book[], category = 'all', priceRange = 'all', rating = 'all'): Book[] {
  let list = [...books];

  if (category !== 'all') {
    const want = String(category).trim();
    list = list.filter((book) => normalizedBookCategoryId(book) === want);
  }

  if (priceRange !== 'all') {
    const parts = priceRange.split('-').map(Number);
    const min = parts[0];
    const max = parts[1];
    list = list.filter((book) => {
      const discountedPrice =
        book.discount > 0 ? Math.round(book.price * (1 - book.discount / 100)) : book.price;
      return discountedPrice >= min && (max === undefined || discountedPrice <= max);
    });
  }

  if (rating !== 'all') {
    list = list.filter((book) => (book.rating || 0) >= parseFloat(rating));
  }

  return list;
}

/**
 * Tìm kiếm theo từ khóa trong tiêu đề/tác giả/NXB/mô tả (không phân biệt hoa thường).
 * Trả về list ban đầu nếu keyword rỗng.
 */
export function searchBooks(books: Book[], keyword: string): Book[] {
  if (!keyword.trim()) return books;
  const searchTerm = keyword.toLowerCase();
  return books.filter(
    (book) =>
      book.title.toLowerCase().includes(searchTerm) ||
      book.author.toLowerCase().includes(searchTerm) ||
      (book.publisher && book.publisher.toLowerCase().includes(searchTerm)) ||
      (book.description && book.description.toLowerCase().includes(searchTerm))
  );
}

/**
 * Sắp xếp sách theo các tiêu chí UI:
 * name-asc/desc, price-asc/desc (theo giá đã giảm), rating, newest/oldest.
 * `default` giữ nguyên thứ tự đầu vào.
 */
export function sortBooks(books: Book[], sortBy = 'default'): Book[] {
  const sortedBooks = [...books];

  switch (sortBy) {
    case 'name-asc':
      return sortedBooks.sort((a, b) => a.title.localeCompare(b.title));
    case 'name-desc':
      return sortedBooks.sort((a, b) => b.title.localeCompare(a.title));
    case 'price-asc':
      return sortedBooks.sort((a, b) => {
        const priceA = a.discount > 0 ? Math.round(a.price * (1 - a.discount / 100)) : a.price;
        const priceB = b.discount > 0 ? Math.round(b.price * (1 - b.discount / 100)) : b.price;
        return priceA - priceB;
      });
    case 'price-desc':
      return sortedBooks.sort((a, b) => {
        const priceA = a.discount > 0 ? Math.round(a.price * (1 - a.discount / 100)) : a.price;
        const priceB = b.discount > 0 ? Math.round(b.price * (1 - b.discount / 100)) : b.price;
        return priceB - priceA;
      });
    case 'rating':
      return sortedBooks.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    case 'newest':
      return sortedBooks.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    case 'oldest':
      return sortedBooks.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB;
      });
    default:
      return sortedBooks;
  }
}

interface BookWithExtras extends Book {
  salesCount?: number;
  trending?: boolean;
  bestSeller?: boolean;
  isNew?: boolean;
  reviews?: number;
  images?: string[];
}

/**
 * Tính điểm xếp hạng cho 1 sách trên bảng "Best seller tuần".
 * Trọng số (lớn → nhỏ): trending > bestSeller > rating > review > sold > new.
 * Mọi hệ số là kinh nghiệm, có thể chỉnh khi cần.
 */
export function calculateRankingScore(book: BookWithExtras): number {
  const salesScore = (book.salesCount || book.soldCount || 0) * 10;
  const ratingScore = (book.rating || 0) * 100;
  const reviewScore = (book.reviews || book.reviewCount || 0) * 2;
  const trendingBonus = book.trending ? 500 : 0;
  const bestsellerBonus = book.bestSeller ? 300 : 0;
  const newBonus = book.isNew ? 200 : 0;
  return salesScore + ratingScore + reviewScore + trendingBonus + bestsellerBonus + newBonus;
}

export function getBestSellersByCategory(books: BookWithExtras[], categoryId: string,categories:Category[]=[]): BookWithExtras[] {
  let list = [...books];

  if (categoryId !== 'all') {
    const scope=categoryScope(categories,String(categoryId));
    list = list.filter((book) => scope.has(normalizedBookCategoryId(book)));
  }

  return list.sort((a, b) => calculateRankingScore(b) - calculateRankingScore(a));
}

export function getRelatedBooks(books: Book[], bookId: string, limit = 80): Book[] {
  const current = books.find((b) => String(b.id) === String(bookId));
  if (!current) return [];
  const currentCat = normalizedBookCategoryId(current);
  return books
    .filter((b) => String(b.id) !== String(bookId) && normalizedBookCategoryId(b) === currentCat)
    .slice(0, limit);
}
