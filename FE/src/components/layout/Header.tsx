import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useBookstore } from '../../context/BookstoreContext';

interface HeaderProps {
  topBarVariant?: 'default' | 'auth';
}

export default function Header({ topBarVariant = 'default' }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data, currentUser, cartItemCount, logout } = useBookstore();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  /** Trùng với URL `/shop?search=…` để không bị lệch (URL lọc nhưng ô input còn chữ cũ). */
  useEffect(() => {
    if (!location.pathname.startsWith('/shop')) return;
    const q = searchParams.get('search');
    setSearch(q ?? '');
  }, [location.pathname, location.search, searchParams]);

  const detailed = useMemo(() => data?.detailedCategories || [], [data?.detailedCategories]);
  
  const pendingOrdersCount = useMemo(() => {
    return (data?.orders || []).filter(order => order.status === 'pending').length;
  }, [data?.orders]);

  const columns = useMemo(() => {
    const per = Math.ceil(detailed.length / 4) || 1;
    return [0, 1, 2, 3].map((i) => detailed.slice(i * per, i * per + per));
  }, [detailed]);

  const getCategorySubs = (category: { subCategories?: { name: string; link: string }[] }) => category.subCategories || [];
  /** Giỏ hàng storefront: ẩn với admin/staff; hiển thị với khách và khách hàng (role user). */
  const showStorefrontCart =
    !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'staff');

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (q) navigate(`/shop?search=${encodeURIComponent(q)}`);
    else navigate('/shop');
  };

  return (
    <header className="header">
      <div className="top-bar">
        <div className="container">
          <div className="top-bar-content">
            {topBarVariant === 'auth' && (
              <div className="top-bar-left">
                <span>
                  <i className="fas fa-phone" /> 0932092002
                </span>
                <span>
                  <i className="fas fa-envelope" /> contact@bookarazi.com
                </span>
              </div>
            )}
            <div className="top-bar-right">
              <span>FREE SHIPPING FOR ORDERS OVER 500.000đ</span>
            </div>
          </div>
        </div>
      </div>

      <nav className="navbar">
        <div className="container">
          <div className="nav-wrapper">
            <NavLink to="/" className="logo">
              <img src="/icon/book.jpg" alt="Bookarazi" className="logo-img" />
              <span>Bookarazi</span>
            </NavLink>

            <div className="nav-actions">
              <div
                className="category-menu-wrapper"
                onMouseEnter={() => setCatOpen(true)}
                onMouseLeave={() => setCatOpen(false)}
              >
                <button type="button" className="category-icon" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <i className="fas fa-table-cells-large category-icon-glyph" aria-hidden />
                  <span>Danh mục</span>
                </button>
                <div className={`category-dropdown ${catOpen ? 'show' : ''}`}>
                  {detailed.length === 0 ? (
                    <div style={{ padding: 20 }}>Đang tải danh mục…</div>
                  ) : (
                    <>
                      {columns.map((col, ci) => (
                        <div key={ci} className="category-column">
                          {col.map((category) => (
                            <div key={category.id} className="category-section">
                              <h3 className="category-title">{category.name}</h3>
                              <div className="category-subcategories">
                                {(() => {
                                  const subs = getCategorySubs(category);
                                  const placeholders = Array.from({ length: Math.max(0, 4 - subs.length) });
                                  return (
                                    <>
                                      {subs.map((sub) => (
                                        <NavLink
                                          key={`${category.id}-${sub.name}`}
                                          to={sub.link || category.viewAllLink || `/shop?category=${category.id}`}
                                          className="category-subcategory"
                                          onClick={() => setCatOpen(false)}
                                        >
                                          {sub.name}
                                        </NavLink>
                                      ))}
                                      {placeholders.map((_, idx) => (
                                        <span
                                          key={`${category.id}-placeholder-${idx}`}
                                          className="category-subcategory category-subcategory--placeholder"
                                          aria-hidden="true"
                                        >
                                          &nbsp;
                                        </span>
                                      ))}
                                    </>
                                  );
                                })()}
                              </div>
                              <NavLink
                                to={category.viewAllLink || `/shop?category=${category.id}`}
                                className="category-view-all"
                                onClick={() => setCatOpen(false)}
                              >
                                Xem tất cả
                              </NavLink>
                            </div>
                          ))}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <form className="search-box" onSubmit={onSearch}>
                <input
                  type="text"
                  placeholder="Tìm kiếm sách..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" aria-label="Tìm kiếm" id="searchBtn">
                  <i className="fas fa-magnifying-glass nav-action-glyph" aria-hidden />
                </button>
              </form>

              {showStorefrontCart && (
                <NavLink to="/cart" className="cart-icon">
                  <i className="fas fa-bag-shopping cart-icon-glyph" aria-hidden />
                  <span>Giỏ hàng</span>
                  <span className="cart-badge" id="cartBadge" style={{ display: cartItemCount > 0 ? 'block' : 'none' }}>
                    {cartItemCount}
                  </span>
                </NavLink>
              )}

              <div className="user-menu-wrapper" id="userMenuWrapper">
                <button type="button" className="user-menu-icon" id="userMenuIcon" onClick={() => setMenuOpen((o) => !o)} style={{ position: 'relative' }}>
                  <img src="/icon/menu.jpg" alt="Menu" className="icon-img" />
                  {(currentUser?.role === 'admin' || currentUser?.role === 'staff') && pendingOrdersCount > 0 && (
                    <span className="cart-badge" style={{ display: 'block' }}>
                      {pendingOrdersCount}
                    </span>
                  )}
                </button>
                <div
                  className="user-menu-dropdown"
                  id="userMenuDropdown"
                  style={{ display: menuOpen ? 'block' : 'none' }}
                >
                  {currentUser ? (
                    <>
                      <div className="user-info" id="userInfo">
                        <div className="user-avatar">
                          <span id="userInitial">{currentUser.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                        </div>
                        <div className="user-name" id="userDisplayName">
                          {currentUser.name}
                        </div>
                      </div>
                      <div className="menu-divider" id="menuDivider" />
                      <NavLink to="/profile" className="menu-item" onClick={() => setMenuOpen(false)}>
                        <i className="fas fa-user" /> Tài khoản
                      </NavLink>
                      <NavLink to="/orders" className="menu-item" onClick={() => setMenuOpen(false)}>
                        <i className="fas fa-box" /> Đơn hàng
                      </NavLink>
                      {(currentUser.role === 'admin' || currentUser.role === 'staff') && (
                        <NavLink to="/admin/dashboard" className="menu-item" onClick={() => setMenuOpen(false)}>
                          <i className="fas fa-cog" /> Quản trị
                        </NavLink>
                      )}
                      <button
                        type="button"
                        className="menu-item"
                        style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
                        onClick={() => {
                          logout();
                          setMenuOpen(false);
                          navigate('/');
                        }}
                      >
                        <i className="fas fa-sign-out-alt" /> Đăng xuất
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="menu-divider" id="loginDivider" />
                      <NavLink to="/login" className="menu-item" onClick={() => setMenuOpen(false)}>
                        <i className="fas fa-sign-in-alt" /> Đăng nhập
                      </NavLink>
                      <NavLink to="/login?tab=register" className="menu-item" onClick={() => setMenuOpen(false)}>
                        <i className="fas fa-user-plus" /> Đăng ký
                      </NavLink>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
