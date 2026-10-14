import { Navigate, useLocation } from 'react-router-dom';
import { useBookstore } from '../../context/BookstoreContext';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function RequireAuth({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useBookstore();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="container app-loading-state">
        <div className="app-spinner" />
        <p>Đang tải dữ liệu phiên đăng nhập...</p>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useBookstore();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="container app-loading-state">
        <div className="app-spinner" />
        <p>Đang tải dữ liệu quyền truy cập...</p>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (currentUser.role !== 'admin' && currentUser.role !== 'staff') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Chỉ ADMIN; nhóm trang admin hiện có vẫn cho STAFF truy cập như trước. */
export function RequireAccountAdmin({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useBookstore();
  const loc = useLocation();
  if (loading) return <div className="container app-loading-state">Đang kiểm tra quyền quản lý tài khoản...</div>;
  if (!currentUser) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (currentUser.role !== 'admin') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}
