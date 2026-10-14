// ==============================
// Import React hooks và kiểu nền tảng
// ==============================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

// ==============================
// Import helper/util cho tính toán dữ liệu hiển thị
// ==============================
import { discountedUnitPrice } from '../utils/format';

// ==============================
// Import các API auth, orders, books/blogs, inventory, cart, public
// ==============================
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  registerRequest,
  updateProfileRequest,
} from '../api/authApi';
import {
  confirmOrderReceivedRequest,
  createOrderRequest,
  getOrders,
  updateOrderStatusRequest,
} from '../api/ordersApi';
import { createBookRequest, deleteBookRequest, updateBookRequest } from '../api/adminBooksApi';
import { createBlogRequest, deleteBlogRequest, updateBlogRequest } from '../api/blogsApi';
import { createInventoryLogRequest, getInventoryLogsRequest } from '../api/inventoryApi';
import { getCartRequest, updateCartRequest } from '../api/cartApi';
import { getBooks } from '../api/publicApi';
import { bootstrapFromBackend } from '../services/dataBootstrapService';
import { buildAdminBookPayload } from '../services/adminBookPayload';

// ==============================
// Import type dùng chung của domain bookstore
// ==============================
import type {
  Blog,
  Book,
  BookstoreContextValue,
  BookstoreData,
  CartItem,
  CartItemWithDetails,
  InventoryLog,
  Order,
  Session,
  Toast,
  User,
} from '../types/bookstore.types';

// Key localStorage cho token/phiên đăng nhập.
const ACCESS_TOKEN_KEY = 'bookstoreAccessToken';
const REFRESH_TOKEN_KEY = 'bookstoreRefreshToken';
const GUEST_CART_KEY = 'bookstoreGuestCart';
const USER_CART_KEY_PREFIX = 'bookstoreUserCart';
/** Đọc access token hiện tại từ localStorage. */
function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Gộp các dòng trùng bookId (ví dụ gọi addToCart nhiều lần trước khi React kịp cập nhật state). */
function mergeCartLineItems(cart: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of cart) {
    const k = String(item.bookId);
    const prev = map.get(k);
    if (prev) {
      prev.quantity += item.quantity;
    } else {
      map.set(k, { ...item });
    }
  }
  return Array.from(map.values());
}

/** Đọc giỏ hàng guest từ localStorage để giữ dữ liệu sau khi reload. */
function readGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        bookId: String(item?.bookId || ''),
        quantity: Number(item?.quantity || 0),
        addedAt: String(item?.addedAt || new Date().toISOString()),
      }))
      .filter((item) => item.bookId && item.quantity > 0);
  } catch {
    return [];
  }
}

/** Ghi giỏ hàng guest vào localStorage. */
function writeGuestCart(cart: CartItem[]): void {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  } catch {
    /* ignore */
  }
}

/** Key localStorage riêng theo user để tránh lẫn dữ liệu giữa các tài khoản. */
function getUserCartKey(userId: string): string {
  return `${USER_CART_KEY_PREFIX}:${userId}`;
}

/** Đọc cart đã cache local của user đăng nhập. */
function readUserCart(userId: string): CartItem[] {
  try {
    const raw = localStorage.getItem(getUserCartKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        bookId: String(item?.bookId || ''),
        quantity: Number(item?.quantity || 0),
        addedAt: String(item?.addedAt || new Date().toISOString()),
      }))
      .filter((item) => item.bookId && item.quantity > 0);
  } catch {
    return [];
  }
}

/** Ghi cart local cache cho user đăng nhập. */
function writeUserCart(userId: string, cart: CartItem[]): void {
  try {
    localStorage.setItem(getUserCartKey(userId), JSON.stringify(cart));
  } catch {
    /* ignore */
  }
}

// ============ CONTEXT SETUP ============

const DATA_KEY = 'bookstoreData';
const SESSION_KEY = 'bookstoreSession';

/** Xóa blob demo cũ; catalog chỉ lấy từ API (không persist `bookstoreData`). */
function clearLegacyStoredCatalog(): void {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {
    /* ignore */
  }
}

const BookstoreContext = createContext<BookstoreContextValue | null>(null);

/** Đọc session đăng nhập cũ từ localStorage và tự loại session hết hạn. */
function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    if (new Date() > new Date(session.expiresAt)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/** Ghi/xóa session theo trạng thái đăng nhập hiện tại. */
function writeSession(session: Session | null): void {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** Tải dữ liệu danh mục/sách ban đầu từ backend. */
async function loadCatalogFromApi(): Promise<BookstoreData> {
  clearLegacyStoredCatalog();
  const bootstrapped = await bootstrapFromBackend();
  if (bootstrapped) return bootstrapped;

  return {
    users: [],
    books: [],
    categories: [],
    detailedCategories: [],
    orders: [],
    blogs: [],
    reviews: [],
    cart: [],
    inventoryLogs: [],
  };
}

// ============ PROVIDER COMPONENT ============

// Provider bọc toàn app: giữ state dùng chung + expose action nghiệp vụ.
export function BookstoreProvider({ children }: { children: ReactNode }) {
  // State dữ liệu chính toàn hệ thống (sách, danh mục, đơn hàng, blog, cart, kho...).
  const [data, setData] = useState<BookstoreData | null>(null);

  // Cờ loading global cho lúc bootstrap dữ liệu ban đầu.
  const [loading, setLoading] = useState(true);

  // Phiên đăng nhập hiện tại (đọc từ localStorage khi khởi tạo).
  const [session, setSession] = useState<Session | null>(() => readSession());
  const initialSessionUserIdRef = useRef(session?.userId);

  // State toast toàn app.
  const [toast, setToast] = useState<Toast | null>(null);

  // ==============================
  // Persist/storage helper
  // ==============================
  /** Helper cập nhật `data` an toàn theo object hoặc updater function. */
  const persist = useCallback((nextOrFn: BookstoreData | ((prev: BookstoreData) => BookstoreData)) => {
    setData((prev) => {
      const base: BookstoreData = prev || {
        users: [],
        books: [],
        categories: [],
        detailedCategories: [],
        orders: [],
        blogs: [],
        reviews: [],
        cart: [],
      };
      const next = typeof nextOrFn === 'function' ? nextOrFn(base) : nextOrFn;
      return next;
    });
  }, []);

  // ==============================
  // Khởi tạo dữ liệu ban đầu của app (catalog/blog/review...)
  // ==============================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log('[Init] Loading data...');
        const d = await loadCatalogFromApi();
        console.log('[Init] Data loaded. Users:', d.users?.length, 'Books:', d.books?.length);
        if (!cancelled) {
          const guestCart = !initialSessionUserIdRef.current ? readGuestCart() : [];
          setData({ ...d, cart: guestCart.length ? guestCart : d.cart || [] });
        }
      } catch (e) {
        console.error('[Init] Error loading data:', e);
        if (!cancelled) {
          setData({
            users: [],
            books: [],
            categories: [],
            detailedCategories: [],
            orders: [],
            blogs: [],
            reviews: [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ==============================
  // Đồng bộ dữ liệu theo phiên đăng nhập (user/orders/cart/inventory)
  // ==============================
  useEffect(() => {
    if (loading) return;
    const token = getAccessToken();
    if (!token || !session?.userId) return;

    let cancelled = false;
    (async () => {
      try {
        const [user, orders, inventoryLogs, cartItems] = await Promise.all([
          fetchCurrentUser(token).catch(() => null),
          getOrders(token).catch(() => []),
          getInventoryLogsRequest(token).catch(() => []),
          getCartRequest({ token }).catch(() => []),
        ]);
        if (cancelled) return;
        const serverCart: CartItem[] = cartItems.map((item) => ({
          bookId: item.bookId,
          quantity: item.quantity,
          addedAt: item.addedAt,
        }));
        const localUserCart = readUserCart(session.userId);
        const hydratedCart = serverCart.length ? serverCart : localUserCart;
        if (!serverCart.length && localUserCart.length) {
          const payload = {
            items: localUserCart.map((item) => ({
              bookId: Number(item.bookId),
              quantity: item.quantity,
            })),
          };
          updateCartRequest(payload, { token }).catch(() => {});
        }
        writeUserCart(session.userId, hydratedCart);
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            users: user ? [user] : prev.users,
            orders,
            inventoryLogs,
            cart: hydratedCart,
          };
        });
      } catch {
        /* session or network error — keep catalog */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session?.userId]);

  // ==============================
  // Nhóm xử lý toast/thông báo
  // ==============================
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // User hiện tại được suy ra từ session + data.users.
  const currentUser = useMemo(() => {
    if (!data || !session?.userId) {
      console.log('[CurrentUser] No data or session');
      return null;
    }
    const user = data.users?.find((u) => String(u.id) === String(session.userId)) || null;
    console.log('[CurrentUser] Session userId:', session.userId, 'Found user:', user ? user.email : null);
    return user;
  }, [data, session]);

  // ==============================
  // Nhóm helper dữ liệu cơ bản (books/cart)
  // ==============================
  const getBookById = useCallback(
    (id: string) => data?.books?.find((b) => b && String(b.id) === String(id)),
    [data]
  );

  const getCart = useCallback((): CartItem[] => {
    return data?.cart || [];
  }, [data]);

  const saveCart = useCallback(
    (cart: CartItem[]) => {
      if (!session?.userId) {
        writeGuestCart(cart);
      } else {
        writeUserCart(session.userId, cart);
        const token = getAccessToken();
        if (token) {
          const payload = {
            items: cart.map((item) => ({
              bookId: Number(item.bookId),
              quantity: item.quantity,
            })),
          };
          updateCartRequest(payload, { token }).catch(() => {});
        }
      }
      persist((prev) => ({ ...prev, cart }));
    },
    [persist, session?.userId]
  );

  const getCartItems = useCallback((): CartItemWithDetails[] => {
    const cart = mergeCartLineItems(getCart());
    return cart
      .map((item) => {
        const book = getBookById(item.bookId);
        if (!book) return null;
        const price = discountedUnitPrice(book);
        return {
          ...item,
          book,
          price,
          total: price * item.quantity,
        };
      })
      .filter((item): item is CartItemWithDetails => item !== null);
  }, [getCart, getBookById]);

  const cartItemCount = useMemo(
    () => getCartItems().reduce((s, i) => s + i.quantity, 0),
    [getCartItems]
  );

  // ==============================
  // Nhóm xử lý xác thực (auth)
  // ==============================
  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { accessToken, refreshToken, user } = await loginRequest(email, password);
        const [orders, inventoryLogs, cartItems] = await Promise.all([
          getOrders(accessToken).catch(() => []),
          getInventoryLogsRequest(accessToken).catch(() => []),
          getCartRequest({ token: accessToken }).catch(() => []),
        ]);
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        writeGuestCart([]);
        const s: Session = {
          userId: user.id,
          loginTime: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        writeSession(s);
        setSession(s);
        setData((prev) => ({
          ...(prev || {
            users: [],
            books: [],
            categories: [],
            detailedCategories: [],
            orders: [],
            blogs: [],
            reviews: [],
          }),
          users: [user],
          orders,
          inventoryLogs,
          cart: cartItems.map((item) => ({
            bookId: item.bookId,
            quantity: item.quantity,
            addedAt: item.addedAt,
          })),
        }));
        showToast('Đăng nhập thành công', 'success');
        return true;
      } catch {
        showToast('Email hoặc mật khẩu không đúng', 'error');
        return false;
      }
    },
    [showToast]
  );

  const logout = useCallback(() => {
    const userId = session?.userId;
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (rt) {
      logoutRequest(rt).catch(() => {});
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    writeGuestCart([]);
    if (userId) {
      writeUserCart(userId, []);
    }
    writeSession(null);
    setSession(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            users: [],
            orders: [],
            inventoryLogs: [],
            cart: [],
          }
        : prev
    );
    showToast('Đã đăng xuất', 'success');
  }, [session?.userId, showToast]);

  const register = useCallback(
    async (name: string, email: string, password: string, phone: string = '') => {
      try {
        const parts = name.trim().split(/\s+/);
        const firstName = parts[0] || 'User';
        const lastName = parts.slice(1).join(' ') || 'User';
        const { accessToken, refreshToken, user } = await registerRequest({ firstName, lastName, email, password, phone });
        const [orders, inventoryLogs, cartItems] = await Promise.all([
          getOrders(accessToken).catch(() => []),
          getInventoryLogsRequest(accessToken).catch(() => []),
          getCartRequest({ token: accessToken }).catch(() => []),
        ]);
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        writeGuestCart([]);
        const s: Session = {
          userId: user.id,
          loginTime: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        writeSession(s);
        setSession(s);
        setData((prev) => ({
          ...(prev || {
            users: [],
            books: [],
            categories: [],
            detailedCategories: [],
            orders: [],
            blogs: [],
            reviews: [],
          }),
          users: [user],
          orders,
          inventoryLogs,
          cart: cartItems.map((item) => ({
            bookId: item.bookId,
            quantity: item.quantity,
            addedAt: item.addedAt,
          })),
        }));
        showToast('Đăng ký thành công', 'success');
        return { success: true, userId: user.id };
      } catch {
        showToast('Không đăng ký được (email có thể đã tồn tại)', 'error');
        return { success: false, userId: '' };
      }
    },
    [showToast]
  );

  const updateUserProfile = useCallback(
    async (_userId: string, userData: Partial<User>): Promise<User | null> => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) return null;
      try {
        const patch: Record<string, unknown> = {};
        if (userData.firstName !== undefined) patch.firstName = userData.firstName;
        if (userData.lastName !== undefined) patch.lastName = userData.lastName;
        if (userData.phone !== undefined) patch.phone = userData.phone;
        if (userData.gender !== undefined) patch.gender = userData.gender;
        if (userData.avatar !== undefined) patch.avatar = userData.avatar;
        if (userData.address) {
          patch.address = {
            street: userData.address.street,
            city: userData.address.city,
            state: userData.address.state,
            zipCode: userData.address.zipCode,
            country: userData.address.country,
          };
        }
        const updated = await updateProfileRequest(token, patch);
        setData((prev) => ({
          ...(prev!),
          users: [updated],
        }));
        return updated;
      } catch {
        return null;
      }
    },
    []
  );

  // ==============================
  // Nhóm xử lý giỏ hàng
  // ==============================
  const addToCart = useCallback(
    (bookId: string, quantity: number = 1) => {
      if (!Number.isSafeInteger(Number(bookId)) || Number(bookId) <= 0) {
        showToast('Sách này đang dùng dữ liệu dự phòng. Vui lòng tải lại cửa hàng khi kết nối Backend hoạt động.', 'error');
        return false;
      }
      const book = getBookById(bookId);
      if (!book) {
        showToast('Không tìm thấy sách', 'error');
        return false;
      }
      if (book.stock < quantity) {
        showToast(`Chỉ còn ${book.stock} cuốn trong kho`, 'error');
        return false;
      }
      const cart = getCart();
      const existing = cart.find((i) => String(i.bookId) === String(bookId));
      if (existing) {
        existing.quantity += quantity;
        if (existing.quantity > book.stock) {
          existing.quantity = book.stock;
          showToast(`Đã cập nhật số lượng tối đa là ${book.stock}`, 'warning');
        }
      } else {
        cart.push({
          bookId,
          quantity,
          addedAt: new Date().toISOString(),
        });
      }
      saveCart(cart);
      showToast('Đã thêm vào giỏ hàng', 'success');
      return true;
    },
    [getBookById, getCart, saveCart, showToast]
  );

  const updateCartItem = useCallback(
    (bookId: string, quantity: number) => {
      const cart = getCart();
      const item = cart.find((i) => String(i.bookId) === String(bookId));
      if (!item) return false;
      if (quantity <= 0) {
        const next = cart.filter((i) => String(i.bookId) !== String(bookId));
        saveCart(next);
        return true;
      }
      const book = getBookById(bookId);
      if (!book) return false;
      if (quantity > book.stock) {
        showToast(`Chỉ còn ${book.stock} cuốn trong kho`, 'error');
        return false;
      }
      item.quantity = quantity;
      saveCart(cart);
      return true;
    },
    [getBookById, getCart, saveCart, showToast]
  );

  const removeFromCart = useCallback(
    (bookId: string) => {
      const cart = getCart().filter((i) => String(i.bookId) !== String(bookId));
      saveCart(cart);
      return true;
    },
    [getCart, saveCart]
  );

  const clearCartStorage = useCallback(() => {
    writeGuestCart([]);
    saveCart([]);
  }, [saveCart]);

  // ==============================
  // Nhóm refresh dữ liệu từ backend
  // ==============================
  const refreshBooksFromApi = useCallback(async () => {
    try {
      const books = await getBooks<Book>('page=1&limit=500');
      persist((prev) => (prev ? { ...prev, books } : prev));
    } catch {
      /* ignore */
    }
  }, [persist]);

  const refreshInventoryLogsFromApi = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const logs = await getInventoryLogsRequest(token);
      persist((prev) => (prev ? { ...prev, inventoryLogs: logs } : prev));
    } catch {
      /* ignore */
    }
  }, [persist]);

  const dedupeCartLines = useCallback(() => {
    persist((prev) => {
      if (!prev?.cart?.length) return prev;
      return { ...prev, cart: mergeCartLineItems(prev.cart) };
    });
  }, [persist]);

  // ==============================
  // Nhóm xử lý đơn hàng
  // ==============================
  const addOrder = useCallback(
    async (orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> => {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Bạn cần đăng nhập để đặt hàng');
      }
      const itemsPayload = orderData.items.map((i) => ({
        bookId: Number(i.bookId),
        quantity: i.quantity
      }));
      if (itemsPayload.length === 0) {
        throw new Error('Giỏ hàng trống');
      }
      await updateCartRequest({ items: itemsPayload }, { token });

      const addr = orderData.shippingAddress;
      const email = addr.email?.trim();
      const created = await createOrderRequest(
        token,
        {
          paymentMethod: orderData.paymentMethod,
          shippingName: addr.name,
          shippingPhone: addr.phone,
          ...(email ? { shippingEmail: email } : {}),
          shippingAddress: addr.street,
          shippingCity: addr.city,
          ...(addr.state?.trim() ? { shippingState: addr.state.trim() } : {}),
          ...(addr.zipCode?.trim() ? { shippingZipcode: addr.zipCode.trim() } : {}),
          ...(addr.country?.trim() ? { shippingCountry: addr.country.trim() } : {}),
        },
        orderData
      );
      persist((prev) => ({
        ...prev,
        orders: [created, ...(prev.orders || [])],
      }));
      await refreshBooksFromApi();
      return created;
    },
    [persist, refreshBooksFromApi]
  );

  const updateOrder = useCallback(
    async (orderId: string, patch: Partial<Order>): Promise<Order | null> => {
      if (!patch.status) {
        return null;
      }
      const token = getAccessToken();
      if (!token) return null;
      try {
        await updateOrderStatusRequest(token, orderId, patch.status);
        let merged: Order | null = null;
        persist((prev) => {
          const existing = (prev.orders || []).find((o) => String(o.id) === String(orderId));
          if (!existing) return prev;
          merged = {
            ...existing,
            ...patch,
            updatedAt: new Date().toISOString()
          } as Order;
          return {
            ...prev,
            orders: (prev.orders || []).map((o) => (String(o.id) === String(orderId) ? merged! : o))
          };
        });
        return merged;
      } catch {
        return null;
      }
    },
    [persist]
  );

  const confirmOrderReceived = useCallback(
    async (orderId: string): Promise<Order | null> => {
      const token = getAccessToken();
      if (!token) return null;
      try {
        await confirmOrderReceivedRequest(token, orderId);
        let merged: Order | null = null;
        persist((prev) => {
          const existing = (prev.orders || []).find((o) => String(o.id) === String(orderId));
          if (!existing) return prev;
          merged = {
            ...existing,
            status: 'completed',
            updatedAt: new Date().toISOString(),
          } as Order;
          return {
            ...prev,
            orders: (prev.orders || []).map((o) => (String(o.id) === String(orderId) ? merged! : o)),
          };
        });
        return merged;
      } catch {
        return null;
      }
    },
    [persist]
  );

  // ==============================
  // Nhóm xử lý sách/blog phía admin
  // ==============================
  const addBook = useCallback(
    async (bookData: Omit<Book, 'id' | 'createdAt'>): Promise<Book> => {
      const token = getAccessToken();
      if (!token) throw new Error('Bạn cần đăng nhập để quản lý sách');
      const created = await createBookRequest(token, buildAdminBookPayload(bookData as unknown as Record<string, unknown>));
      persist((prev) => ({ ...prev, books: [created, ...(prev.books || [])].filter(Boolean) }));
      return created;
    },
    [persist]
  );

  const updateBook = useCallback(
    async (bookId: string, bookData: Partial<Book>): Promise<Book | null> => {
      const token = getAccessToken();
      if (!token) throw new Error('Bạn cần đăng nhập để quản lý sách');
      const updated = await updateBookRequest(token, bookId, buildAdminBookPayload(bookData as unknown as Record<string, unknown>));
      // Chỉ cập nhật bằng kết quả BE xác nhận, không merge tags/ảnh chưa thực sự được lưu.
      persist((prev) => ({ ...prev, books: (prev.books || []).map((book) => String(book.id) === String(bookId) ? updated : book) }));
      return updated;
    },
    [persist]
  );
  const deleteBook = useCallback(
    async (bookId: string): Promise<boolean> => {
      const token = getAccessToken();
      if (!token) return false;
      try {
        await deleteBookRequest(token, bookId);
        persist((prev) => ({
          ...prev,
          books: (prev.books || []).filter((b) => b && String(b.id) !== String(bookId)),
        }));
        return true;
      } catch {
        return false;
      }
    },
    [persist]
  );

  const addBlog = useCallback(
    async (blogData: Omit<Blog, 'id' | 'createdAt' | 'updatedAt' | 'views'>): Promise<Blog> => {
      const token = getAccessToken();
      if (!token) throw new Error('Unauthorized');
      const created = await createBlogRequest(token, {
        title: blogData.title,
        excerpt: blogData.excerpt,
        content: blogData.content,
        author: blogData.author,
        image: blogData.image,
        category: blogData.category,
      });
      persist((prev) => ({
        ...prev,
        blogs: [created, ...(prev.blogs || [])],
      }));
      return created;
    },
    [persist]
  );

  const updateBlog = useCallback(
    async (blogId: string, blogData: Partial<Blog>): Promise<Blog | null> => {
      const token = getAccessToken();
      if (!token) return null;
      try {
        const updated = await updateBlogRequest(token, blogId, {
          title: blogData.title,
          excerpt: blogData.excerpt,
          content: blogData.content,
          author: blogData.author,
          image: blogData.image,
          category: blogData.category,
        });
        persist((prev) => ({
          ...prev,
          blogs: (prev.blogs || []).map((b) => (String(b.id) === String(blogId) ? updated : b)),
        }));
        return updated;
      } catch {
        return null;
      }
    },
    [persist]
  );

  const deleteBlog = useCallback(
    async (blogId: string): Promise<boolean> => {
      const token = getAccessToken();
      if (!token) return false;
      try {
        await deleteBlogRequest(token, blogId);
        persist((prev) => ({
          ...prev,
          blogs: (prev.blogs || []).filter((b) => String(b.id) !== String(blogId)),
        }));
        return true;
      } catch {
        return false;
      }
    },
    [persist]
  );

  const getUserById = useCallback(
    (id: string) => data?.users?.find((u) => String(u.id) === String(id)),
    [data]
  );

  // ==============================
  // Nhóm xử lý kho (inventory)
  // ==============================
  const addInventoryLog = useCallback(
    async (bookId: string, type: 'import' | 'export', quantity: number, note: string, importPrice?: number) => {
      const token = getAccessToken();
      if (!token) {
        showToast('Bạn cần đăng nhập để thực hiện thao tác kho.', 'error');
        return false;
      }

      try {
        await createInventoryLogRequest(token, {
          bookId,
          transactionType: type,
          quantity: type === 'export' ? -Math.abs(quantity) : Math.abs(quantity),
          importPrice,
          note,
        });
        await refreshBooksFromApi();
        const freshLogs = await getInventoryLogsRequest(token).catch(() => [] as InventoryLog[]);
        persist((prev) => (prev ? { ...prev, inventoryLogs: freshLogs } : prev));

        showToast(
          type === 'import'
            ? `Đã nhập ${quantity} sản phẩm vào kho`
            : `Đã xuất ${quantity} sản phẩm`,
          'success'
        );
        return true;
      } catch {
        showToast('Không thể ghi nhận nhập/xuất kho. Kiểm tra kết nối hoặc tồn kho và thử lại.', 'error');
        return false;
      }
    },
    [persist, showToast, refreshBooksFromApi]
  );

  const getInventoryLogs = useCallback(() => {
    return (data?.inventoryLogs || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data]);

  // ==============================
  // Giá trị context chia sẻ xuống toàn bộ app
  // ==============================
  const value: BookstoreContextValue = useMemo(
    () => ({
      data,
      loading,
      session,
      currentUser,
      toast,
      showToast,
      cartItemCount,
      getBookById,
      getCart,
      getCartItems,
      saveCart,
      addToCart,
      updateCartItem,
      removeFromCart,
      clearCartStorage,
      login,
      logout,
      register,
      updateUserProfile,
      addOrder,
      updateOrder,
      confirmOrderReceived,
      refreshBooksFromApi,
      refreshInventoryLogsFromApi,
      dedupeCartLines,
      addBook,
      updateBook,
      deleteBook,
      addBlog,
      updateBlog,
      deleteBlog,
      getUserById,
      persist,
      addInventoryLog,
      getInventoryLogs,
    }),
    [
      data,
      loading,
      session,
      currentUser,
      toast,
      showToast,
      cartItemCount,
      getBookById,
      getCart,
      getCartItems,
      saveCart,
      addToCart,
      updateCartItem,
      removeFromCart,
      clearCartStorage,
      login,
      logout,
      register,
      updateUserProfile,
      addOrder,
      updateOrder,
      confirmOrderReceived,
      refreshBooksFromApi,
      refreshInventoryLogsFromApi,
      dedupeCartLines,
      addBook,
      updateBook,
      deleteBook,
      addBlog,
      updateBlog,
      deleteBlog,
      getUserById,
      persist,
      addInventoryLog,
      getInventoryLogs,
    ]
  );

  // Provider render children + toast toàn cục.
  return (
    <BookstoreContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast ${toast.type}`} style={{ display: 'block' }}>
          {toast.message}
        </div>
      )}
    </BookstoreContext.Provider>
  );
}

/**
 * Hook truy cập BookstoreContext cho toàn bộ app.
 * - Cung cấp state dùng chung: user hiện tại, dữ liệu sách/đơn hàng, trạng thái loading...
 * - Cung cấp action/effect đã đóng gói trong Provider: auth, giỏ hàng, đơn hàng, nhập kho, toast...
 * Lưu ý: phải dùng bên trong `BookstoreProvider`.
 */
export function useBookstore(): BookstoreContextValue {
  const ctx = useContext(BookstoreContext);
  if (!ctx) throw new Error('useBookstore must be used inside BookstoreProvider');
  return ctx;
}
