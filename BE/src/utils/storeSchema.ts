/** Nhận diện hai schema SQL đang có trong project, không thay đổi database. */
import { getDb } from "../config/db";

export const usesRebuiltStoreSchema = async (): Promise<boolean> => {
  const db = await getDb();
  const result = await db.request().query("SELECT COL_LENGTH('dbo.books', 'stock_quantity') AS rebuilt_stock");
  return result.recordset[0].rebuilt_stock != null;
};
