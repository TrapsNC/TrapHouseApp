import { createClient } from "@supabase/supabase-js";
import type { CartItem } from "./cart";
import { quoteCart } from "./quote";
import type { ProductRow, VariantRow } from "./quote";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CartInputError extends Error {}
export function parseCart(value:unknown):CartItem[] {
 if(!Array.isArray(value)||!value.length||value.length>100) throw new CartInputError("Your cart must contain between 1 and 100 items.");
 const ids=new Set<string>();
 return value.map((raw:unknown)=>{
  if(!raw||typeof raw!=="object") throw new CartInputError("Invalid cart item.");
  const item=raw as Record<string,unknown>;
  if(typeof item.productId!=="string"||!uuid.test(item.productId)||(item.variantId!==null&&(typeof item.variantId!=="string"||!uuid.test(item.variantId)))||typeof item.lineId!=="string"||!uuid.test(item.lineId)||ids.has(item.lineId)||!Number.isInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>99||typeof item.price!=="number"||!Number.isFinite(item.price)||item.price<0||!["pickup","delivery","shipping"].includes(String(item.fulfillment))) throw new CartInputError("A cart item is invalid. Please review your cart.");
  ids.add(item.lineId);
  return {lineId:item.lineId,productId:item.productId,variantId:item.variantId as string|null,quantity:Number(item.quantity),price:item.price,fulfillment:item.fulfillment as CartItem["fulfillment"],name:typeof item.name==="string"?item.name.slice(0,500):"Product",variant:typeof item.variant==="string"?item.variant.slice(0,500):null,image:null};
 });
}
export function serverDatabase() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) throw new Error("Missing inventory configuration");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function freshQuote(items:CartItem[]) {
 const database=serverDatabase(); const productIds=Array.from(new Set(items.map(item=>item.productId)));
 const [products,variants]=await Promise.all([
  database.from("products").select("id,name,price,stock,active,image_url").in("id",productIds),
  database.from("product_variants").select("id,product_id,price,stock,active,image_url,option1_value,option2_value,option3_value").in("product_id",productIds),
 ]);
 if(products.error||variants.error) throw new Error("Inventory lookup failed");
 const rows=(variants.data||[]) as VariantRow[];
 return quoteCart(items,(products.data||[]) as ProductRow[],rows,new Set(rows.map(row=>row.product_id)));
}
