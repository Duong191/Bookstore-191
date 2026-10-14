/**
 * File này chứa các hàm gọi API liên quan đến giỏ hàng.
 * Không xử lý UI, chỉ gửi request và trả về danh sách cart item theo chuẩn frontend.
 */
import { httpRequest } from './httpClient';
import type { CartItemWithDetails } from '../types/bookstore.types';

// Response giỏ hàng từ backend.
interface CartResponse {
  items: CartItemWithDetails[];
}

/** BE có thể trả array snake_case; chuẩn hóa ID trước khi hydrate giỏ vào context. */
function mapCartResponse(payload: CartResponse | Array<Record<string, unknown>>): CartItemWithDetails[] {
  const rows = Array.isArray(payload) ? payload : payload.items || [];
  return rows.map((item) => {
    const row = item as unknown as Record<string, unknown>;
    return { ...row, bookId: String(row.bookId ?? row.book_id ?? ''), quantity: Number(row.quantity),
      addedAt: String(row.addedAt ?? row.added_at ?? ''), total: Number(row.total ?? row.line_total ?? 0),
      price: Number(row.price ?? 0) } as unknown as CartItemWithDetails;
  });
}

// Payload cập nhật giỏ hàng: backend nhận mảng dòng sách + số lượng.
interface CartPayload {
  items: Array<{
    bookId: number;
    quantity: number;
  }>;
}

// Tùy chọn gọi API cart: user token hoặc guest session.
interface CartRequestOptions {
  token?: string;
  guestSessionId?: string;
}

/** Gắn header guest session khi chưa đăng nhập. */
function buildHeaders(guestSessionId?: string): Record<string, string> {
  return guestSessionId ? { 'X-Guest-Session': guestSessionId } : {};
}

/** Lấy giỏ hàng hiện tại (user hoặc guest). */
export async function getCartRequest(options: CartRequestOptions = {}): Promise<CartItemWithDetails[]> {
  const data = await httpRequest<CartResponse | Array<Record<string, unknown>>>('/cart', {
    token: options.token,
    headers: buildHeaders(options.guestSessionId),
  });
  return mapCartResponse(data);
}

/**
 * Ghi đè toàn bộ giỏ hàng theo payload mới.
 * Dùng cho đồng bộ quantity/remove phía frontend sau khi người dùng thao tác.
 */
export async function updateCartRequest(payload: CartPayload, options: CartRequestOptions = {}): Promise<CartItemWithDetails[]> {
  // JSON.stringify(NaN) thành null: chặn trước khi tạo request để người dùng biết cách sửa giỏ cũ.
  if (payload.items.some((item) => !Number.isSafeInteger(item.bookId) || item.bookId <= 0)) {
    throw new Error('Giỏ hàng có sách từ dữ liệu dự phòng. Vui lòng xóa sách cũ khỏi giỏ và chọn lại từ cửa hàng.');
  }
  if (payload.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
    throw new Error('Số lượng sách trong giỏ phải là số nguyên lớn hơn 0.');
  }
  const data = await httpRequest<CartResponse | Array<Record<string, unknown>>>('/cart', {
    method: 'PUT',
    token: options.token,
    headers: buildHeaders(options.guestSessionId),
    body: JSON.stringify(payload),
  });
  return mapCartResponse(data);
}
