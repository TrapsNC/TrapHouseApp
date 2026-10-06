import { CartInputError,freshQuote,parseCart,serverDatabase } from "@/lib/server-cart";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:Request) {
 try {
  let body; try {body=await request.json();} catch {return Response.json({error:"Invalid demo request."},{status:400});}
  if(!body||typeof body.requestId!=="string"||!uuid.test(body.requestId)||!["pickup","delivery","shipping"].includes(body.fulfillment)||!Number.isInteger(body.expectedSubtotalCents)||body.expectedSubtotalCents<0) throw new CartInputError("Please review the demo checkout and try again.");
  const items=parseCart(body.items);
  if(items.some(item=>item.fulfillment!==body.fulfillment)) throw new CartInputError("Choose one fulfillment method for this demo order.");
  const quote=await freshQuote(items);
  if(!quote.canCheckout) return Response.json({error:"Inventory changed. Review the cart before retrying.",quote},{status:409});
  if(Math.round(quote.subtotal*100)!==body.expectedSubtotalCents||quote.items.some(item=>item.priceChanged)) return Response.json({error:"Prices changed. Review the updated total before retrying.",quote},{status:409});
  const {data,error}=await serverDatabase().rpc("create_demo_order",{p_request_id:body.requestId,p_items:items.map(item=>({productId:item.productId,variantId:item.variantId,quantity:item.quantity})),p_fulfillment:body.fulfillment,p_expected_subtotal:quote.subtotal});
  if(error) {
   if(error.code==="PGRST202") return Response.json({error:"Demo receipt storage is not configured yet. No payment was made."},{status:503});
   if(error.code==="P0001") return Response.json({error:error.message},{status:409});
   throw new Error("Demo receipt save failed");
  }
  return Response.json({receipt:data,demo:true},{headers:{"Cache-Control":"no-store"}});
 } catch(error) {return Response.json({error:error instanceof CartInputError?error.message:"The demo receipt could not be saved. No payment was made. Please try again."},{status:error instanceof CartInputError?400:503});}
}
