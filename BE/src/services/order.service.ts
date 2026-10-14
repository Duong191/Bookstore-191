/** File này xử lý nghiệp vụ đơn hàng cho user và quản trị. */
import { getDb, sql } from "../config/db";
import { AppError } from "../utils/appError";
import { parsePagination } from "../utils/pagination";
import type { AuthUser } from "../types";
import { usesRebuiltStoreSchema } from "../utils/storeSchema";

function isOrderAdmin(auth: AuthUser): boolean {
  return (
    auth.roles.some((r) => ["admin", "staff"].includes(r)) ||
    auth.permissions.includes("orders.update")
  );
}

function toIso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  if (d == null) return new Date().toISOString();
  return String(d);
}

/** Shape expected by the React app (Bookstore Order type). */
export function mapOrderToApi(orderRow: Record<string, unknown>, itemsRows: Record<string, unknown>[]) {
  let address: Record<string, unknown> = {};
  try {
    const stored = JSON.parse(String(orderRow.shipping_address ?? ""));
    if (stored?.schema === "bookarazi.shipping.v1") address = stored;
  } catch { /* Đơn cũ lưu địa chỉ dạng chuỗi thông thường. */ }
  const items = itemsRows.map((i) => {
    const qty = Number(i.quantity);
    const totalPrice = Number(i.total_price ?? i.line_total);
    const unit = qty > 0 ? totalPrice / qty : Number(i.unit_price);
    return {
      bookId: String(i.book_id),
      quantity: qty,
      price: unit
    };
  });

  return {
    id: String(orderRow.id),
    userId: String(orderRow.user_id),
    items,
    total: Number(orderRow.final_amount ?? orderRow.total_amount),
    status: String(orderRow.status),
    shippingAddress: {
      name: String(orderRow.shipping_name ?? orderRow.customer_name ?? ""),
      phone: String(orderRow.shipping_phone ?? orderRow.customer_phone ?? ""),
      email: String(orderRow.shipping_email ?? orderRow.customer_email ?? ""),
      street: String(address.street ?? orderRow.shipping_address ?? ""),
      city: String(address.city ?? orderRow.shipping_city ?? ""),
      state: String(address.state ?? orderRow.shipping_state ?? ""),
      zipCode: String(address.zipCode ?? orderRow.shipping_zipcode ?? ""),
      country: String(address.country ?? orderRow.shipping_country ?? "Vietnam")
    },
    paymentMethod: String(orderRow.payment_method ?? ""),
    createdAt: toIso(orderRow.created_at),
    updatedAt: toIso(orderRow.updated_at)
  };
}

export const createOrder = async (
  userId: number,
  payload: {
    paymentMethod: string;
    shippingName: string;
    shippingPhone: string;
    shippingEmail?: string;
    shippingAddress: string;
    shippingCity: string;
    shippingState?: string;
    shippingZipcode?: string;
    shippingCountry?: string;
    note?: string;
  }
) => {
  const pool = await getDb();
  if (await usesRebuiltStoreSchema()) {
    const paymentMethod = payload.paymentMethod === "bank" ? "bank_transfer" : payload.paymentMethod;
    if (!["cod", "bank_transfer"].includes(paymentMethod)) throw new AppError(400, "Phương thức thanh toán chưa được hỗ trợ");
    // Schema mới có một cột địa chỉ; giữ đủ thông tin để GET đơn không mất thành phố/tỉnh.
    const address = JSON.stringify({ schema: "bookarazi.shipping.v1", street: payload.shippingAddress,
      city: payload.shippingCity, state: payload.shippingState ?? "", zipCode: payload.shippingZipcode ?? "",
      country: payload.shippingCountry ?? "Vietnam" });
    if (address.length > 1000) throw new AppError(400, "Địa chỉ giao hàng quá dài");
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const cart = await new sql.Request(tx).input("userId", sql.BigInt, userId).query(`
        SELECT TOP 1 id FROM carts WITH (UPDLOCK,HOLDLOCK) WHERE user_id=@userId AND status='active' ORDER BY id DESC`);
      if (!cart.recordset.length) throw new AppError(400, "Giỏ hàng trống");
      const cartId = Number(cart.recordset[0].id);
      const cartItems = await new sql.Request(tx).input("cartId", sql.BigInt, cartId)
        .query("SELECT book_id,quantity FROM cart_items WITH (UPDLOCK,HOLDLOCK) WHERE cart_id=@cartId");
      if (!cartItems.recordset.length) throw new AppError(400, "Giỏ hàng trống");
      const items = new sql.Table("dbo.OrderItemInput");
      items.columns.add("book_id", sql.Int, { nullable: false });
      items.columns.add("quantity", sql.Int, { nullable: false });
      for (const row of cartItems.recordset) items.rows.add(Number(row.book_id), Number(row.quantity));
      const result = await new sql.Request(tx)
        .input("UserId", sql.Int, userId).input("CustomerName", sql.NVarChar(255), payload.shippingName)
        .input("CustomerEmail", sql.NVarChar(255), payload.shippingEmail ?? null)
        .input("CustomerPhone", sql.NVarChar(30), payload.shippingPhone)
        .input("ShippingAddress", sql.NVarChar(1000), address).input("Note", sql.NVarChar(1000), payload.note ?? null)
        .input("PaymentMethod", sql.NVarChar(30), paymentMethod).input("Items", items)
        .output("OrderId", sql.BigInt).output("OrderCode", sql.NVarChar(50)).execute("sp_CreateOrder");
      const orderId = Number(result.output.OrderId);
      await new sql.Request(tx).input("cartId", sql.BigInt, cartId).query("DELETE FROM cart_items WHERE cart_id=@cartId");
      const order = await new sql.Request(tx).input("orderId", sql.BigInt, orderId).query("SELECT * FROM orders WHERE id=@orderId");
      const orderItems = await new sql.Request(tx).input("orderId", sql.BigInt, orderId).query("SELECT * FROM order_items WHERE order_id=@orderId ORDER BY id");
      const item = mapOrderToApi(order.recordset[0], orderItems.recordset);
      await tx.commit();
      return { orderId, item };
    } catch (error) {
      try { await tx.rollback(); } catch { /* SQL có thể đã tự rollback do XACT_ABORT. */ }
      const number = (error as { number?: number }).number;
      if (number && number >= 50010 && number <= 50012) throw new AppError(400, (error as Error).message);
      throw error;
    }
  }
  const request = pool.request();
  request.input("p_user_id", sql.BigInt, userId);
  request.input("p_payment_method", sql.NVarChar(50), payload.paymentMethod);
  request.input("p_shipping_name", sql.NVarChar(255), payload.shippingName);
  request.input("p_shipping_phone", sql.NVarChar(20), payload.shippingPhone);
  request.input("p_shipping_email", sql.NVarChar(255), payload.shippingEmail ?? null);
  request.input("p_shipping_address", sql.NVarChar(500), payload.shippingAddress);
  request.input("p_shipping_city", sql.NVarChar(100), payload.shippingCity);
  request.input("p_shipping_state", sql.NVarChar(100), payload.shippingState ?? null);
  request.input("p_shipping_zipcode", sql.NVarChar(20), payload.shippingZipcode ?? null);
  request.input("p_shipping_country", sql.NVarChar(100), payload.shippingCountry ?? "Vietnam");
  request.input("p_note", sql.NVarChar(sql.MAX), payload.note ?? null);
  request.output("p_order_id", sql.BigInt);

  const result = await request.execute("sp_create_order");
  return { orderId: Number(result.output.p_order_id) };
};

export const listOrders = async (auth: AuthUser, query: Record<string, unknown>) => {
  const { page, limit, offset } = parsePagination(query);
  const pool = await getDb();
  const rebuilt = await usesRebuiltStoreSchema();
  const admin = isOrderAdmin(auth);

  let orderRows: Record<string, unknown>[] = [];
  let total = 0;

  if (admin) {
    const listRs = await pool
      .request()
      .input("limit", sql.Int, limit)
      .input("offset", sql.Int, offset)
      .query(
        `SELECT * FROM orders
         ORDER BY created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    orderRows = listRs.recordset as Record<string, unknown>[];
    const countRs = await pool.request().query(`SELECT COUNT(*) AS total FROM orders`);
    total = Number((countRs.recordset[0] as { total: number }).total);
  } else {
    const listRs = await pool
      .request()
      .input("userId", sql.BigInt, auth.id)
      .input("limit", sql.Int, limit)
      .input("offset", sql.Int, offset)
      .query(
        `SELECT * FROM orders
         WHERE user_id=@userId
         ORDER BY created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    orderRows = listRs.recordset as Record<string, unknown>[];
    const countRs = await pool
      .request()
      .input("userId", sql.BigInt, auth.id)
      .query(`SELECT COUNT(*) AS total FROM orders WHERE user_id=@userId`);
    total = Number((countRs.recordset[0] as { total: number }).total);
  }

  const data: ReturnType<typeof mapOrderToApi>[] = [];
  for (const row of orderRows) {
    const irs = await pool
      .request()
      .input("orderId", sql.BigInt, row.id)
      .query(
        `SELECT book_id, quantity, unit_price, ${rebuilt ? "line_total AS total_price" : "total_price"}
         FROM order_items WHERE order_id=@orderId ORDER BY id`
      );
    data.push(mapOrderToApi(row, irs.recordset as Record<string, unknown>[]));
  }

  return {
    data,
    meta: { page, limit, total }
  };
};

export const updateOrderStatus = async (orderId: number, newStatus: string, note: string | undefined, changedBy: number) => {
  const allowed = ["pending", "confirmed", "processing", "shipping", "completed", "cancelled"];
  if (!allowed.includes(newStatus)) throw new AppError(400, "Invalid order status");
  const pool = await getDb();
  if (await usesRebuiltStoreSchema()) {
    try {
      await pool.request().input("OrderId", sql.BigInt, orderId).input("NewStatus", sql.NVarChar(30), newStatus)
        .input("Note", sql.NVarChar(1000), note ?? null).input("CancelReason", sql.NVarChar(1000), note ?? null)
        .input("ChangedBy", sql.Int, changedBy).execute("sp_UpdateOrderStatus");
      return;
    } catch (error) {
      const number = (error as { number?: number }).number;
      if (number === 50021) throw new AppError(404, (error as Error).message);
      if (number === 50020 || number === 50022) throw new AppError(400, (error as Error).message);
      throw error;
    }
  }
  await pool
    .request()
    .input("p_order_id", sql.BigInt, orderId)
    .input("p_new_status", sql.NVarChar(20), newStatus)
    .input("p_note", sql.NVarChar(sql.MAX), note ?? null)
    .input("p_changed_by", sql.BigInt, changedBy)
    .execute("sp_update_order_status");
};

/** Customer marks order as received: shipping → completed (own orders only). */
export const confirmDeliveryByCustomer = async (userId: number, orderId: number) => {
  const pool = await getDb();
  const rs = await pool
    .request()
    .input("orderId", sql.BigInt, orderId)
    .query(`SELECT TOP 1 user_id, status FROM orders WHERE id=@orderId`);
  if (!rs.recordset.length) throw new AppError(404, "Không tìm thấy đơn hàng");
  const row = rs.recordset[0] as { user_id: unknown; status: string };
  if (Number(row.user_id) !== userId) {
    throw new AppError(403, "Bạn không thể xác nhận đơn hàng này");
  }
  if (row.status !== "shipping") {
    throw new AppError(400, "Chỉ xác nhận được khi đơn đang ở trạng thái đang giao hàng");
  }
  await updateOrderStatus(orderId, "completed", undefined, userId);
};
