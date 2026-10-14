// SQL thật; cập nhật/tạo sách trong transaction ngoài, luôn rollback dữ liệu thử.
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const db = require('../src/config/db');
const sql = db.sql;
let outer;
let failTagName;
class TestTransaction {
  async begin() { await new sql.Request(outer).query('SAVE TRANSACTION books_test'); }
  async commit() { /* Không commit dữ liệu thử. */ }
  async rollback() { await new sql.Request(outer).query('ROLLBACK TRANSACTION books_test'); }
}
function TestRequest(tx) {
  const request = new sql.Request(tx instanceof TestTransaction ? outer : tx);
  const realQuery = request.query.bind(request);
  request.query = (statement) => {
    const tagName = request.parameters.name?.value ?? request.parameters.tag?.value;
    if (failTagName && tagName === failTagName && statement.includes('tags')) throw new Error('Injected tag storage failure');
    return realQuery(statement);
  };
  return request;
}
const adapter = { sql: { ...sql, Transaction: TestTransaction, Request: TestRequest }, getDb: async () => ({ request: () => new sql.Request(outer) }) };
const originalLoad = Module._load;
Module._load = function (name, parent, ...args) {
  if (name === '../config/db' && parent.filename.endsWith('book.service.ts')) return adapter;
  return originalLoad.call(this, name, parent, ...args);
};
const books = require('../src/services/book.service');
Module._load = originalLoad;

(async () => {
  try {
    outer = new sql.Transaction(await db.getDb());
    await outer.begin();
    const list = await books.listBooks({ page: 1, limit: 100 });
    assert.ok(list.data.length);
    const original = await books.getBookById(Number(list.data[0].id));
    const id = Number(original.id);
    const tag = `Test ${randomUUID().slice(0, 8)}`;
    const images = ['/img/test-cover-1.jpg', '/img/test-cover-2.jpg'];
    const updated = await books.updateBook(id, { pages: 432, language: 'Tiếng Việt', images,
      tags: [tag, tag, 'Kiểm thử sách'], description: 'Book test transaction', price: 123456, discount: 10,
      ...(original.supportsFormat ? { format: 'Hardcover' } : {}) });
    assert.equal(updated.pages, 432);
    assert.deepEqual(updated.images, images);
    assert.equal(updated.image_url, images[0]);
    assert.equal(updated.tags.length, 2);
    assert.ok(updated.tags.includes(tag));
    if (original.supportsFormat) assert.equal(updated.format, 'Hardcover');
    const reread = await books.getBookById(id);
    assert.equal(reread.pages, 432); assert.deepEqual(reread.images, images); assert.deepEqual(reread.tags, updated.tags);
    const listed = (await books.listBooks({ page: 1, limit: 100 })).data.find(book => Number(book.id) === id);
    assert.equal(listed.pages, 432); assert.deepEqual(listed.images, images); assert.deepEqual(listed.tags, updated.tags);
    await books.updateBook(id, { pages: 433 });
    const partial = await books.getBookById(id);
    assert.deepEqual(partial.images, images); assert.deepEqual(partial.tags, updated.tags);
    await books.updateBook(id, { images: [], image: '/img/stale.jpg', tags: [], pages: null });
    const empty = await books.getBookById(id);
    assert.deepEqual(empty.images, []); assert.equal(empty.image_url, null); assert.deepEqual(empty.tags, []); assert.equal(empty.pages, null);
    // Lỗi sau khi UPDATE books/ảnh phải rollback toàn bộ, không chỉ riêng tags.
    const badTag = `Test rollback ${randomUUID().slice(0, 8)}`;
    failTagName = badTag;
    await assert.rejects(() => books.updateBook(id, { pages: 999, images: ['/img/must-rollback.jpg'], tags: [badTag] }), /Injected tag storage failure/);
    failTagName = undefined;
    const afterError = await books.getBookById(id);
    assert.equal(afterError.pages, null); assert.deepEqual(afterError.images, []); assert.deepEqual(afterError.tags, []);
    assert.equal(Number(afterError.category_id), Number(original.category_id));
    const created = await books.createBook({ title: `Book test ${randomUUID().slice(0, 8)}`, author: 'Test author',
      categoryId: Number(original.category_id), price: 100, stock: 2, pages: 120, images, tags: [tag] });
    assert.equal(created.pages, 120); assert.deepEqual(created.images, images); assert.deepEqual(created.tags, [tag]);
    await books.deleteBook(Number(created.id));
    await assert.rejects(() => books.getBookById(Number(created.id)), error => error.statusCode === 404);
    console.log('PASS: update/create pages + gallery + tags → detail/list reload → partial/clear → rollback lỗi → soft delete');
  } catch (error) { console.error('FAIL:', error.message); process.exitCode = 1; }
  finally {
    if (outer) try { await outer.rollback(); console.log('Book fixture ROLLBACK completed'); } catch (error) { console.error('Rollback:', error.message); process.exitCode = 1; }
    await db.closeDb();
  }
})();
