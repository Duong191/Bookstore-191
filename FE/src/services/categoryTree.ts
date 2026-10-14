import type {Category,AdminCategory} from '../types/bookstore.types';
export function buildCategoryTree(categories:AdminCategory[]):AdminCategory[]{
  const nodes=categories.map(c=>({...c,children:[] as AdminCategory[]}));const map=new Map(nodes.map(c=>[c.id,c]));
  const roots:AdminCategory[]=[];nodes.forEach(c=>{const parent=c.parentId?map.get(c.parentId):undefined;if(parent)parent.children!.push(c);else roots.push(c);});
  return roots;
}
export function categoryScope(categories:Category[],id:string):Set<string>{
  const ids=new Set([id]);let changed=true;
  while(changed){changed=false;for(const c of categories){if(c.parentId&&ids.has(c.parentId)&&!ids.has(c.id)){ids.add(c.id);changed=true;}}}
  return ids;
}
