import { buildAdminBookPayload } from './adminBookPayload';
import { mapBook } from '../api/publicApi';

test('form gửi đủ pages/tags/gallery/format, giữ arrays rỗng và field cần xóa', () => {
  expect(buildAdminBookPayload({ categoryId: '5', pages: 321, language: 'Tiếng Việt', format: 'Hardcover',
    images: ['/a.jpg', '/b.jpg'], image: '/old.jpg', tags: ['  Tag A ', 'Tag B', 'Tag A'], publishYear: 2026,
    bestSeller: true, reviewCount: 0, soldCount: 0 })).toEqual({ categoryId: 5, pages: 321, language: 'Tiếng Việt',
      format: 'Hardcover', images: ['/a.jpg', '/b.jpg'], tags: ['Tag A', 'Tag B'], publishDate: '2026-01-01',
      bestseller: true, reviewCount: 0, soldCount: 0 });
  expect(buildAdminBookPayload({ images: [], tags: [], pages: null, publishYear: null, isbn: '' }))
    .toEqual({ images: [], tags: [], pages: null, publishDate: null, isbn: null });
});
test('mapper giữ toàn bộ ảnh/tags sau reload; mảng rỗng không khôi phục ảnh cũ', () => {
  const book = mapBook({ id: 7, pages: 321, images: ['/a.jpg', '/b.jpg'], tags: ['Tag A', 'Tag B'], format: 'Hardcover' });
  expect(book.pages).toBe(321); expect(book.images).toEqual(['/a.jpg', '/b.jpg']); expect(book.tags).toEqual(['Tag A', 'Tag B']);
  expect(book.image).toBe('/a.jpg'); expect(book.format).toBe('Hardcover');
  const cleared = mapBook({ id: 7, images: [], image_url: '/stale.jpg', tags: [] });
  expect(cleared.image).toBe(''); expect(cleared.images).toEqual([]); expect(cleared.tags).toEqual([]);
});
