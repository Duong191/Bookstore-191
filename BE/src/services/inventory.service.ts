/** File này xử lý nghiệp vụ tồn kho và giao dịch kho. */
import { getDb, sql } from "../config/db";
import { parsePagination } from "../utils/pagination";
import {usesRebuiltStoreSchema} from '../utils/storeSchema';
import {AppError} from '../utils/appError';

export type InventoryTransactionItem = {
  id: string;
  bookId: string;
  type: "import" | "export";
  quantity: number;
  importPrice?: number;
  note: string;
  userId: string;
  createdAt: string;
  creatorName?: string;
};

const mapInventoryTransactionRow = (row: Record<string, unknown>): InventoryTransactionItem => {
  const rawType = String(row.transaction_type ?? "").toLowerCase();
  const qty = Number(row.quantity);
  const quantity = Number.isFinite(qty) ? Math.abs(qty) : 0;

  let uiType: "import" | "export" = "import";
  if (rawType === "import") uiType = "import";
  else if (rawType === "export" || rawType === "order" ||rawType==='sale') uiType = "export";
  else if (rawType === "adjustment"||rawType==='cancel_restore'||rawType==='return') uiType = qty < 0 ? "export" : "import";

  let createdIso: string;
  const ca = row.created_at as Date | string | undefined;
  if (ca instanceof Date) createdIso = ca.toISOString();
  else createdIso = new Date(String(ca)).toISOString();

  const cf = row.creator_first_name != null ? String(row.creator_first_name).trim() : "";
  const cl = row.creator_last_name != null ? String(row.creator_last_name).trim() : "";
  const creatorName = [cf, cl].filter(Boolean).join(" ").trim();

  let importPrice: number | undefined;
  if (row.import_price != null && row.import_price !== "") {
    const ip = Number(row.import_price);
    if (Number.isFinite(ip)) importPrice = ip;
  }

  return {
    id: String(row.id),
    bookId: String(row.book_id),
    type: uiType,
    quantity,
    ...(importPrice !== undefined ? { importPrice } : {}),
    note: row.note != null ? String(row.note) : "",
    userId: row.created_by != null ? String(row.created_by) : "",
    createdAt: createdIso,
    ...(creatorName ? { creatorName } : {})
  };
};

/** Lịch sử giao dịch từ `inventory_transactions` (FE hiển thị sau reload / đóng tab). */
export const listInventoryTransactions = async (
  query: Record<string, unknown>
): Promise<{ items: InventoryTransactionItem[]; meta: { page: number; limit: number; total: number } }> => {
  const pageRaw = Number(query.page ?? 1);
  const limitRaw = Number(query.limit ?? 200);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200;
  const offset = (page - 1) * limit;

  const pool = await getDb();
  const rebuilt=await usesRebuiltStoreSchema();
  const rs = await pool
    .request()
    .input("limit", sql.Int, limit)
    .input("offset", sql.Int, offset)
    .query(
      `SELECT it.id, it.book_id, it.transaction_type, ${rebuilt?'it.quantity_delta AS quantity,it.unit_cost AS import_price':'it.quantity,it.import_price'}, it.note,
              it.created_by, it.created_at,
              u.first_name AS creator_first_name, u.last_name AS creator_last_name
       FROM inventory_transactions it
       LEFT JOIN users u ON u.id = it.created_by AND u.is_deleted = 0
       ORDER BY it.created_at DESC, it.id DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

       SELECT COUNT(*) AS total FROM inventory_transactions;`
    );

  const recordsets = rs.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const rows = recordsets[0] ?? [];
  const total = Number((recordsets[1]?.[0] as { total?: number })?.total ?? 0);

  return {
    items: rows.map((r) => mapInventoryTransactionRow(r)),
    meta: { page, limit, total }
  };
};

export const listInventory = async (query: Record<string, unknown>) => {
  const { page, limit, offset } = parsePagination(query);
  const search = String(query.search ?? "").trim();
  const pool = await getDb();
  if(await usesRebuiltStoreSchema()){
    const rs=await pool.request().input('search',sql.NVarChar(255),search?`%${search}%`:null).input('limit',sql.Int,limit).input('offset',sql.Int,offset)
      .query(`SELECT b.id,b.title,b.author,b.stock_quantity AS current_stock,b.price AS selling_price,cost.unit_cost AS import_price,
        b.stock_quantity*COALESCE(cost.unit_cost,0) AS stock_value,
        c.name AS category_name,(SELECT COALESCE(SUM(it.quantity_delta),0) FROM inventory_transactions it WHERE it.book_id=b.id AND it.transaction_type='import') AS total_imported
        FROM books b JOIN categories c ON c.id=b.category_id OUTER APPLY
          (SELECT TOP 1 it.unit_cost FROM inventory_transactions it WHERE it.book_id=b.id AND it.unit_cost IS NOT NULL ORDER BY it.created_at DESC,it.id DESC) cost
        WHERE b.is_deleted=0 AND (@search IS NULL OR b.title LIKE @search OR b.author LIKE @search)
        ORDER BY b.stock_quantity,b.id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
        SELECT COUNT(*) AS total FROM books WHERE is_deleted=0 AND (@search IS NULL OR title LIKE @search OR author LIKE @search);`);
    const sets=rs.recordsets as unknown as Array<Array<Record<string,unknown>>>;
    return {data:sets[0],meta:{page,limit,total:Number(sets[1][0].total)}};
  }
  const rs = await pool
    .request()
    .input("search", sql.NVarChar(255), search ? `%${search}%` : null)
    .input("limit", sql.Int, limit)
    .input("offset", sql.Int, offset)
    .query(
      `SELECT * FROM v_inventory_summary
       WHERE @search IS NULL OR title LIKE @search OR author LIKE @search
       ORDER BY current_stock ASC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
       SELECT COUNT(*) AS total FROM v_inventory_summary WHERE @search IS NULL OR title LIKE @search OR author LIKE @search;`
    );

  const recordsets = rs.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  return {
    data: recordsets[0],
    meta: { page, limit, total: Number(recordsets[1][0].total) }
  };
};

export const createInventoryTransaction = async (payload: {
  bookId: number;
  transactionType: string;
  quantity: number;
  importPrice?: number;
  supplierId?: number;
  note?: string;
  createdBy: number;
}) => {
  if(!Number.isSafeInteger(payload.quantity)||payload.quantity===0||
    (payload.transactionType==='import'&&payload.quantity<0)||(payload.transactionType==='export'&&payload.quantity>0))
    throw new AppError(400,'Nhập kho dùng số dương, xuất kho dùng số âm, số lượng phải khác 0');
  const pool = await getDb();
  if(await usesRebuiltStoreSchema()){
    try{await pool.request().input('BookId',sql.Int,payload.bookId).input('QuantityDelta',sql.Int,payload.quantity)
      .input('TransactionType',sql.NVarChar(30),payload.transactionType==='export'?'adjustment':payload.transactionType)
      .input('SupplierId',sql.Int,payload.supplierId??null).input('UnitCost',sql.Decimal(18,2),payload.importPrice??null)
      .input('Note',sql.NVarChar(1000),payload.note??null).input('CreatedBy',sql.Int,payload.createdBy).execute('sp_AdjustInventory');return;
    }catch(error){const n=(error as {number?:number}).number;if(n&&n>=50001&&n<=50003)throw new AppError(n===50002?404:400,(error as Error).message);throw error;}
  }
  await pool
    .request()
    .input("p_book_id", sql.BigInt, payload.bookId)
    .input("p_transaction_type", sql.NVarChar(20), payload.transactionType)
    .input("p_quantity", sql.Int, payload.quantity)
    .input("p_import_price", sql.Decimal(18, 2), payload.importPrice ?? null)
    .input("p_supplier_id", sql.BigInt, payload.supplierId ?? null)
    .input("p_note", sql.NVarChar(sql.MAX), payload.note ?? null)
    .input("p_created_by", sql.BigInt, payload.createdBy)
    .execute("sp_inventory_transaction");
};
