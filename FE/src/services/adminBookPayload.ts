/** Giữ đủ dữ liệu form khi gửi BE; không lấy dữ liệu form để giả lập kết quả đã lưu. */
export function buildAdminBookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ['title', 'author', 'publisher', 'description', 'language', 'format', 'featured', 'trending', 'isNew','isActive']) {
    if (payload[key] !== undefined) result[key] = payload[key];
  }
  for (const key of ['price', 'discount', 'stock', 'pages', 'rating', 'importPrice']) {
    if (payload[key] !== undefined) result[key] = payload[key] === null || payload[key] === '' ? null : Number(payload[key]);
  }
  const category = payload.categoryId ?? payload.category;
  if (category !== undefined) result.categoryId = Number(category);
  if (payload.isbn !== undefined) result.isbn = String(payload.isbn ?? '').trim() || null;
  const date = payload.publishDate !== undefined ? payload.publishDate : payload.publishYear;
  if (date !== undefined) result.publishDate = date === null || date === '' ? null : /^\d{4}$/.test(String(date)) ? `${date}-01-01` : String(date);
  const bestseller = payload.bestseller ?? payload.bestSeller;
  if (bestseller !== undefined) result.bestseller = bestseller;
  const reviewCount = payload.reviewCount ?? payload.reviews;
  if (reviewCount !== undefined) result.reviewCount = Number(reviewCount);
  const soldCount = payload.soldCount ?? payload.salesCount;
  if (soldCount !== undefined) result.soldCount = Number(soldCount);
  for (const key of ['images', 'tags']) {
    if (Array.isArray(payload[key])) result[key] = Array.from(new Set((payload[key] as unknown[]).map((value) => String(value).trim()).filter(Boolean)));
  }
  if (!Array.isArray(payload.images) && payload.image !== undefined) result.image = String(payload.image ?? '').trim();
  return result;
}
