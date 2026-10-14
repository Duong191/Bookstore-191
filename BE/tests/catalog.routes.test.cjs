require('ts-node').register({transpileOnly:true});
const test=require('node:test'),assert=require('node:assert/strict');
const rbac=require('../src/services/rbac.service'),categories=require('../src/services/adminCategories.service'),books=require('../src/services/book.service');
const {signAccessToken}=require('../src/utils/jwt');
rbac.getUserAuthData=async id=>({id,email:'test@example.invalid',roles:[id===1?'admin':id===2?'staff':'user'],permissions:[]});
categories.listAdminCategories=async tree=>({items:[{id:'901',name:'Dynamic',parentId:null,children:tree?[{id:'2345',parentId:'901'}]:[]}]});
categories.createCategory=async body=>({id:'99',...body});categories.updateCategory=async(id,body)=>({id:String(id),...body});categories.deleteCategory=async()=>{};
books.listAdminBooks=async query=>({data:[],meta:{page:query.page,limit:query.limit,total:0}});
books.getBookById=async()=>({id:1,isActive:false});books.updateBook=async(id,body)=>({id,...body});
const app=require('../src/app').default;let server,base;
test.before(async()=>{server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}/api/admin`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});
const call=(id,path,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:`Bearer ${signAccessToken({sub:id,email:'test@example.invalid'})}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('ADMIN category tree; không token 401, USER 403, STAFF đọc nhưng không ghi danh mục',async()=>{
  assert.equal((await call(null,'/categories?tree=true')).status,401);assert.equal((await call(3,'/categories')).status,403);
  const response=await call(1,'/categories?tree=true');assert.equal(response.status,200);assert.equal((await response.json()).items[0].children[0].id,'2345');
  assert.equal((await call(2,'/categories')).status,200);
  for(const [path,method,body]of [['/categories','POST',{name:'A'}],['/categories/1','PATCH',{name:'A'}],['/categories/1/status','PATCH',{isActive:false}],['/categories/1','DELETE']])assert.equal((await call(2,path,method,body)).status,403);
});
test('Danh mục/admin list: validate ID/body/query, không nhận sort SQL tùy ý',async()=>{
  for(const [path,method,body]of [['/categories?tree=oops'],['/categories','POST',{name:' '}],['/categories/0','PATCH',{name:'A'}],['/categories/1/status','PATCH',{isActive:'false'}],['/books?sort=DROP'],['/books?page=abc'],['/books?limit=101']])assert.equal((await call(1,path,method,body)).status,400,path);
});
test('Admin/staff giữ quyền quản lý sách, USER không gọi list/status',async()=>{
  assert.equal((await call(1,'/books')).status,200);assert.equal((await call(2,'/books')).status,200);
  assert.equal((await call(3,'/books')).status,403);assert.equal((await call(null,'/books')).status,401);
  assert.equal((await call(2,'/books/1/status','PATCH',{isActive:false})).status,200);
  assert.equal((await call(3,'/books/1/status','PATCH',{isActive:false})).status,403);
});
