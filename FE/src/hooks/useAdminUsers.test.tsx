import { act, renderHook, waitFor } from '@testing-library/react';
import { useAdminUsers } from './useAdminUsers';
import * as api from '../api/usersApi';
import type { AdminUser } from '../types/bookstore.types';

const mockLogout = jest.fn();
const mockToast = jest.fn();
const mockPersist = jest.fn();
jest.mock('./useAuth', () => ({ useAuth: () => ({ currentUser: { id: '1', role: 'admin' }, logout: mockLogout }) }));
jest.mock('../context/BookstoreContext', () => ({ useBookstore: () => ({ showToast: mockToast, persist: mockPersist }) }));
jest.mock('../api/usersApi');
const listRequest = api.getAdminUsersRequest as jest.Mock;
const updateRequest = api.updateAdminUserRequest as jest.Mock;
const roleRequest = api.updateAdminUserRoleRequest as jest.Mock;
const user: AdminUser = { id: '1', name: 'New Admin', firstName: 'New', lastName: 'Admin', email: 'a@example.com',
  phone: '', gender: null, birthDate: '2000-01-02', avatarUrl: '/new-avatar.png', role: 'admin', isActive: true,
  createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T01:00:00Z' };
const payload = (items: AdminUser[]) => ({ items, meta: { page: 1, limit: 20, total: items.length } });
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('bookstoreAccessToken', 'test-token');
  listRequest.mockResolvedValue(payload([user]));
});
afterEach(() => localStorage.clear());

test('response cũ không ghi đè danh sách khi người dùng đổi trang', async () => {
  let finishFirst!: (value: ReturnType<typeof payload>) => void;
  const newer = { ...user, id: '2', name: 'Second page' };
  listRequest.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
    .mockResolvedValueOnce(payload([newer]));
  const { result, rerender } = renderHook(({ page }) => useAdminUsers({ page, limit: 20 }), { initialProps: { page: 1 } });
  rerender({ page: 2 });
  await waitFor(() => expect(result.current.users[0]?.id).toBe('2'));
  await act(async () => { finishFirst(payload([user])); });
  expect(result.current.users[0]?.id).toBe('2');
});

test('sửa chính mình đồng bộ header/profile và tải lại danh sách', async () => {
  updateRequest.mockResolvedValue(user);
  const { result } = renderHook(() => useAdminUsers({ page: 1, limit: 20 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.updateUser('1', { firstName: 'New' }); });
  expect(mockLogout).not.toHaveBeenCalled();
  const updated = mockPersist.mock.calls[0][0]({ users: [{ id: '1', name: 'Old Admin' }] });
  expect(updated.users[0].name).toBe('New Admin');
  expect(updated.users[0].avatar).toBe('/new-avatar.png');
  expect(updated.users[0].birthday).toEqual({ year: '2000', month: '01', day: '02' });
  await waitFor(() => expect(listRequest).toHaveBeenCalledTimes(2));
});

test('tự hạ quyền đăng xuất; lỗi API không báo thành công', async () => {
  roleRequest.mockRejectedValueOnce(new Error('ADMIN cuối cùng')).mockResolvedValueOnce({ ...user, role: 'staff' });
  const { result } = renderHook(() => useAdminUsers({ page: 1, limit: 20 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await expect(result.current.changeRole('1', 'staff')).rejects.toThrow('ADMIN cuối cùng'); });
  expect(mockLogout).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  await act(async () => { await result.current.changeRole('1', 'staff'); });
  expect(mockLogout).toHaveBeenCalledTimes(1);
});
