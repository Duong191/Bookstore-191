/** Danh mục hai cấp, dữ liệu cây lấy từ DB, bảo vệ quan hệ sách và danh mục con. */
import { getDb,sql } from "../config/db";
import { AppError } from "../utils/appError";
import { createCategorySchema,updateCategorySchema } from "../validators/categories.schemas";

export type CategoryItem={id:string;name:string;slug:string;parentId:string|null;description:string;icon:string;isActive:boolean;isVisible:boolean;sortOrder:number;bookCount:number;children:CategoryItem[]};
const select=`SELECT c.*, (SELECT COUNT(*) FROM books b WHERE b.category_id=c.id AND b.is_deleted=0) AS book_count
  FROM categories c WHERE c.is_deleted=0 ORDER BY c.display_order,c.id`;
export const readCategoryItems=async(request:sql.Request):Promise<CategoryItem[]>=>{
  const rs=await request.query(select);
  const items=rs.recordset.map((r):CategoryItem=>({id:String(r.id),name:r.name,slug:r.slug,parentId:r.parent_id==null?null:String(r.parent_id),
    description:r.description??"",icon:r.icon??"",isActive:!!r.is_active,isVisible:!!r.is_active,sortOrder:Number(r.display_order),bookCount:Number(r.book_count),children:[]}));
  const byId=new Map(items.map(i=>[i.id,i]));
  for(const i of items)if(i.parentId)i.isVisible=i.isActive&&!!byId.get(i.parentId)?.isActive;
  return items;
};
export const categoryTree=(items:CategoryItem[])=>{
  const copies=items.map(i=>({...i,children:[] as CategoryItem[]}));
  const byId=new Map(copies.map(i=>[i.id,i]));
  const roots:CategoryItem[]=[];
  for(const i of copies){const parent=i.parentId?byId.get(i.parentId):null;if(parent)parent.children.push(i);else roots.push(i);}
  return roots;
};
export const listAdminCategories=async(tree:boolean)=>{
  const items=await readCategoryItems((await getDb()).request());
  return {items:tree?categoryTree(items):items};
};
export const getAdminCategory=async(id:number)=>{
  const item=(await listAdminCategories(false)).items.find(i=>i.id===String(id));
  if(!item)throw new AppError(404,"Không tìm thấy danh mục");return item;
};
const slugify=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[đĐ]/g,"d").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);

const mutate=async<T>(action:(tx:sql.Transaction)=>Promise<T>)=>{
  const tx=new sql.Transaction(await getDb());await tx.begin();
  try{
    const lock=await new sql.Request(tx).query(`DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'bookarazi:catalog',
      @LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r AS result;`);
    if(Number(lock.recordset[0].result)<0)throw new AppError(409,"Danh mục đang được cập nhật, vui lòng thử lại");
    const result=await action(tx);await tx.commit();return result;
  }catch(error){try{await tx.rollback();}catch{}const n=(error as {number?:number}).number;
    if(n===2601||n===2627)throw new AppError(409,"Tên hoặc slug danh mục đã tồn tại");throw error;}
};
const assertParent=async(tx:sql.Transaction,id:number|null,parentId:number|null,isActive:boolean)=>{
  if(parentId===null)return;
  if(parentId===id)throw new AppError(400,"Danh mục không thể là cha của chính nó");
  const parent=await new sql.Request(tx).input("id",sql.BigInt,parentId).query("SELECT parent_id,is_active FROM categories WHERE id=@id AND is_deleted=0");
  if(!parent.recordset.length)throw new AppError(400,"Danh mục cha không tồn tại hoặc đã bị xóa");
  if(parent.recordset[0].parent_id!=null)throw new AppError(400,"Danh mục cha phải là danh mục gốc (hệ thống hai cấp)");
  if(isActive&&!parent.recordset[0].is_active)throw new AppError(400,"Cần hiện danh mục cha trước khi hiện danh mục con");
  if(id!==null){const children=await new sql.Request(tx).input("id",sql.BigInt,id).query("SELECT TOP 1 id FROM categories WHERE parent_id=@id AND is_deleted=0");
    if(children.recordset.length)throw new AppError(409,"Danh mục có danh mục con không thể chuyển thành danh mục con");}
};
const assertName=async(tx:sql.Transaction,name:string,parentId:number|null,id:number|null)=>{
  const rs=await new sql.Request(tx).input('name',sql.NVarChar(100),name).input('parent',sql.BigInt,parentId).input('id',sql.BigInt,id)
    .query(`SELECT TOP 1 id FROM categories WHERE is_deleted=0 AND name=@name AND (@id IS NULL OR id<>@id)
      AND (parent_id=@parent OR (parent_id IS NULL AND @parent IS NULL))`);
  if(rs.recordset.length)throw new AppError(409,'Tên danh mục đã tồn tại trong cùng nhóm');
};
const assertSlug=async(tx:sql.Transaction,slug:string,id:number|null)=>{
  const rs=await new sql.Request(tx).input('slug',sql.NVarChar(100),slug).input('id',sql.BigInt,id)
    .query('SELECT TOP 1 id FROM categories WHERE slug=@slug AND (@id IS NULL OR id<>@id)');
  if(rs.recordset.length)throw new AppError(409,'Slug danh mục đã được sử dụng');
};
export const createCategory=async(body:Record<string,unknown>)=>{
  const input=createCategorySchema.parse(body);const slug=input.slug??slugify(input.name);
  if(!slug)throw new AppError(400,"Vui lòng nhập slug hợp lệ");
  return mutate(async tx=>{
    await assertParent(tx,null,input.parentId??null,input.isActive??true);
    await assertName(tx,input.name,input.parentId??null,null);
    await assertSlug(tx,slug,null);
    const r=await new sql.Request(tx).input("name",sql.NVarChar(100),input.name).input("slug",sql.NVarChar(100),slug)
      .input("parent",sql.BigInt,input.parentId??null).input("description",sql.NVarChar(500),input.description??"")
      .input("icon",sql.NVarChar(50),input.icon??"").input("active",sql.Bit,input.isActive??true).input("sort",sql.Int,input.sortOrder??0)
      .query(`INSERT INTO categories(name,slug,parent_id,description,icon,is_active,display_order,created_at,updated_at,is_deleted)
        OUTPUT INSERTED.id VALUES(@name,@slug,@parent,@description,@icon,@active,@sort,GETUTCDATE(),GETUTCDATE(),0)`);
    const items=await readCategoryItems(new sql.Request(tx));return items.find(i=>i.id===String(r.recordset[0].id))!;
  });
};
export const updateCategory=async(id:number,body:Record<string,unknown>)=>{
  const input=updateCategorySchema.parse(body);
  return mutate(async tx=>{
    const current=(await readCategoryItems(new sql.Request(tx))).find(i=>i.id===String(id));
    if(!current)throw new AppError(404,"Không tìm thấy danh mục");
    const parent=input.parentId!==undefined?input.parentId:current.parentId===null?null:Number(current.parentId);
    const moved=String(parent??'')!==String(current.parentId??'');
    await assertParent(tx,id,parent,(moved||(input.isActive===true&&!current.isActive))&&(input.isActive??current.isActive));
    await assertName(tx,input.name??current.name,parent,id);
    if(input.slug!==undefined)await assertSlug(tx,input.slug,id);
    const request=new sql.Request(tx).input("id",sql.BigInt,id);
    const fields=[['name','name',sql.NVarChar(100)],['slug','slug',sql.NVarChar(100)],['parentId','parent_id',sql.BigInt],
      ['description','description',sql.NVarChar(500)],['icon','icon',sql.NVarChar(50)],['isActive','is_active',sql.Bit],['sortOrder','display_order',sql.Int]] as const;
    const assignments=["updated_at=GETUTCDATE()"];
    for(const [key,col,type]of fields)if(input[key]!==undefined){request.input(key,type,input[key]);assignments.push(`${col}=@${key}`);}
    await request.query(`UPDATE categories SET ${assignments.join(',')} WHERE id=@id`);
    return (await readCategoryItems(new sql.Request(tx))).find(i=>i.id===String(id))!;
  });
};
export const deleteCategory=async(id:number)=>mutate(async tx=>{
  const item=(await readCategoryItems(new sql.Request(tx))).find(i=>i.id===String(id));
  if(!item)throw new AppError(404,"Không tìm thấy danh mục");
  const ids=(await new sql.Request(tx).input("id",sql.BigInt,id).query("SELECT id FROM categories WHERE parent_id=@id AND is_deleted=0")).recordset.map(r=>Number(r.id));
  const children=(await readCategoryItems(new sql.Request(tx))).filter(i=>ids.includes(Number(i.id)));
  if(item.bookCount||children.some(i=>i.bookCount))throw new AppError(409,"Không thể xóa danh mục đang có sách (kể cả sách đã ẩn)");
  if(children.some(i=>i.isActive))throw new AppError(409,"Cần ẩn hoặc xóa danh mục con trước khi xóa danh mục cha");
  // Con đã ẩn và không có sách được xóa mềm cùng cha, tránh tạo danh mục mồ côi.
  await new sql.Request(tx).input("id",sql.BigInt,id).query(`UPDATE categories SET is_active=0,is_deleted=1,deleted_at=GETUTCDATE(),updated_at=GETUTCDATE()
    WHERE id=@id OR (parent_id=@id AND is_deleted=0)`);
});
