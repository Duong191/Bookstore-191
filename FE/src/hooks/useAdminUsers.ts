/** Tách tải dữ liệu và thao tác tài khoản khỏi page; bỏ qua response cũ khi đổi bộ lọc. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useBookstore } from '../context/BookstoreContext';
import { createAdminUserRequest, deleteAdminUserRequest, getAdminUserDetailRequest, getAdminUsersRequest,
  updateAdminUserRequest, updateAdminUserRoleRequest, updateAdminUserStatusRequest } from '../api/usersApi';
import type { AdminUsersParams, CreateAdminUserPayload, UpdateAdminUserPayload } from '../api/usersApi';
import type { AccountRole, AdminUser } from '../types/bookstore.types';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Không thể xử lý tài khoản';
const getToken = () => {
  const token = localStorage.getItem('bookstoreAccessToken');
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn');
  return token;
};

export function useAdminUsers(params: AdminUsersParams) {
  const { currentUser, logout } = useAuth();
  const { showToast, persist } = useBookstore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const requestVersion = useRef(0);
  const actionRunning = useRef(false);
  const { search, role, isActive, page, limit } = params;
  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  useEffect(() => {
    const version = ++requestVersion.current;
    let cancelled = false;
    setLoading(true);
    setError('');
    setUsers([]);
    if (currentUser?.role !== 'admin') {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const result = await getAdminUsersRequest(getToken(), { search, role, isActive, page, limit });
        if (!cancelled && requestVersion.current === version) {
          setUsers(result.items);
          setTotal(result.meta.total);
        }
      } catch (err) {
        if (!cancelled && requestVersion.current === version) setError(errorMessage(err));
      } finally {
        if (!cancelled && requestVersion.current === version) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search, role, isActive, page, limit, refresh, currentUser?.id, currentUser?.role]);

  const runAction = useCallback(async <T,>(action: () => Promise<T>, message: string): Promise<T> => {
    if (actionRunning.current) throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất');
    actionRunning.current = true;
    setBusy(true);
    try {
      const result = await action();
      showToast(message, 'success');
      reload();
      return result;
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }, [reload, showToast]);

  const syncOwnAccess = useCallback((user: AdminUser) => {
    if (user.id === currentUser?.id && (!user.isActive || user.role !== 'admin')) {
      logout();
      showToast('Quyền tài khoản đã thay đổi. Vui lòng đăng nhập lại.', 'info');
    } else if (user.id === currentUser?.id) {
      // Đồng bộ hồ sơ chính mình để header/profile không giữ tên/ảnh cũ sau khi sửa.
      const [year = '', month = '', day = ''] = user.birthDate?.split('-') || [];
      persist((previous) => ({ ...previous, users: previous.users.map((item) => item.id === user.id ? {
        ...item, name: user.name, firstName: user.firstName, lastName: user.lastName, phone: user.phone,
        gender: user.gender || '', birthday: { year, month, day }, avatar: user.avatarUrl || '',
        isActive: user.isActive, role: user.role, updatedAt: user.updatedAt
      } : item) }));
    }
    return user;
  }, [currentUser?.id, logout, showToast, persist]);

  return {
    users, total, loading, busy, error, reload,
    getDetail: (id: string) => getAdminUserDetailRequest(getToken(), id),
    createUser: (payload: CreateAdminUserPayload) => runAction(() => createAdminUserRequest(getToken(), payload), 'Đã thêm tài khoản'),
    updateUser: async (id: string, payload: UpdateAdminUserPayload) => syncOwnAccess(await runAction(
      () => updateAdminUserRequest(getToken(), id, payload), 'Đã cập nhật tài khoản')),
    changeRole: async (id: string, nextRole: AccountRole) => syncOwnAccess(await runAction(
      () => updateAdminUserRoleRequest(getToken(), id, nextRole), 'Đã đổi quyền tài khoản')),
    changeStatus: async (id: string, active: boolean) => syncOwnAccess(await runAction(
      () => updateAdminUserStatusRequest(getToken(), id, active), active ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản')),
    deleteUser: (id: string) => runAction(() => deleteAdminUserRequest(getToken(), id), 'Đã xóa tài khoản')
  };
}
