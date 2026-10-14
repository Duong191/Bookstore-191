import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminBookEditPage from './AdminBookEditPage';
import { fetchBookById } from '../../api/publicApi';
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockToast = jest.fn();
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useNavigate: () => mockNavigate,
  NavLink: ({ children }: { children: unknown }) => children }), { virtual: true });
jest.mock('../../api/publicApi', () => ({ fetchBookById: jest.fn() }));
jest.mock('../../context/BookstoreContext', () => ({ useBookstore: () => ({ updateBook: mockUpdate,
  addBook: mockAdd, showToast: mockToast, data: { books: [], categories: [{ id: '1', name: 'Sách' }] } }) }));
const book = { id: '7', title: 'Book', author: 'Author', publisher: 'Publisher', categoryId: '1', price: 100,
  discount: 0, stock: 2, description: '', image: '/a.jpg', images: ['/a.jpg', '/b.jpg'], tags: ['Tag A', 'Tag B'],
  pages: 321, language: 'Tiếng Việt', format: 'Hardcover', rating: 0, supportsFormat: true, supportsTrending: false };
beforeEach(() => {
  jest.clearAllMocks();
  (fetchBookById as jest.Mock).mockResolvedValue(book);
  mockUpdate.mockResolvedValue(book);
});

test('form đọc detail thật, giữ nhiều ảnh/tags/pages; lưu đủ dữ liệu rồi mới chuyển trang', async () => {
  const { container } = render(<AdminBookEditPage />);
  expect(await screen.findByDisplayValue('/a.jpg, /b.jpg')).toBeInTheDocument();
  expect(fetchBookById).toHaveBeenCalledWith('7');
  expect(screen.getByDisplayValue('Tag A, Tag B')).toBeInTheDocument();
  fireEvent.change(screen.getByDisplayValue('321'), { target: { value: '543' } });
  fireEvent.change(screen.getByDisplayValue('/a.jpg, /b.jpg'), { target: { value: '/new1.jpg, /new2.jpg' } });
  fireEvent.change(screen.getByDisplayValue('Tag A, Tag B'), { target: { value: 'Tag C, Tag D' } });
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('7', expect.objectContaining({ pages: 543,
    images: ['/new1.jpg', '/new2.jpg'], tags: ['Tag C', 'Tag D'], format: 'Hardcover', rating: 0 })));
  expect(mockToast).toHaveBeenCalledWith('Đã cập nhật sách', 'success');
  expect(mockNavigate).toHaveBeenCalledWith('/admin/books');
});

test('Backend thất bại: giữ form, báo lỗi và không chuyển trang/báo thành công', async () => {
  mockUpdate.mockRejectedValueOnce(new Error('Không thể lưu tags'));
  const { container } = render(<AdminBookEditPage />);
  await screen.findByDisplayValue('321');
  fireEvent.change(screen.getByDisplayValue('321'), { target: { value: '543' } });
  fireEvent.submit(container.querySelector('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể lưu tags');
  expect(screen.getByDisplayValue('543')).toBeInTheDocument();
  expect(mockToast).toHaveBeenCalledWith('Không thể lưu tags', 'error');
  expect(mockToast).not.toHaveBeenCalledWith('Đã cập nhật sách', 'success');
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Lưu/ })).toBeEnabled();
});
