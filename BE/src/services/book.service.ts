/** CRUD sách theo schema thực tế; sách, ảnh và tags được lưu trong cùng transaction. */
import { randomUUID } from "node:crypto";
import { getDb, sql } from "../config/db";
import { parsePagination } from "../utils/pagination";
import { AppError } from "../utils/appError";
import { usesRebuiltStoreSchema } from "../utils/storeSchema";
import { createBookSchema, updateBookSchema,adminBookListSchema } from "../validators/books.schemas";
import { visibleCategorySql } from "../utils/categoryVisibility";

const relationsSql = (rebuilt: boolean) => `
  (SELECT bi.image_url FROM book_images bi WHERE bi.book_id=b.id
   ORDER BY bi.is_primary DESC, bi.display_order, bi.id FOR JSON PATH) AS images_json,
  (${rebuilt
    ? "SELECT t.name AS tag FROM book_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.book_id=b.id ORDER BY t.name"
    : "SELECT bt.tag FROM book_tags bt WHERE bt.book_id=b.id ORDER BY bt.id"} FOR JSON PATH) AS tags_json`;

const mapBookRow = (row: Record<string, unknown>, rebuilt: boolean) => {
  const images = (JSON.parse(String(row.images_json ?? "[]")) as Array<{ image_url: string }>).map((image) => image.image_url);
  const tags = (JSON.parse(String(row.tags_json ?? "[]")) as Array<{ tag: string }>).map((tag) => tag.tag);
  const { images_json, tags_json, ...book } = row;
  return { ...book, images, tags, image_url: images[0] ?? null,
    stock: rebuilt ? row.stock_quantity ?? row.stock : row.stock,
    discount: rebuilt ? row.discount_percent ?? row.discount : row.discount,
    featured: rebuilt ? row.is_featured ?? row.featured : row.featured,
    bestseller: rebuilt ? row.is_bestseller ?? row.bestseller : row.bestseller,
    publish_date: rebuilt ? row.publication_year ? `${row.publication_year}-01-01` : null : row.publish_date,
    format: rebuilt ? row.cover_type ?? null : null,
    isActive:!!row.is_active,categoryParentId:row.category_parent_id==null?null:String(row.category_parent_id),
    categoryVisible:row.category_visible===undefined?true:!!row.category_visible,
    supportsTrending: !rebuilt, supportsFormat: rebuilt };
};

export const listAdminBooks=async(query:ReturnType<typeof adminBookListSchema.parse>)=>{
  const rebuilt=await usesRebuiltStoreSchema();const stock=rebuilt?'b.stock_quantity':'b.stock';
  const discount=rebuilt?'b.discount_percent':'b.discount';
  const sorts:Record<string,string>={newest:'b.created_at DESC',oldest:'b.created_at ASC','title-asc':'b.title ASC','title-desc':'b.title DESC',
    'price-asc':`b.price*(1-${discount}/100.0) ASC`,'price-desc':`b.price*(1-${discount}/100.0) DESC`,'stock-asc':`${stock} ASC`,'stock-desc':`${stock} DESC`};
  const filter=`b.is_deleted=0 AND (@search IS NULL OR b.title LIKE @search ESCAPE '~' OR b.author LIKE @search ESCAPE '~' OR b.isbn LIKE @search ESCAPE '~')
    AND (@parent IS NULL OR c.id=@parent OR c.parent_id=@parent) AND (@category IS NULL OR c.id=@category)
    AND (@status='all' OR (@status='active' AND b.is_active=1) OR (@status='inactive' AND b.is_active=0))
    AND (@stock='all' OR (@stock='in-stock' AND ${stock}>0) OR (@stock='out-of-stock' AND ${stock}=0) OR (@stock='low-stock' AND ${stock} BETWEEN 1 AND 10))`;
  const search=query.search?.replace(/[~%_\[]/g,'~$&');
  const rs=await(await getDb()).request().input('search',sql.NVarChar(520),search?`%${search}%`:null)
    .input('parent',sql.BigInt,query.parentCategoryId??null).input('category',sql.BigInt,query.categoryId??null)
    .input('status',sql.NVarChar(20),query.status).input('stock',sql.NVarChar(20),query.stock)
    .input('offset',sql.Int,(query.page-1)*query.limit).input('limit',sql.Int,query.limit)
    .query(`SELECT b.*${rebuilt?",(SELECT TOP 1 it.unit_cost FROM inventory_transactions it WHERE it.book_id=b.id AND it.unit_cost IS NOT NULL ORDER BY it.created_at DESC,it.id DESC) AS import_price":""},c.name AS category_name,c.parent_id AS category_parent_id,
      CASE WHEN ${visibleCategorySql()} THEN 1 ELSE 0 END AS category_visible,${relationsSql(rebuilt)}
      FROM books b JOIN categories c ON c.id=b.category_id WHERE ${filter}
      ORDER BY ${sorts[query.sort]},b.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      SELECT COUNT(*) AS total FROM books b JOIN categories c ON c.id=b.category_id WHERE ${filter};`);
  const sets=rs.recordsets as unknown as Array<Array<Record<string,unknown>>>;
  return {data:sets[0].map(r=>mapBookRow(r,rebuilt)),meta:{page:query.page,limit:query.limit,total:Number(sets[1][0].total)}};
};

export const listBooks = async (query: Record<string, unknown>) => {
  const { page, limit, offset } = parsePagination(query);
  const rebuilt = await usesRebuiltStoreSchema();
  const fields = rebuilt
    ? "b.discount_percent,b.stock_quantity,b.publication_year,b.cover_type,b.is_featured,b.is_bestseller,CAST(0 AS BIT) AS trending"
    : "b.discount,b.stock,b.publish_date,b.import_price,b.featured,b.bestseller,b.trending";
  const rs = await (await getDb()).request()
    .input("search", sql.NVarChar(255), query.search ? `%${String(query.search).trim()}%` : null)
    .input("categoryId", sql.BigInt, query.categoryId ? Number(query.categoryId) : null)
    .input("limit", sql.Int, limit).input("offset", sql.Int, offset)
    .query(`SELECT b.id,b.title,b.author,b.publisher,b.isbn,b.description,b.price,b.pages,b.language,
      b.rating,b.review_count,b.sold_count,b.category_id,b.is_new,b.created_at,b.updated_at,b.is_active,
      ${fields},c.name AS category_name,c.parent_id AS category_parent_id,${relationsSql(rebuilt)}
      FROM books b JOIN categories c ON c.id=b.category_id
      WHERE b.is_deleted=0 AND b.is_active=1 AND ${visibleCategorySql()}
        AND (@search IS NULL OR b.title LIKE @search OR b.author LIKE @search)
        AND (@categoryId IS NULL OR b.category_id=@categoryId OR c.parent_id=@categoryId)
      ORDER BY b.created_at DESC,b.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      SELECT COUNT(*) AS total FROM books b JOIN categories c ON c.id=b.category_id WHERE b.is_deleted=0 AND b.is_active=1 AND ${visibleCategorySql()}
        AND (@search IS NULL OR b.title LIKE @search OR b.author LIKE @search)
        AND (@categoryId IS NULL OR b.category_id=@categoryId OR c.parent_id=@categoryId);`);
  const sets = rs.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  return { data: sets[0].map((row) => mapBookRow(row, rebuilt)), meta: { page, limit, total: Number(sets[1][0].total) } };
};

export const getBookById = async (id: number,admin=false) => {
  const rebuilt = await usesRebuiltStoreSchema();
  const rs = await (await getDb()).request().input("id", sql.BigInt, id).query(`
    SELECT b.*,c.name AS category_name,c.parent_id AS category_parent_id,CASE WHEN ${visibleCategorySql()} THEN 1 ELSE 0 END AS category_visible,${relationsSql(rebuilt)}
    FROM books b JOIN categories c ON c.id=b.category_id WHERE b.id=@id AND b.is_deleted=0 ${admin?'':`AND b.is_active=1 AND ${visibleCategorySql()}`}`);
  if (!rs.recordset.length) throw new AppError(404, "Không tìm thấy sách");
  return mapBookRow(rs.recordset[0], rebuilt);
};

const imageUrls = (payload: Record<string, unknown>): string[] | undefined => {
  // Mảng là nguồn chính: images=[] phải xóa hết ảnh, không fallback sang image cũ.
  if (Array.isArray(payload.images)) return [...new Set(payload.images as string[])];
  if (payload.image !== undefined) return payload.image ? [String(payload.image)] : [];
  return undefined;
};

const replaceImages = async (tx: sql.Transaction, id: number, urls: string[]) => {
  await new sql.Request(tx).input("id", sql.BigInt, id).query("DELETE FROM book_images WHERE book_id=@id");
  for (const [index, url] of urls.entries()) {
    await new sql.Request(tx).input("id", sql.BigInt, id).input("url", sql.NVarChar(500), url)
      .input("primary", sql.Bit, index === 0).input("position", sql.Int, index + 1)
      .query("INSERT INTO book_images(book_id,image_url,is_primary,display_order,created_at) VALUES(@id,@url,@primary,@position,GETUTCDATE())");
  }
};

const replaceTags = async (tx: sql.Transaction, id: number, names: string[], rebuilt: boolean) => {
  const unique = [...new Map(names.map((name) => [name.toLocaleLowerCase(), name])).values()].sort();
  await new sql.Request(tx).input("id", sql.BigInt, id).query("DELETE FROM book_tags WHERE book_id=@id");
  const linked = new Set<number>();
  for (const name of unique) {
    if (!rebuilt) {
      await new sql.Request(tx).input("id", sql.BigInt, id).input("tag", sql.NVarChar(50), name)
        .query("INSERT INTO book_tags(book_id,tag,created_at) VALUES(@id,@tag,GETUTCDATE())");
      continue;
    }
    const tag = await new sql.Request(tx).input("name", sql.NVarChar(100), name)
      .query("SELECT TOP 1 id FROM tags WITH (UPDLOCK,HOLDLOCK) WHERE name=@name");
    let tagId: number;
    if (tag.recordset.length) tagId = Number(tag.recordset[0].id);
    else {
      const prefix = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70);
      const created = await new sql.Request(tx).input("name", sql.NVarChar(100), name)
        .input("slug", sql.NVarChar(120), `${prefix || "tag"}-${randomUUID()}`)
        .query("INSERT INTO tags(name,slug) OUTPUT INSERTED.id VALUES(@name,@slug)");
      tagId = Number(created.recordset[0].id);
    }
    if (linked.has(tagId)) continue;
    linked.add(tagId);
    await new sql.Request(tx).input("id", sql.BigInt, id).input("tagId", sql.Int, tagId)
      .query("INSERT INTO book_tags(book_id,tag_id,created_at) VALUES(@id,@tagId,GETUTCDATE())");
  }
};

/** Tên cột được chọn từ mapping cố định, không lấy trực tiếp từ body. */
const scalarFields = (payload: Record<string, unknown>, rebuilt: boolean) => {
  if (rebuilt && payload.trending === true) throw new AppError(400, "Schema hiện tại chưa hỗ trợ cờ Xu hướng");
  const definitions = [
    ["title", "title", sql.NVarChar(255)], ["author", "author", sql.NVarChar(255)],
    ["isbn", "isbn", sql.NVarChar(20)], ["publisher", "publisher", sql.NVarChar(255)],
    ["categoryId", "category_id", sql.BigInt], ["description", "description", sql.NVarChar(sql.MAX)],
    ["price", "price", sql.Decimal(18, 2)], ["discount", rebuilt ? "discount_percent" : "discount", sql.Decimal(5, 2)],
    ["stock", rebuilt ? "stock_quantity" : "stock", sql.Int], ["pages", "pages", sql.Int],
    ["language", "language", sql.NVarChar(50)], ["rating", "rating", sql.Decimal(3, 2)],
    ["reviewCount", "review_count", sql.Int], ["soldCount", "sold_count", sql.Int],
    ["featured", rebuilt ? "is_featured" : "featured", sql.Bit],
    ["bestseller", rebuilt ? "is_bestseller" : "bestseller", sql.Bit], ["isNew", "is_new", sql.Bit],['isActive','is_active',sql.Bit]
  ] as const;
  const entries: Array<{ key: string; column: string; type: sql.ISqlType | (() => sql.ISqlType); value: unknown }> = [];
  for (const [key, column, type] of definitions) if (payload[key] !== undefined) {
    entries.push({ key, column, type, value: key === "isbn" ? payload[key] || null : payload[key] });
  }
  if (payload.publishDate !== undefined) entries.push({ key: "publishDate", column: rebuilt ? "publication_year" : "publish_date",
    type: rebuilt ? sql.Int : sql.Date, value: rebuilt && payload.publishDate ? Number(String(payload.publishDate).slice(0, 4)) : payload.publishDate });
  if (rebuilt && payload.format !== undefined) entries.push({ key: "format", column: "cover_type", type: sql.NVarChar(100), value: payload.format });
  if (!rebuilt && payload.trending !== undefined) entries.push({ key: "trending", column: "trending", type: sql.Bit, value: payload.trending });
  if (!rebuilt && payload.importPrice !== undefined) entries.push({ key: "importPrice", column: "import_price", type: sql.Decimal(18, 2), value: payload.importPrice });
  return entries;
};

const writeBook = async (id: number | null, payload: Record<string, unknown>,createdBy:number|null=null) => {
  const rebuilt = await usesRebuiltStoreSchema();
  const fields = scalarFields(payload, rebuilt);
  const tx = new sql.Transaction(await getDb());
  await tx.begin();
  let savedId: number;
  try {
    const lock=await new sql.Request(tx).query(`DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'bookarazi:catalog',
      @LockMode='Shared',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r AS result;`);
    if(Number(lock.recordset[0].result)<0)throw new AppError(409,'Danh mục đang thay đổi, vui lòng thử lại');
    let current:Record<string,unknown>|undefined;
    if (id !== null) {
      const existing = await new sql.Request(tx).input("id", sql.BigInt, id)
        .query("SELECT id,category_id,is_active FROM books WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND is_deleted=0");
      if (!existing.recordset.length) throw new AppError(404, "Không tìm thấy sách");
      current=existing.recordset[0];
    }
    const categoryId=Number(payload.categoryId??current?.category_id);
    const category=await new sql.Request(tx).input('id',sql.BigInt,categoryId).query(`SELECT c.id,CASE WHEN ${visibleCategorySql()} THEN 1 ELSE 0 END AS visible
      FROM categories c WHERE c.id=@id AND c.is_deleted=0`);
    if(!category.recordset.length)throw new AppError(400,'Danh mục không tồn tại hoặc đã xóa');
    const categoryChanged=payload.categoryId!==undefined&&Number(payload.categoryId)!==Number(current?.category_id);
    if((id===null||categoryChanged||(payload.isActive===true&&!current?.is_active))&&!category.recordset[0].visible)
      throw new AppError(400,'Chọn danh mục đang hiển thị, gồm cả danh mục cha');
    const request = new sql.Request(tx);
    for (const field of fields) request.input(field.key, field.type, field.value);
    if (id === null) {
      const columns = fields.map((field) => field.column);
      const values = fields.map((field) => `@${field.key}`);
      if (rebuilt) { columns.push("slug"); values.push("@slug"); request.input("slug", sql.NVarChar(550), `book-${randomUUID()}`); }
      if(payload.isActive===undefined){columns.push('is_active');values.push('1');}
      columns.push("is_deleted", "created_at", "updated_at");
      values.push("0", "GETUTCDATE()", "GETUTCDATE()");
      const inserted = await request.query(`INSERT INTO books(${columns.join(",")}) OUTPUT INSERTED.id VALUES(${values.join(",")})`);
      savedId = Number(inserted.recordset[0].id);
      if(Number(payload.stock)>0){
        const inventory=new sql.Request(tx).input('bookId',sql.BigInt,savedId).input('quantity',sql.Int,Number(payload.stock))
          .input('createdBy',sql.BigInt,createdBy).input('cost',sql.Decimal(18,2),payload.importPrice??null);
        await inventory.query(rebuilt?`INSERT INTO inventory_transactions(book_id,transaction_type,quantity_delta,quantity_before,quantity_after,unit_cost,note,created_by)
          VALUES(@bookId,'opening',@quantity,0,@quantity,@cost,N'Tồn ban đầu khi tạo sách',@createdBy)`:
          `INSERT INTO inventory_transactions(book_id,transaction_type,quantity,import_price,note,created_by,created_at)
          VALUES(@bookId,'adjustment',@quantity,@cost,N'Tồn ban đầu khi tạo sách',@createdBy,GETUTCDATE())`);
      }
    } else {
      savedId = id;
      request.input("id", sql.BigInt, id);
      await request.query(`UPDATE books SET ${[...fields.map((field) => `${field.column}=@${field.key}`), "updated_at=GETUTCDATE()"].join(",")} WHERE id=@id`);
    }
    const urls = imageUrls(payload);
    if (urls !== undefined) await replaceImages(tx, savedId, urls);
    if (Array.isArray(payload.tags)) await replaceTags(tx, savedId, payload.tags as string[], rebuilt);
    await tx.commit();
  } catch (error) {
    try { await tx.rollback(); } catch { /* SQL đã rollback */ }
    const number = (error as { number?: number }).number;
    if (number === 2601 || number === 2627) throw new AppError(409, "ISBN hoặc dữ liệu sách bị trùng");
    if (number === 547) throw new AppError(400, "Danh mục hoặc dữ liệu sách không hợp lệ");
    throw error;
  }
  return getBookById(savedId,true);
};

export const createBook = async (payload: Record<string, unknown>,createdBy:number|null=null) => writeBook(null, {
  discount: 0, rating: 0, reviewCount: 0, soldCount: 0, featured: false, bestseller: false, isNew: true,
  ...createBookSchema.parse(payload)
},createdBy);
export const updateBook = async (id: number, payload: Record<string, unknown>) => {
  if(payload.stock!==undefined)throw new AppError(400,'Cập nhật tồn kho qua nghiệp vụ nhập/xuất kho');
  if(payload.rating!==undefined||payload.reviewCount!==undefined||payload.soldCount!==undefined)
    throw new AppError(400,'Chỉ số đánh giá và số lượng đã bán được cập nhật bởi nghiệp vụ');
  return writeBook(id, updateBookSchema.parse(payload));
};

export const deleteBook = async (id: number) => {
  const rebuilt = await usesRebuiltStoreSchema();
  const rs = await (await getDb()).request().input("id", sql.BigInt, id)
    .query(`UPDATE books SET is_deleted=1,updated_at=GETUTCDATE()${rebuilt ? "" : ",deleted_at=GETUTCDATE()"} WHERE id=@id AND is_deleted=0`);
  if (!rs.rowsAffected[0]) throw new AppError(404, "Không tìm thấy sách");
};
