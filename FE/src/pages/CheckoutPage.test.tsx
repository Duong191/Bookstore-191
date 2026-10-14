import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CheckoutPage from './CheckoutPage';
const mockAddOrder = jest.fn();
const mockClearCart = jest.fn();
const mockToast = jest.fn();
const mockNavigate = jest.fn();
const mockDedupe = jest.fn();
// CRA/Jest cũ không resolve exports của router v7; mock navigation thay vì load router.
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../context/BookstoreContext', () => ({ useBookstore: () => ({
  getCartItems: () => [{ bookId: '12', quantity: 1, price: 100, total: 100 }],
  addOrder: mockAddOrder, clearCartStorage: mockClearCart, showToast: mockToast, dedupeCartLines: mockDedupe,
  currentUser: { id: '1', name: 'Test', phone: '0900000000', email: 'test@example.com' }
}) }));
beforeEach(() => jest.clearAllMocks());

test('chặn bấm lặp khi đang đặt; chỉ xóa giỏ và chuyển trang sau thành công', async () => {
  let finish!: () => void;
  mockAddOrder.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  const { container } = render(<CheckoutPage />);
  const form = container.querySelector('form')!;
  fireEvent.submit(form);
  expect(screen.getByRole('button', { name: 'Đang đặt hàng...' })).toBeDisabled();
  fireEvent.submit(form);
  expect(mockAddOrder).toHaveBeenCalledTimes(1);
  expect(mockClearCart).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(mockClearCart).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('/orders');
});

test('lỗi API giữ nguyên giỏ, hiển thị message và mở lại nút đặt hàng', async () => {
  mockAddOrder.mockRejectedValueOnce(new Error('Giỏ hàng có sách từ dữ liệu dự phòng'));
  const { container } = render(<CheckoutPage />);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Giỏ hàng có sách từ dữ liệu dự phòng', 'error'));
  expect(mockClearCart).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Đặt hàng' })).toBeEnabled();
});
