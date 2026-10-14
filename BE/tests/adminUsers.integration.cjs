// SQL integration: mọi dữ liệu thử nằm trong transaction ngoài và luôn ROLLBACK.
// Chạy riêng: npm run test:admin-users:db. Không start server/bootstrap/seed.
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const realDb = require('../src/config/db');
const realSql = realDb.sql;
let outer;

// Chuyển commit của service thành savepoint: code chạy SQL thật nhưng không lưu thay đổi test.
class TestTransaction {
  async begin() { await new realSql.Request(outer).query('SAVE TRANSACTION admin_users_test'); }
  async commit() { /* Transaction ngoài chịu trách nhiệm rollback cuối case. */ }
  async rollback() { await new realSql.Request(outer).query('ROLLBACK TRANSACTION admin_users_test'); }
}
function TestRequest(transaction) { return new realSql.Request(transaction instanceof TestTransaction ? outer : transaction); }
const dbAdapter = {
  sql: { ...realSql, Transaction: TestTransaction, Request: TestRequest },
  getDb: async () => ({ request: () => new realSql.Request(outer) })
};
const originalLoad = Module._load;
Module._load = function (name, parent, ...args) {
  if (name === '../config/db' && parent.filename.endsWith('adminUsers.service.ts')) return dbAdapter;
  return originalLoad.call(this, name, parent, ...args);
};
const service = require('../src/services/adminUsers.service');
Module._load = originalLoad;

const input = (role = 'user') => ({ email: `${randomUUID()}@admin-users-test.invalid`, password: 'TestPassword123', firstName: 'Test', lastName: 'Account', phone: '0900000000', role, isActive: true });
let passed = 0;
const run = async (name, operation) => {
  outer = new realSql.Transaction(await realDb.getDb());
  await outer.begin();
  try { await operation(); passed++; console.log(`PASS: ${name}`); }
  finally { try { await outer.rollback(); } finally { outer = null; } }
};
const rejectStatus = (operation, status) => assert.rejects(operation, (err) => err.statusCode === status);

(async () => {
  try {
    const pool = await realDb.getDb();
    const adminRs = await pool.request().query(`SELECT TOP 1 u.id FROM users u WHERE u.is_active=1 AND u.is_deleted=0
      AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin') ORDER BY u.id`);
    if (!adminRs.recordset.length) throw new Error('Cần một ADMIN đang hoạt động để chạy test SQL rollback');
    const actor = Number(adminRs.recordset[0].id);
    await run('create user/customer + bcrypt + detail không chứa mật khẩu', async () => {
      const payload = input();
      const user = await service.createAccount(actor, payload);
      assert.equal(user.role, 'user');
      assert.equal(user.email, payload.email);
      assert.equal('password' in user, false);
      assert.equal('password_hash' in user, false);
      const row = (await new realSql.Request(outer).input('id', realSql.BigInt, Number(user.id)).query('SELECT password_hash FROM users WHERE id=@id')).recordset[0];
      assert.notEqual(row.password_hash, payload.password);
      assert.equal(await bcrypt.compare(payload.password, row.password_hash), true);
      assert.deepEqual(await service.getAccount(Number(user.id)), user);
    });
    await run('email trùng 409, rollback không tạo user/role dư', async () => {
      const payload = input();
      await service.createAccount(actor, payload);
      await rejectStatus(() => service.createAccount(actor, payload), 409);
      const list = await service.listAccounts({ search: payload.email, page: 1, limit: 20 });
      assert.equal(list.meta.total, 1);
    });
    await run('filter tên/email/phone, role, trạng thái, pagination', async () => {
      const payload = input('staff');
      const user = await service.createAccount(actor, payload);
      const list = await service.listAccounts({ search: payload.email, role: 'staff', isActive: 'true', page: 1, limit: 1 });
      assert.equal(list.meta.total, 1);
      assert.equal(list.items[0].id, user.id);
      assert.equal((await service.listAccounts({ search: payload.email, role: 'user', page: 1, limit: 20 })).meta.total, 0);
      assert.equal((await service.listAccounts({ search: '%', page: 1, limit: 20 })).items.some((item) => item.id === user.id), false);
    });
    await run('sửa hồ sơ, null field, status ở PATCH chung, đổi role thay thế role cũ', async () => {
      const user = await service.createAccount(actor, input());
      const id = Number(user.id);
      const updated = await service.updateAccount(actor, id, { firstName: 'Changed', gender: 'Nam', birthDate: '2000-02-29', avatarUrl: '/avatar.png', isActive: false });
      assert.equal(updated.firstName, 'Changed'); assert.equal(updated.birthDate, '2000-02-29'); assert.equal(updated.isActive, false);
      const changed = await service.updateAccountRole(actor, id, 'staff');
      assert.equal(changed.role, 'staff');
      const roles = (await new realSql.Request(outer).input('id', realSql.BigInt, id).query('SELECT role_id FROM user_roles WHERE user_id=@id')).recordset;
      assert.equal(roles.length, 1);
      const cleared = await service.updateAccount(actor, id, { birthDate: null, avatarUrl: null, isActive: true });
      assert.equal(cleared.birthDate, null); assert.equal(cleared.avatarUrl, null); assert.equal(cleared.isActive, true);
    });
    await run('khóa/xóa mềm, giữ row, thu hồi refresh, không xóa chính mình', async () => {
      const user = await service.createAccount(actor, input());
      const id = Number(user.id);
      const newOrders = (await new realSql.Request(outer).query("SELECT COL_LENGTH('dbo.orders','order_code') AS has_code")).recordset[0].has_code;
      const orderInsert = newOrders
        ? `INSERT INTO orders(order_code,user_id,customer_name,customer_phone,shipping_address,subtotal,total_amount)
           OUTPUT INSERTED.id VALUES(@code,@id,N'Test',N'0900000000',N'Test address',100,100)`
        : `INSERT INTO orders(order_number,user_id,total_amount,final_amount,status,payment_method,shipping_name,shipping_phone,shipping_address,shipping_city)
           OUTPUT INSERTED.id VALUES(@code,@id,100,100,'pending','cod',N'Test',N'0900000000',N'Test address',N'Test city')`;
      const order = (await new realSql.Request(outer).input('id', realSql.BigInt, id)
        .input('code', realSql.NVarChar(50), randomUUID()).query(orderInsert)).recordset[0];
      const hasHash = (await new realSql.Request(outer).query("SELECT COL_LENGTH('dbo.refresh_tokens','token_hash') AS has_hash")).recordset[0].has_hash;
      const column = hasHash ? 'token_hash' : 'token';
      await new realSql.Request(outer).input('id', realSql.BigInt, id).input('token', realSql.NVarChar(500), randomUUID())
        .query(`INSERT INTO refresh_tokens(user_id,${column},expires_at,created_at) VALUES(@id,@token,DATEADD(day,7,GETUTCDATE()),GETUTCDATE())`);
      await service.updateAccount(actor, id, { isActive: false });
      assert.equal((await new realSql.Request(outer).input('id', realSql.BigInt, id).query('SELECT COUNT(*) AS total FROM refresh_tokens WHERE user_id=@id')).recordset[0].total, 0);
      await service.deleteAccount(actor, id);
      const row = (await new realSql.Request(outer).input('id', realSql.BigInt, id).query('SELECT is_active,is_deleted FROM users WHERE id=@id')).recordset[0];
      assert.equal(row.is_deleted, true); assert.equal(row.is_active, false);
      assert.equal((await new realSql.Request(outer).input('orderId', realSql.BigInt, order.id)
        .query('SELECT user_id FROM orders WHERE id=@orderId')).recordset[0].user_id, id);
      await rejectStatus(() => service.getAccount(id), 404);
      await rejectStatus(() => service.deleteAccount(actor, actor), 409);
    });
    await run('bảo vệ ADMIN cuối cùng và kiểm tra lại actor trong transaction', async () => {
      const active = (await new realSql.Request(outer).query(`SELECT u.id FROM users u WHERE u.is_active=1 AND u.is_deleted=0
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='admin')`)).recordset;
      if (active.length === 1) {
        await rejectStatus(() => service.updateAccount(actor, actor, { isActive: false }), 409);
        await rejectStatus(() => service.updateAccountRole(actor, actor, 'user'), 409);
      }
      // Chỉ thay đổi tài khoản test để kiểm tra hai admin và quyền vừa bị thu hồi.
      const second = await service.createAccount(actor, input('admin'));
      const secondId = Number(second.id);
      await service.updateAccountRole(secondId, secondId, 'staff');
      await rejectStatus(() => service.createAccount(secondId, input()), 403);
      await rejectStatus(() => service.createAccount(0, input()), 403);
    });
    console.log(`SQL integration: ${passed} nhóm PASS; tất cả transaction test đã ROLLBACK.`);
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  } finally { await realDb.closeDb(); }
})();
