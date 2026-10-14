// Kiểm tra HTTP/auth/validation bằng service stub, không ghi database.
require('ts-node').register({ transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const rbac = require('../src/services/rbac.service');
const service = require('../src/services/adminUsers.service');
const { signAccessToken } = require('../src/utils/jwt');
const schemas = require('../src/validators/adminUsers.schemas');

const users = {
  1: { id: 1, email: 'admin@test.invalid', roles: ['admin'], permissions: [] },
  2: { id: 2, email: 'staff@test.invalid', roles: ['staff'], permissions: ['users.update'] },
  3: { id: 3, email: 'user@test.invalid', roles: ['user'], permissions: [] }
};
rbac.getUserAuthData = async (id) => users[id] ?? null;
let received;
const account = { id: '4', email: 'new@test.invalid', role: 'user', isActive: true };
service.listAccounts = async (query) => { received = query; return { items: [account], meta: { page: query.page, limit: query.limit, total: 1 } }; };
service.getAccount = async (id) => ({ ...account, id: String(id) });
service.createAccount = async (actor, input) => { received = { actor, input }; return account; };
service.updateAccount = async (actor, id, input) => { received = { actor, id, input }; return { ...account, ...input }; };
service.updateAccountRole = async (actor, id, role) => { received = { actor, id, role }; return { ...account, role }; };
service.deleteAccount = async (actor, id) => { received = { actor, id }; };

const app = require('../src/app').default;
let server, base;
test.before(async () => {
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/admin/users`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });
const call = (id, suffix = '', method = 'GET', body) => fetch(base + suffix, {
  method, headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer ${signAccessToken({ sub: id, email: users[id].email })}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});

test('Mọi API quản lý user: không token 401; STAFF/USER 403', async () => {
  for (const [suffix, method, body] of [
    ['', 'GET'], ['/4', 'GET'], ['', 'POST', {}], ['/4', 'PATCH', {}],
    ['/4/role', 'PATCH', { role: 'admin' }], ['/4/status', 'PATCH', { isActive: false }], ['/4', 'DELETE']
  ]) for (const [id, status] of [[null, 401], [2, 403], [3, 403]]) {
    assert.equal((await call(id, suffix, method, body)).status, status, `${method} ${suffix}, user=${id}`);
  }
});
test('ADMIN lấy list: parse/default query, filter và phân trang', async () => {
  const response = await call(1, '?search=someone&role=staff&isActive=false&page=2&limit=5');
  assert.equal(response.status, 200);
  assert.deepEqual(received, { search: 'someone', role: 'staff', isActive: 'false', page: 2, limit: 5 });
  assert.equal((await response.json()).items.length, 1);
});
test('ADMIN tạo: chuẩn hóa email/tên và default role/status trước service', async () => {
  const response = await call(1, '', 'POST', { email: ' NEW@Test.Invalid ', password: 'secret123', firstName: ' Nguyen ', lastName: ' An ' });
  assert.equal(response.status, 201);
  assert.equal(received.actor, 1);
  assert.deepEqual(received.input, { email: 'new@test.invalid', password: 'secret123', firstName: 'Nguyen', lastName: 'An', phone: '', role: 'user', isActive: true });
});
test('ID, role, boolean, ngày, phân trang sai hoặc field vượt quyền đều 400', async () => {
  for (const [suffix, method, body] of [
    ['/0', 'GET'], ['/abc', 'GET'], ['/9007199254740992', 'GET'], ['?page=abc', 'GET'],
    ['?limit=0', 'GET'], ['?isActive=yes', 'GET'], ['/4/role', 'PATCH', { role: 'owner' }],
    ['/4/status', 'PATCH', { isActive: 'false' }], ['/4', 'PATCH', { role: 'admin' }],
    ['/4', 'PATCH', { password: 'secret123' }], ['/4', 'PATCH', {}], ['/4', 'PATCH', { birthDate: '2026-02-30' }]
  ]) assert.equal((await call(1, suffix, method, body)).status, 400, `${method} ${suffix}`);
});
test('PATCH thông tin không cần/không nhận email hay mật khẩu; nullable field được giữ', async () => {
  assert.equal((await call(1, '/4', 'PATCH', { firstName: 'An', birthDate: null, avatarUrl: null })).status, 200);
  assert.deepEqual(received, { actor: 1, id: 4, input: { firstName: 'An', birthDate: null, avatarUrl: null } });
});
test('PATCH role/status và DELETE đúng controller, actor lấy từ token', async () => {
  assert.equal((await call(1, '/4/role', 'PATCH', { role: 'staff' })).status, 200);
  assert.deepEqual(received, { actor: 1, id: 4, role: 'staff' });
  assert.equal((await call(1, '/4/status', 'PATCH', { isActive: false })).status, 200);
  assert.deepEqual(received, { actor: 1, id: 4, input: { isActive: false } });
  assert.equal((await call(1, '/4', 'DELETE')).status, 204);
});
test('Tài khoản khóa hoặc vừa hạ quyền bị chặn với JWT cũ', async () => {
  const admin = users[1];
  users[1] = { ...admin, roles: ['user'] };
  assert.equal((await call(1)).status, 403);
  users[1] = null;
  // Token cũ vẫn ký được: middleware quyết định bằng trạng thái DB hiện tại.
  const token = signAccessToken({ sub: 1, email: admin.email });
  const response = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 401);
  users[1] = admin;
});
test('Password bcrypt không nhận hơn 72 byte; ngày nhuận hợp lệ', () => {
  assert.equal(schemas.createAccountSchema.safeParse({ email: 'a@test.invalid', password: 'đ'.repeat(37), firstName: 'A', lastName: 'B' }).success, false);
  assert.equal(schemas.updateAccountSchema.safeParse({ birthDate: '2024-02-29' }).success, true);
});
