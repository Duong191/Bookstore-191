/**
 * File này chứa các hàm gọi API public (sách, danh mục, chi tiết sách).
 * Không xử lý UI, chỉ gửi request và chuẩn hóa dữ liệu backend về model frontend.
 */
import { httpRequest } from './httpClient';
import type { Book } from '../types/bookstore.types';

// Backend có thể trả list trực tiếp hoặc bọc trong `items`/`data`.
type ListResponse<T> = T[] | { items?: T[]; data?: T[] };

/** Đồng bộ format response list giữa nhiều endpoint backend. */
function unwrapList<T>(payload: ListResponse<T>): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export type RawBook = Record<string, unknown>;

/** Chuẩn hóa dòng sách từ API (public hoặc admin trả về snake_case). */
export function mapBook(raw: RawBook): Book & {
  featured?: boolean;
  bestseller?: boolean;
  bestSeller?: boolean;
  trending?: boolean;
  isNew?: boolean;
  reviews?: number;
  salesCount?: number;
  images?: string[];
  originalPrice?: number;
  categoryName?: string;
} {
  const price = Number(raw.price ?? 0);
  const discount = Number(raw.discount ?? 0);
  const images = Array.isArray(raw.images) ? raw.images.map(String).filter(Boolean)
    : raw.image_url || raw.image ? [String(raw.image_url ?? raw.image)] : [];
  const image = images[0] || '';
  const soldCount = Number(raw.sold_count ?? raw.soldCount ?? 0);
  const reviewCount = Number(raw.review_count ?? raw.reviewCount ?? 0);

  // Mapping field backend -> frontend để các page/service dùng một schema thống nhất.
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    author: String(raw.author ?? ''),
    price,
    importPrice: raw.import_price != null ? Number(raw.import_price) : undefined,
    discount,
    stock: Number(raw.stock ?? 0),
    categoryId: String(raw.category_id ?? raw.categoryId ?? ''),
    categoryName: raw.category_name != null ? String(raw.category_name) : undefined,
    description: String(raw.description ?? ''),
    image,
    isbn: raw.isbn != null ? String(raw.isbn) : undefined,
    publisher: raw.publisher != null ? String(raw.publisher) : undefined,
    publishDate: raw.publish_date != null ? String(raw.publish_date) : undefined,
    pages: raw.pages != null ? Number(raw.pages) : undefined,
    language: raw.language != null ? String(raw.language) : undefined,
    rating: raw.rating != null ? Number(raw.rating) : undefined,
    reviewCount,
    soldCount,
    viewCount: raw.view_count != null ? Number(raw.view_count) : undefined,
    createdAt: raw.created_at ? String(raw.created_at) : new Date().toISOString(),
    updatedAt: raw.updated_at ? String(raw.updated_at) : undefined,
    featured: Boolean(raw.featured),
    bestseller: Boolean(raw.bestseller),
    bestSeller: Boolean(raw.bestseller),
    trending: Boolean(raw.trending),
    isNew: Boolean(raw.is_new ?? raw.isNew),
    reviews: reviewCount,
    salesCount: soldCount,
    images,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    format: raw.format != null ? String(raw.format) : undefined,
    supportsTrending: raw.supportsTrending === true,
    supportsFormat: raw.supportsFormat === true,
    originalPrice: discount > 0 ? Math.round(price / (1 - discount / 100)) : undefined,
  };
}

/** Health check nhanh cho API backend. */
export async function getHealthStatus(): Promise<{ status: string; service: string }> {
  return httpRequest('/health');
}

/** Lấy danh sách sách public rồi map về model FE thống nhất. */
export async function getBooks<TBook>(params = 'page=1&limit=100'): Promise<TBook[]> {
  // Endpoint danh sách sách public.
  const data = await httpRequest<ListResponse<RawBook>>(`/books?${params}`);
  // Chuẩn hóa từng dòng sách về model FE trước khi trả cho caller.
  return unwrapList(data).map((b) => mapBook(b) as unknown as TBook);
}

/** Lấy danh mục cấp 1. */
export async function getCategories<TCategory>(): Promise<TCategory[]> {
  // Endpoint danh mục public.
  const data = await httpRequest<ListResponse<TCategory>>('/categories');
  return unwrapList(data);
}

/** Lấy danh mục chi tiết để render mega menu. */
export async function getDetailedCategories<TDetailedCategory>(): Promise<TDetailedCategory[]> {
  // Endpoint danh mục chi tiết (bao gồm nhóm con).
  const data = await httpRequest<ListResponse<TDetailedCategory>>('/categories/detailed');
  return unwrapList(data);
}

/** Một cuốn sách mới nhất từ API (tồn kho đúng với DB). */
export async function fetchBookById(id: string): Promise<Book> {
  // Endpoint chi tiết 1 sách theo id.
  const raw = await httpRequest<RawBook>(`/books/${encodeURIComponent(id)}`);
  // Chuẩn hóa dữ liệu detail về model Book frontend.
  return mapBook(raw);
}
