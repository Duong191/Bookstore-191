/**
 * File này định nghĩa các kiểu dữ liệu dùng chung cho frontend Bookstore.
 * Không chứa logic xử lý.
 * Context, hook, page, service có thể import type từ đây để dùng lại thống nhất.
 */

export type AccountRole = 'user' | 'admin' | 'staff';

/** Hồ sơ quản trị trả từ API; không chứa password/hash/token. */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  gender: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  role: AccountRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  gender: string;
  birthday: {
    day: string;
    month: string;
    year: string;
  };
  role: AccountRole;

  /** RBAC: từ API login / users/me khi backend trả về */
  roles?: string[];
  permissions?: string[];
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  avatar: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  price: number;
  importPrice?: number;
  discount: number;
  stock: number;
  categoryId: string;
  description: string;
  image: string;
  images?: string[];
  tags?: string[];
  format?: string;
  supportsTrending?: boolean;
  supportsFormat?: boolean;
  isActive?: boolean;
  categoryParentId?: string | null;
  categoryVisible?: boolean;
  isbn?: string;
  publisher?: string;
  publishDate?: string;
  pages?: number;
  language?: string;
  rating?: number;
  reviewCount?: number;
  soldCount?: number;
  viewCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  parentId?: string | null;
  description?: string;
  isActive?: boolean;
  isVisible?: boolean;
  sortOrder?: number;
  bookCount?: number;
}
export interface AdminCategory extends Category {
  parentId:string|null;description:string;isActive:boolean;isVisible:boolean;sortOrder:number;bookCount:number;children?:AdminCategory[];
}

export interface DetailedCategory {
  id: string;
  name: string;
  subCategories: {
    name: string;
    link: string;
  }[];
  viewAllLink: string;
}

export interface CartItem {
  bookId: string;
  quantity: number;
  addedAt: string;
}

export interface CartItemWithDetails extends CartItem {
  book: Book;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  userId: string;
  items: {
    bookId: string;
    quantity: number;
    price: number;
  }[];
  total: number;
  status: 'pending' | 'processing' | 'shipping' | 'completed' | 'cancelled';
  shippingAddress: {
    name: string;
    phone: string;
    email: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

export interface Blog {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  image: string;
  category?: string;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  bookId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface InventoryLog {
  id: string;
  bookId: string;
  type: 'import' | 'export';
  quantity: number;
  importPrice?: number;
  note: string;
  userId: string;
  createdAt: string;
  /** Tên người nhập/xuất từ API (context `users` chỉ có user hiện tại). */
  creatorName?: string;
}

export interface BookstoreData {
  users: User[];
  books: Book[];
  categories: Category[];
  detailedCategories: DetailedCategory[];
  orders: Order[];
  blogs: Blog[];
  reviews: Review[];
  cart?: CartItem[];
  inventoryLogs?: InventoryLog[];
}

export interface Session {
  userId: string;
  loginTime: string;
  expiresAt: string;
}

export interface Toast {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface BookstoreContextValue {
  refreshCategoriesFromApi: () => Promise<void>;
  data: BookstoreData | null;
  loading: boolean;
  session: Session | null;
  currentUser: User | null;
  toast: Toast | null;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  cartItemCount: number;
  getBookById: (id: string) => Book | undefined;
  getCart: () => CartItem[];
  getCartItems: () => CartItemWithDetails[];
  saveCart: (cart: CartItem[]) => void;
  addToCart: (bookId: string, quantity?: number) => boolean;
  updateCartItem: (bookId: string, quantity: number) => boolean;
  removeFromCart: (bookId: string) => boolean;
  clearCartStorage: () => void;
  login: (email: string, password: string) => boolean | Promise<boolean>;
  logout: () => void;
  register: (
    name: string,
    email: string,
    password: string,
    phone?: string
  ) => { success: boolean; userId?: string } | Promise<{ success: boolean; userId?: string }>;
  updateUserProfile: (userId: string, userData: Partial<User>) => User | null | Promise<User | null>;
  addOrder: (orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => Order | Promise<Order>;
  updateOrder: (orderId: string, patch: Partial<Order>) => Order | null | Promise<Order | null>;

  /** Khách xác nhận đã nhận hàng -> hoàn thành (chỉ khi đang giao). */
  confirmOrderReceived: (orderId: string) => Order | null | Promise<Order | null>;

  /** Đồng bộ danh sách sách từ server (tồn kho sau đơn hàng / nhập kho). */
  refreshBooksFromApi: () => Promise<void>;

  /** Tải lại lịch sử nhập/xuất kho từ server (đúng sau khi reload trang). */
  refreshInventoryLogsFromApi: () => Promise<void>;

  /** Gộp dòng giỏ trùng sách (sửa dữ liệu cũ). */
  dedupeCartLines: () => void;
  addBook: (bookData: Omit<Book, 'id' | 'createdAt'>) => Book | Promise<Book>;
  updateBook: (bookId: string, bookData: Partial<Book>) => Book | null | Promise<Book | null>;
  deleteBook: (bookId: string) => boolean | Promise<boolean>;
  addBlog: (blogData: Omit<Blog, 'id' | 'createdAt' | 'updatedAt' | 'views'>) => Blog | Promise<Blog>;
  updateBlog: (blogId: string, blogData: Partial<Blog>) => Blog | null | Promise<Blog | null>;
  deleteBlog: (blogId: string) => boolean | Promise<boolean>;
  getUserById: (id: string) => User | undefined;
  persist: (nextOrFn: BookstoreData | ((prev: BookstoreData) => BookstoreData)) => void;
  addInventoryLog: (
    bookId: string,
    type: 'import' | 'export',
    quantity: number,
    note: string,
    importPrice?: number
  ) => Promise<boolean>;
  getInventoryLogs: () => InventoryLog[];
}

