import { getCartRequest, updateCartRequest } from './cartApi';
import { httpRequest } from './httpClient';
jest.mock('./httpClient', () => ({ httpRequest: jest.fn() }));
const request = httpRequest as jest.Mock;
beforeEach(() => jest.clearAllMocks());

test('ISBN fallback thành NaN/null: từ chối trước khi gửi HTTP, có thông báo xử lý giỏ cũ', async () => {
  const bookId = Number('978-604-2-12345-6');
  expect(JSON.stringify({ bookId })).toBe('{"bookId":null}');
  await expect(updateCartRequest({ items: [{ bookId, quantity: 1 }] }, { token: 't' })).rejects.toThrow('dữ liệu dự phòng');
  expect(request).not.toHaveBeenCalled();
});
test('array snake_case của BE được hydrate thành ID string hợp lệ', async () => {
  request.mockResolvedValueOnce([{ book_id: 12, quantity: 2, price: 100, discount: 10, line_total: 180, added_at: '2026-10-14' }]);
  const items = await getCartRequest({ token: 't' });
  expect(items[0]).toMatchObject({ bookId: '12', quantity: 2, total: 180, addedAt: '2026-10-14' });
  expect(Number(items[0].bookId)).toBe(12);
});
test('hỗ trợ wrapper cũ và xóa toàn giỏ bằng mảng rỗng', async () => {
  request.mockResolvedValueOnce({ items: [{ bookId: '3', quantity: 1, total: 20 }] });
  expect((await getCartRequest())[0].bookId).toBe('3');
  request.mockResolvedValueOnce([]);
  expect(await updateCartRequest({ items: [] }, { token: 't' })).toEqual([]);
  expect(request).toHaveBeenLastCalledWith('/cart', expect.objectContaining({ method: 'PUT', body: '{"items":[]}' }));
});
test('số lượng null/NaN/0 không được gửi', async () => {
  await expect(updateCartRequest({ items: [{ bookId: 1, quantity: NaN }] })).rejects.toThrow('Số lượng');
  await expect(updateCartRequest({ items: [{ bookId: 1, quantity: 0 }] })).rejects.toThrow('Số lượng');
  expect(request).not.toHaveBeenCalled();
});
