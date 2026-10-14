import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminUsersPage from './AdminUsersPage';
import type { AdminUser } from '../../types/bookstore.types';

const mockToast = jest.fn();
const account: AdminUser = { id: '2', email: 'user@example.com', name: 'Nguyễn An', firstName: 'Nguyễn', lastName: 'An',
  phone: '0900000000', role: 'user', isActive: true, gender: null, birthDate: null, avatarUrl: null,
  createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' };
const ownAccount: AdminUser = { ...account, id: '1', email: 'admin@example.com', role: 'admin' };
const mockAccounts = {
  users: [ownAccount, account], total: 2, loading: false, busy: false, error: '',
  reload: jest.fn(), getDetail: jest.fn(), createUser: jest.fn(), updateUser: jest.fn(), changeRole: jest.fn(),
  changeStatus: jest.fn(), deleteUser: jest.fn()
};
jest.mock('../../hooks/useAdminUsers', () => ({ useAdminUsers: () => mockAccounts }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ currentUser: { id: '1', role: 'admin' } }) }));
jest.mock('../../context/BookstoreContext', () => ({ useBookstore: () => ({ showToast: mockToast }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts.getDetail.mockResolvedValue(account);
  mockAccounts.createUser.mockResolvedValue(account);
  mockAccounts.updateUser.mockResolvedValue(account);
  mockAccounts.changeRole.mockResolvedValue({ ...account, role: 'staff' });
  mockAccounts.changeStatus.mockResolvedValue({ ...account, isActive: false });
  mockAccounts.deleteUser.mockResolvedValue(undefined);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { jest.restoreAllMocks(); });

test('thêm tài khoản gửi đủ payload; không lưu password khi đóng form', async () => {
  render(<AdminUsersPage />);
  fireEvent.click(screen.getByRole('button', { name: /Thêm tài khoản/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Họ'), { target: { value: 'Trần' } });
  fireEvent.change(within(dialog).getByLabelText('Tên'), { target: { value: 'Bình' } });
  fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.change(within(dialog).getByLabelText('Mật khẩu'), { target: { value: 'NewPassword123' } });
  fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'staff' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu tài khoản' }));
  await waitFor(() => expect(mockAccounts.createUser).toHaveBeenCalledWith({ email: 'new@example.com', password: 'NewPassword123',
    firstName: 'Trần', lastName: 'Bình', phone: '', role: 'staff', isActive: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Thêm tài khoản/ }));
  expect(screen.getByLabelText('Mật khẩu')).toHaveValue('');
});

test('sửa lấy chi tiết mới từ BE; không gửi email/role/password qua PATCH hồ sơ', async () => {
  render(<AdminUsersPage />);
  const row = screen.getByText('user@example.com').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Sửa' }));
  const dialog = await screen.findByRole('dialog');
  expect(mockAccounts.getDetail).toHaveBeenCalledWith('2');
  expect(within(dialog).getByLabelText('Email')).toBeDisabled();
  expect(within(dialog).queryByLabelText('Mật khẩu')).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Tên'), { target: { value: 'An mới' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu tài khoản' }));
  await waitFor(() => expect(mockAccounts.updateUser).toHaveBeenCalledWith('2', {
    firstName: 'Nguyễn', lastName: 'An mới', phone: '0900000000', gender: null, birthDate: null, avatarUrl: null, isActive: true
  }));
});

test('đổi quyền riêng và hiển thị lỗi admin cuối cùng, không đóng form khi lỗi', async () => {
  mockAccounts.changeRole.mockRejectedValueOnce(new Error('Không thể hạ quyền ADMIN cuối cùng'));
  render(<AdminUsersPage />);
  fireEvent.click(within(screen.getByText('admin@example.com').closest('tr')!).getByRole('button', { name: 'Đổi quyền' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Quyền mới'), { target: { value: 'user' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu quyền' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ADMIN cuối cùng');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(mockAccounts.changeRole).toHaveBeenCalledWith('1', 'user');
});

test('khóa/xóa có xác nhận; không cho xóa tài khoản đang đăng nhập', async () => {
  render(<AdminUsersPage />);
  expect(within(screen.getByText('admin@example.com').closest('tr')!).getByRole('button', { name: 'Xóa' })).toBeDisabled();
  const row = screen.getByText('user@example.com').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Khóa' }));
  await waitFor(() => expect(mockAccounts.changeStatus).toHaveBeenCalledWith('2', false));
  fireEvent.click(within(row).getByRole('button', { name: 'Xóa' }));
  await waitFor(() => expect(mockAccounts.deleteUser).toHaveBeenCalledWith('2'));
  expect(window.confirm).toHaveBeenCalledTimes(2);
});

test('hủy xác nhận không gọi API, Escape đóng modal', () => {
  (window.confirm as jest.Mock).mockReturnValue(false);
  render(<AdminUsersPage />);
  fireEvent.click(within(screen.getByText('user@example.com').closest('tr')!).getByRole('button', { name: 'Khóa' }));
  expect(mockAccounts.changeStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Thêm tài khoản/ }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
