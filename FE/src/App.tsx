import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BookstoreProvider } from './context/BookstoreContext';
import MainLayout from './components/layout/MainLayout';
import { RequireAdmin, RequireAuth, RequireAccountAdmin } from './components/ui/ProtectedRoute';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import BookDetailPage from './pages/BookDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import OrdersPage from './pages/OrdersPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import BestsellerRankingPage from './pages/BestsellerRankingPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminBooksPage from './pages/admin/AdminBooksPage';
import AdminBookEditPage from './pages/admin/AdminBookEditPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminBlogPage from './pages/admin/AdminBlogPage';
import AdminBlogEditPage from './pages/admin/AdminBlogEditPage';
import AdminInventoryPage from './pages/admin/AdminInventoryPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage';

export default function App() {
  return (
    <BookstoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="books/:id" element={<BookDetailPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route
              path="profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route
              path="orders"
              element={
                <RequireAuth>
                  <OrdersPage />
                </RequireAuth>
              }
            />
            <Route path="about" element={<AboutPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="bestseller-ranking" element={<BestsellerRankingPage />} />
          </Route>

          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="books" element={<AdminBooksPage />} />
            <Route path="categories" element={<RequireAccountAdmin><AdminCategoriesPage/></RequireAccountAdmin>}/>
            <Route path="books/new" element={<AdminBookEditPage />} />
            <Route path="books/:id/edit" element={<AdminBookEditPage />} />
            <Route path="inventory" element={<AdminInventoryPage />} />
            <Route path="users" element={<RequireAccountAdmin><AdminUsersPage /></RequireAccountAdmin>} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="blog" element={<AdminBlogPage />} />
            <Route path="blog/new" element={<AdminBlogEditPage />} />
            <Route path="blog/:id/edit" element={<AdminBlogEditPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </BookstoreProvider>
  );
}
