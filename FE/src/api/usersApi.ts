/** API quản lý tài khoản; sử dụng HTTP client/token hiện có của project. */
import { httpRequest } from './httpClient';
import type { AccountRole, AdminUser } from '../types/bookstore.types';

export interface AdminUsersParams {
  search?: string;
  role?: AccountRole;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
export interface AdminUsersResponse {
  items: AdminUser[];
  meta: { page: number; limit: number; total: number };
}
export interface CreateAdminUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: AccountRole;
  isActive: boolean;
}
export type UpdateAdminUserPayload = Partial<Pick<AdminUser,
  'firstName' | 'lastName' | 'phone' | 'gender' | 'birthDate' | 'avatarUrl' | 'isActive'>>;

const accountPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;
export function getAdminUsersRequest(token: string, params: AdminUsersParams = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return httpRequest<AdminUsersResponse>(`/admin/users?${query}`, { token });
}
export async function getAdminUserDetailRequest(token: string, id: string) {
  return (await httpRequest<{ item: AdminUser }>(accountPath(id), { token })).item;
}
export async function createAdminUserRequest(token: string, payload: CreateAdminUserPayload) {
  return (await httpRequest<{ item: AdminUser }>('/admin/users', { token, method: 'POST', body: JSON.stringify(payload) })).item;
}
export async function updateAdminUserRequest(token: string, id: string, payload: UpdateAdminUserPayload) {
  return (await httpRequest<{ item: AdminUser }>(accountPath(id), { token, method: 'PATCH', body: JSON.stringify(payload) })).item;
}
export async function updateAdminUserRoleRequest(token: string, id: string, role: AccountRole) {
  return (await httpRequest<{ item: AdminUser }>(`${accountPath(id)}/role`, { token, method: 'PATCH', body: JSON.stringify({ role }) })).item;
}
export async function updateAdminUserStatusRequest(token: string, id: string, isActive: boolean) {
  return (await httpRequest<{ item: AdminUser }>(`${accountPath(id)}/status`, { token, method: 'PATCH', body: JSON.stringify({ isActive }) })).item;
}
export function deleteAdminUserRequest(token: string, id: string) {
  return httpRequest<void>(accountPath(id), { token, method: 'DELETE' });
}
