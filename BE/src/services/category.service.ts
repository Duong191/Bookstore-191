/** Danh mục public được lấy hoàn toàn từ DB, con ẩn theo cha. */
import { getDb } from "../config/db";
import { categoryTree,readCategoryItems } from "./adminCategories.service";
export const listCategories=async()=>{
  const items=await readCategoryItems((await getDb()).request());return items.filter(i=>i.isVisible);
};
export const listCategoriesDetailed=async()=>{
  const tree=categoryTree(await listCategories());
  return tree.map(c=>({id:c.id,name:c.name,subCategories:c.children.map(child=>({name:child.name,link:`/shop?category=${child.id}`})),viewAllLink:`/shop?category=${c.id}`}));
};
