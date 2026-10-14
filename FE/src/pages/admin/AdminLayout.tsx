import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useBookstore } from '../../context/BookstoreContext';
import { useEffect, useMemo, useState } from 'react';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, data, refreshBooksFromApi } = useBookstore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const pendingOrdersCount = useMemo(() => {
    return (data?.orders || []).filter(order => order.status === 'pending').length;
  }, [data?.orders]);

  const outOfStockBooks = useMemo(
    () => (data?.books || []).filter((b) => b && Number(b.stock) <= 0),
    [data?.books]
  );

  useEffect(() => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'staff') {
      refreshBooksFromApi();
    }
  }, [currentUser?.role, refreshBooksFromApi]);

  const handleLogout = () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      logout();
      navigate('/');
    }
  };

  const breadcrumbLabel = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/admin/dashboard')) return 'Dashboard';
    if (path.includes('/admin/books')) return 'Quản lý sách';
    if (path.includes('/admin/categories')) return 'Quản lý danh mục';
    if (path.includes('/admin/inventory')) return 'Quản lý kho';
    if (path.includes('/admin/users')) return 'Quản lý tài khoản';
    if (path.includes('/admin/orders')) return 'Quản lý đơn hàng';
    if (path.includes('/admin/blog')) return 'Quản lý blog';
    return 'Admin';
  }, [location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className={`admin-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="admin-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2>
            <img src="/icon/book.jpg" alt="Bookarazi Admin" className="logo-img" />
            <span>Bookarazi Admin</span>
          </h2>
        </div>
        <nav className="admin-sidebar-nav">
          <NavLink to="/admin/dashboard" className="admin-nav-item">
            <i className="fas fa-home"></i>
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/admin/books" className="admin-nav-item">
            <i className="fas fa-book"></i>
            <span>Quản lý Sách</span>
          </NavLink>
          {currentUser?.role==='admin'&&<NavLink to="/admin/categories" className="admin-nav-item"><i className="fas fa-folder-tree"/><span>Quản lý danh mục</span></NavLink>}
          <NavLink to="/admin/inventory" className="admin-nav-item">
            <i className="fas fa-warehouse"></i>
            <span>Quản lý Kho</span>
          </NavLink>
          {currentUser?.role === 'admin' && (
            <NavLink to="/admin/users" className="admin-nav-item">
              <i className="fas fa-users"></i>
              <span>Quản lý tài khoản</span>
            </NavLink>
          )}
          <NavLink to="/admin/blog" className="admin-nav-item">
            <i className="fas fa-blog"></i>
            <span>Quản lý Blog</span>
          </NavLink>
          <NavLink to="/admin/orders" className="admin-nav-item" style={{ position: 'relative' }}>
            <i className="fas fa-shopping-cart"></i>
            <span>Quản lý Đơn hàng</span>
            {pendingOrdersCount > 0 && (
              <span className="cart-badge" style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '11px' }}>
                {pendingOrdersCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/" className="admin-nav-item">
            <i className="fas fa-arrow-left"></i>
            <span>Về Trang Chủ</span>
          </NavLink>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {/* Header */}
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="mobile-sidebar-toggle" type="button" onClick={() => setMobileOpen((v) => !v)}>
              <i className="fas fa-bars"></i>
            </button>
            <button className="desktop-sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((v) => !v)}>
              <i className={`fas ${sidebarCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`}></i>
            </button>
            <div className="admin-title-wrap">
              <h1 className="admin-header-title">Admin Panel</h1>
              <p className="admin-breadcrumb">Trang chủ admin / {breadcrumbLabel}</p>
            </div>
          </div>
          <div className="admin-header-right">
            <div className="admin-user-info">
              <div className="admin-user-avatar">
                {currentUser?.name?.charAt(0)?.toUpperCase() || 'A'}
              </div>
              <span>{currentUser?.name || 'Admin'}</span>
            </div>
            <button className="admin-logout-btn" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt"></i> Đăng xuất
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="admin-content">
          {outOfStockBooks.length > 0 && (
            <div
              role="alert"
              style={{
                margin: '0 0 16px',
                padding: '12px 16px',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: 8,
                color: '#856404',
              }}
            >
              <strong>Cảnh báo tồn kho:</strong> có {outOfStockBooks.length} đầu sách đang{' '}
              <strong>hết hàng</strong> (tồn = 0). Vui lòng nhập thêm tại Quản lý kho hoặc cập nhật sách.
              <ul style={{ margin: '8px 0 0 18px' }}>
                {outOfStockBooks.slice(0, 8).map((b) => (
                  <li key={b.id}>
                    {b.title} (mã #{b.id})
                  </li>
                ))}
              </ul>
              {outOfStockBooks.length > 8 && <span>… và {outOfStockBooks.length - 8} đầu sách khác.</span>}
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
