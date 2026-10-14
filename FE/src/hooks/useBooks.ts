import { useBookstore } from '../context/BookstoreContext';

/**
 * Hook wrapper cho nghiệp vụ sách/danh mục.
 * Tách nhóm dữ liệu catalog và action CRUD sách để page/component dùng gọn hơn.
 * Hook này chỉ đọc/forward lại từ BookstoreContext, không thêm logic xử lý.
 */
export function useBooks() {
  const { data, loading, getBookById, refreshBooksFromApi, addBook, updateBook, deleteBook } = useBookstore();

  return {
    books: (data?.books ?? []).filter(book=>book.isActive!==false&&book.categoryVisible!==false),
    categories: data?.categories ?? [],
    detailedCategories: data?.detailedCategories ?? [],
    loading,
    getBookById,
    refreshBooksFromApi,
    addBook,
    updateBook,
    deleteBook,
  };
}

