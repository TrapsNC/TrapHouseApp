import { NextResponse } from "next/server";
import { rewardsAuth } from "@/lib/rewards-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:Request) {
 const limited=await enforceRateLimit(request,"adminRead");if(limited)return limited;
 try{
  const auth=await rewardsAuth(request,true);if(!auth)return reply({error:"Admin sign-in required."},403);
  const email=new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if(!email)return reply({error:"Enter the customer's rewards email."},400);
  const member=await auth.db.from("reward_members").select("user_id,email,name,email_offers,email_frequency").eq("email",email).maybeSingle();
  if(member.error)throw Error();if(!member.data)return reply({error:"No rewards account found. Ask the customer to join first."},404);
  const entries=await auth.db.from("reward_entries").select("id,points,note,amount_cents,created_at").eq("user_id",member.data.user_id).order("created_at",{ascending:false});
  if(entries.error)throw Error();
  return reply({member:member.data,entries:entries.data,balance:entries.data.reduce((n,e)=>n+Number(e.points),0)});
 }catch{return reply({error:"Rewards setup unavailable."},503);}
}
export async function POST(request:Request){
 const limited=await enforceRateLimit(request,"adminWrite");if(limited)return limited;
 try{
  const auth=await rewardsAuth(request,true);if(!auth)return reply({error:"Admin sign-in required."},403);
  const body=await request.json();
  if(!uuid.test(body.userId||"") || !uuid.test(body.key||"") || !["sale","redeem"].includes(body.action))return reply({error:"Invalid request."},400);
  if(body.confirmed!==true)return reply({error:"Confirm the payment or discount before recording it."},400);
  if(body.action==="sale" && (!Number.isSafeInteger(body.cents)||body.cents<1||body.cents>10000000||typeof body.note!=="string"||body.note.length>200))return reply({error:"Enter a valid merchandise amount and sale reference."},400);
  const args={p_user:body.userId,p_actor:auth.user.id,p_key:body.key};
  const result=body.action==="redeem"?await auth.db.rpc("redeem_reward",args):await auth.db.rpc("record_reward_sale",{...args,p_cents:body.cents,p_note:body.note});
  if(result.error)return reply({error:"Could not record this action. Check the balance and setup, then retry."},409);
  return reply({success:true});
 }catch{return reply({error:"Rewards action unavailable."},503);}
}