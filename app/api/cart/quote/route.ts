import { CartInputError,freshQuote,parseCart } from "@/lib/server-cart";
export async function POST(request:Request) {
 try {
  let body; try {body=await request.json();} catch {return Response.json({error:"Invalid cart request."},{status:400});}
  return Response.json(await freshQuote(parseCart(body?.items)),{headers:{"Cache-Control":"no-store"}});
 } catch(error) {
  return Response.json({error:error instanceof CartInputError?error.message:"We couldn’t verify your cart. Please try again."},{status:error instanceof CartInputError?400:503});
 }
}
