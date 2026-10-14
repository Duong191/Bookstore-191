// Kiểm tra SQL thật, tất cả user/cart/order/stock thử được ROLLBACK ở cuối.
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const db = require('../src/config/db');
const sql = db.sql;
let outer;
class TestTransaction {
  async begin() { await new sql.Request(outer).query('SAVE TRANSACTION checkout_test'); }
  async commit() { /* Không commit dữ liệu thử. */ }
  async rollback() { await new sql.Request(outer).query('ROLLBACK TRANSACTION checkout_test'); }
}
function TestRequest(transaction) { return new sql.Request(transaction instanceof TestTransaction ? outer : transaction); }
const adapter = { sql: { ...sql, Transaction: TestTransaction, Request: TestRequest }, getDb: async () => ({ request: () => new sql.Request(outer) }) };
const originalLoad = Module._load;
Module._load = function (name, parent, ...args) {
  if (name === '../config/db' && /(?:cart|order)\.service\.ts$/.test(parent.filename)) return adapter;
  return originalLoad.call(this, name, parent, ...args);
};
const cart = require('../src/services/cart.service');
const orders = require('../src/services/order.service');
Module._load = originalLoad;

(async () => {
  try {
    const pool = await db.getDb();
    const rebuilt = (await pool.request().query("SELECT COL_LENGTH('dbo.books','stock_quantity') AS rebuilt")).recordset[0].rebuilt != null;
    const stockColumn = rebuilt ? 'stock_quantity' : 'stock';
    outer = new sql.Transaction(pool);
    await outer.begin();
    const fixture = await new sql.Request(outer).input('email', sql.NVarChar(255), `${randomUUID()}@checkout-test.invalid`)
      .query(`INSERT INTO users(email,password_hash,first_name,last_name,is_active,is_deleted,created_at,updated_at)
        OUTPUT INSERTED.id VALUES(@email,N'test hash',N'Checkout',N'Test',1,0,GETUTCDATE(),GETUTCDATE())`);
    const userId = Number(fixture.recordset[0].id);
    const book = (await new sql.Request(outer).query(`SELECT TOP 1 id,${stockColumn} AS stock,sold_count FROM books
      WHERE is_active=1 AND is_deleted=0 AND ${stockColumn}>=2 ORDER BY id`)).recordset[0];
    assert.ok(book, 'Cần một sách đang bán, tồn ít nhất 2 để chạy test rollback');
    const payload = { paymentMethod: rebuilt ? 'bank' : 'cod', shippingName: 'Checkout Test', shippingPhone: '0900000000',
      shippingEmail: 'test@example.invalid', shippingAddress: 'Test street', shippingCity: 'Test city', shippingState: 'Test state' };
    const saved = await cart.upsertCart(userId, null, [{ bookId: Number(book.id), quantity: 1 }]);
    assert.equal(saved[0].book_id, book.id);
    const created = await orders.createOrder(userId, payload);
    assert.ok(created.orderId > 0);
    const auth = { id: userId, email: 'test@example.invalid', roles: ['user'], permissions: ['orders.read'] };
    const listed = await orders.listOrders(auth, { page: 1, limit: 20 });
    assert.equal(listed.meta.total, 1);
    assert.equal(listed.data[0].items[0].bookId, String(book.id));
    assert.ok(Number.isFinite(listed.data[0].items[0].price));
    if (rebuilt) {
      assert.equal(created.item.shippingAddress.city, payload.shippingCity);
      assert.equal(created.item.shippingAddress.street, payload.shippingAddress);
      assert.equal(created.item.paymentMethod, 'bank_transfer');
    }
    let after = (await new sql.Request(outer).input('id', sql.BigInt, book.id)
      .query(`SELECT ${stockColumn} AS stock,sold_count FROM books WHERE id=@id`)).recordset[0];
    assert.equal(after.stock, book.stock - 1);
    assert.equal(after.sold_count, book.sold_count + 1);
    assert.equal((await cart.getCart(userId, null)).length, 0);
    await assert.rejects(() => orders.confirmDeliveryByCustomer(userId, created.orderId), e => e.statusCode === 400);
    await orders.updateOrderStatus(created.orderId, 'shipping', undefined, userId);
    await orders.confirmDeliveryByCustomer(userId, created.orderId);
    assert.equal((await orders.listOrders(auth, { page: 1, limit: 20 })).data[0].status, 'completed');
    await cart.upsertCart(userId, null, [{ bookId: Number(book.id), quantity: 1 }]);
    const cancelled = await orders.createOrder(userId, payload);
    await orders.updateOrderStatus(cancelled.orderId, 'cancelled', 'Test rollback', userId);
    after = (await new sql.Request(outer).input('id', sql.BigInt, book.id)
      .query(`SELECT ${stockColumn} AS stock,sold_count FROM books WHERE id=@id`)).recordset[0];
    assert.equal(after.stock, book.stock - 1);
    assert.equal(after.sold_count, book.sold_count + 1);
    assert.equal((await orders.listOrders(auth, { page: 1, limit: 20 })).meta.total, 2);
    await cart.upsertCart(userId, null, []);
    assert.equal((await cart.getCart(userId, null)).length, 0);
    await assert.rejects(() => orders.createOrder(userId, payload), e => e.statusCode === 400);
    console.log('PASS: cart → create order → list own orders → stock/log transaction → received/cancel → empty cart');
  } catch (error) { console.error('FAIL:', error.message); process.exitCode = 1; }
  finally {
    if (outer) try { await outer.rollback(); console.log('Checkout fixture ROLLBACK completed'); } catch (error) { console.error('Rollback:', error.message); process.exitCode = 1; }
    await db.closeDb();
  }
})();
