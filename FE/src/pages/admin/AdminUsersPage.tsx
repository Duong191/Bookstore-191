/** Màn hình quản lý tài khoản; API và trạng thái tải/thao tác nằm trong useAdminUsers. */
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAuth } from '../../hooks/useAuth';
import { useBookstore } from '../../context/BookstoreContext';
import type { AccountRole, AdminUser } from '../../types/bookstore.types';
import './AdminUsersPage.css';

const roleLabels: Record<AccountRole, string> = { admin: 'ADMIN', staff: 'STAFF', user: 'USER' };
const messageOf = (err: unknown) => err instanceof Error ? err.message : 'Không thể xử lý tài khoản';
type DialogState = { type: 'create' } | { type: 'edit' | 'role'; user: AdminUser } | null;

/** Dialog có focus trap, đóng bằng Escape và trả focus về nút mở. */
function AccountDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(container.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') || []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        else if (!items.length) { event.preventDefault(); container.current?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return <div className="admin-users-overlay" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <div ref={container} className="admin-users-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" tabIndex={-1}>
      <div className="admin-users-dialog-header">
        <h2 id="account-dialog-title">{title}</h2>
        <button type="button" className="admin-users-close" aria-label="Đóng biểu mẫu" disabled={busy} onClick={onClose}>×</button>
      </div>
      {children}
    </div>
  </div>;
}

export default function AdminUsersPage() {
  const { currentUser } = useAuth();
  const { showToast } = useBookstore();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState<AccountRole | ''>('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formError, setFormError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [roleChoice, setRoleChoice] = useState<AccountRole>('user');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '',
    role: 'user' as AccountRole, isActive: true, gender: '', birthDate: '', avatarUrl: '' });
  const limit = 20;
  const accounts = useAdminUsers({ search: debouncedSearch || undefined, role: role || undefined,
    isActive: status === '' ? undefined : status === 'active', page, limit });
  const pages = Math.max(1, Math.ceil(accounts.total / limit));
  const busy = accounts.busy || detailLoading;

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    if (!accounts.loading && !accounts.error && page > pages) setPage(pages);
  }, [accounts.loading, accounts.error, page, pages]);

  const openCreate = () => {
    setForm({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'user',
      isActive: true, gender: '', birthDate: '', avatarUrl: '' });
    setFormError('');
    setDialog({ type: 'create' });
  };
  const openEdit = async (user: AdminUser) => {
    setDetailLoading(true);
    try {
      const item = await accounts.getDetail(user.id);
      setForm({ firstName: item.firstName, lastName: item.lastName, email: item.email, phone: item.phone,
        password: '', role: item.role, isActive: item.isActive, gender: item.gender || '',
        birthDate: item.birthDate || '', avatarUrl: item.avatarUrl || '' });
      setFormError('');
      setDialog({ type: 'edit', user: item });
    } catch (err) { showToast(messageOf(err), 'error'); }
    finally { setDetailLoading(false); }
  };
  const openRole = (user: AdminUser) => { setRoleChoice(user.role); setFormError(''); setDialog({ type: 'role', user }); };
  const closeDialog = () => { setDialog(null); setForm((prev) => ({ ...prev, password: '' })); setFormError(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || busy) return;
    setFormError('');
    try {
      if (dialog.type === 'role') await accounts.changeRole(dialog.user.id, roleChoice);
      else if (dialog.type === 'create') await accounts.createUser({ email: form.email.trim(), password: form.password,
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(),
        role: form.role, isActive: form.isActive });
      else await accounts.updateUser(dialog.user.id, { firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        phone: form.phone.trim(), gender: form.gender.trim() || null, birthDate: form.birthDate || null,
        avatarUrl: form.avatarUrl.trim() || null, isActive: form.isActive });
      closeDialog();
    } catch (err) { setFormError(messageOf(err)); }
  };
  const changeStatus = async (user: AdminUser) => {
    const action = user.isActive ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Bạn muốn ${action} tài khoản ${user.email}?`)) return;
    try { await accounts.changeStatus(user.id, !user.isActive); } catch (err) { showToast(messageOf(err), 'error'); }
  };
  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Xóa tài khoản ${user.email}? Tài khoản sẽ không thể đăng nhập. Đơn hàng cũ được giữ lại.`)) return;
    try { await accounts.deleteUser(user.id); } catch (err) { showToast(messageOf(err), 'error'); }
  };

  return <section className="admin-users-page" aria-labelledby="admin-users-title">
    <div className="admin-users-heading">
      <div><h2 id="admin-users-title">Quản lý tài khoản</h2><p>Quản lý thông tin, quyền truy cập và trạng thái tài khoản.</p></div>
      <button type="button" className="btn-admin btn-admin-primary" disabled={busy} onClick={openCreate}>
        <i className="fas fa-plus" aria-hidden="true" /> Thêm tài khoản
      </button>
    </div>
    <div className="admin-users-filters">
      <label className="admin-users-search">Tìm tài khoản
        <input type="search" placeholder="Email, họ tên hoặc số điện thoại..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <label>Quyền
        <select value={role} onChange={(event) => { setRole(event.target.value as AccountRole | ''); setPage(1); }}>
          <option value="">Tất cả quyền</option><option value="user">USER</option><option value="staff">STAFF</option><option value="admin">ADMIN</option>
        </select>
      </label>
      <label>Trạng thái
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option>
        </select>
      </label>
      <button type="button" className="btn-admin btn-admin-secondary" onClick={accounts.reload} disabled={accounts.loading || busy}>Làm mới</button>
    </div>
    {accounts.error && <div className="admin-users-error" role="alert">{accounts.error}</div>}
    <div className="admin-table-wrapper">
      <div className="admin-table-header"><h3>Danh sách tài khoản ({accounts.total})</h3></div>
      <div className="admin-users-table-scroll">
        <table className="admin-table"><thead><tr>
          <th>ID</th><th>Họ tên</th><th>Email</th><th>Số điện thoại</th><th>Role</th><th>Trạng thái</th><th>Ngày tạo</th><th>Hành động</th>
        </tr></thead><tbody>
          {accounts.loading ? <tr><td colSpan={8} className="admin-users-empty" role="status">Đang tải tài khoản...</td></tr>
            : accounts.users.length === 0 ? <tr><td colSpan={8} className="admin-users-empty">{accounts.error ? 'Chưa tải được dữ liệu.' : 'Không tìm thấy tài khoản phù hợp.'}</td></tr>
            : accounts.users.map((user) => <tr key={user.id}>
              <td>#{user.id}</td><td>{user.name || '—'}{user.id === currentUser?.id && <small className="admin-users-self">Bạn</small>}</td>
              <td>{user.email}</td><td>{user.phone || '—'}</td>
              <td><span className={`admin-users-badge role-${user.role}`}>{roleLabels[user.role]}</span></td>
              <td><span className={`admin-users-badge ${user.isActive ? 'status-active' : 'status-inactive'}`}>{user.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
              <td className="admin-users-date">{new Date(user.createdAt).toLocaleDateString('vi-VN')}</td>
              <td><div className="admin-users-actions">
                <button type="button" className="btn-admin btn-admin-primary" disabled={busy} onClick={() => openEdit(user)}>Sửa</button>
                <button type="button" className="btn-admin btn-admin-secondary" disabled={busy} onClick={() => openRole(user)}>Đổi quyền</button>
                <button type="button" className={`btn-admin ${user.isActive ? 'btn-admin-warning' : 'btn-admin-success'}`} disabled={busy} onClick={() => changeStatus(user)}>{user.isActive ? 'Khóa' : 'Mở khóa'}</button>
                <button type="button" className="btn-admin btn-admin-danger" disabled={busy || user.id === currentUser?.id}
                  title={user.id === currentUser?.id ? 'Không thể xóa chính mình' : 'Xóa mềm tài khoản'} onClick={() => deleteUser(user)}>Xóa</button>
              </div></td>
            </tr>)}
        </tbody></table>
      </div>
      <nav className="admin-users-pagination" aria-label="Phân trang tài khoản">
        <span>Trang {page} / {pages} · {accounts.total} tài khoản</span>
        <div><button type="button" className="btn-admin btn-admin-secondary" disabled={page <= 1 || accounts.loading || busy} onClick={() => setPage((value) => value - 1)}>Trước</button>
          <button type="button" className="btn-admin btn-admin-secondary" disabled={page >= pages || accounts.loading || busy} onClick={() => setPage((value) => value + 1)}>Sau</button></div>
      </nav>
    </div>
    {dialog && <AccountDialog title={dialog.type === 'create' ? 'Thêm tài khoản' : dialog.type === 'edit' ? 'Sửa tài khoản' : 'Đổi quyền tài khoản'} busy={accounts.busy} onClose={closeDialog}>
      <form onSubmit={submit}>
        <fieldset disabled={accounts.busy} className="admin-users-form-fields">
          {dialog.type === 'role' ? <>
            <p className="admin-users-target">{dialog.user.name} · {dialog.user.email}</p>
            <label>Quyền mới<select value={roleChoice} onChange={(event) => setRoleChoice(event.target.value as AccountRole)}>
              <option value="user">USER</option><option value="staff">STAFF</option><option value="admin">ADMIN</option>
            </select></label>
            <p className="admin-users-hint">Quyền mới được kiểm tra ở lần gọi API tiếp theo. Hệ thống bảo vệ ADMIN đang hoạt động cuối cùng.</p>
          </> : <div className="admin-users-form-grid">
            <label>Họ<input required maxLength={100} autoComplete="family-name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
            <label>Tên<input required maxLength={100} autoComplete="given-name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
            <label className="admin-users-full">Email<input type="email" required maxLength={255} autoComplete="off" disabled={dialog.type === 'edit'} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Số điện thoại<input type="tel" maxLength={20} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            {dialog.type === 'create' && <label>Mật khẩu<input type="password" required minLength={6} maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
            <label>Role<select value={form.role} disabled={dialog.type === 'edit'} onChange={(event) => setForm({ ...form, role: event.target.value as AccountRole })}>
              <option value="user">USER</option><option value="staff">STAFF</option><option value="admin">ADMIN</option>
            </select>{dialog.type === 'edit' && <small>Dùng “Đổi quyền” để thay đổi role.</small>}</label>
            <label>Trạng thái<select value={form.isActive ? 'active' : 'inactive'} onChange={(event) => setForm({ ...form, isActive: event.target.value === 'active' })}>
              <option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option>
            </select></label>
            {dialog.type === 'edit' && <>
              <label>Giới tính<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
                <option value="">Chưa cung cấp</option><option value="Nam">Nam</option><option value="Nữ">Nữ</option><option value="Khác">Khác</option>
              </select></label>
              <label>Ngày sinh<input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></label>
              <label className="admin-users-full">Đường dẫn ảnh đại diện<input maxLength={500} value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} /></label>
            </>}
          </div>}
        </fieldset>
        {formError && <div className="admin-users-error" role="alert">{formError}</div>}
        <div className="admin-users-dialog-footer">
          <button type="button" className="btn-admin btn-admin-secondary" disabled={accounts.busy} onClick={closeDialog}>Hủy</button>
          <button type="submit" className="btn-admin btn-admin-primary" disabled={accounts.busy}>{accounts.busy ? 'Đang lưu...' : dialog.type === 'role' ? 'Lưu quyền' : 'Lưu tài khoản'}</button>
        </div>
      </form>
    </AccountDialog>}
  </section>;
}
