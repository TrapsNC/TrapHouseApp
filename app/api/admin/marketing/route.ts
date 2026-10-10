import { NextResponse } from "next/server";
import { rewardsAuth } from "@/lib/rewards-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 const limited=await enforceRateLimit(request,"adminRead");if(limited)return limited;
 try{
  const auth=await rewardsAuth(request,true);if(!auth)return reply({error:"Admin sign-in required."},403);
  const [subscribers,drafts]=await Promise.all([
   auth.db.from("reward_members").select("email_frequency").eq("email_offers",true),
   auth.db.from("reward_campaigns").select("id,subject,message,audience,created_at").order("created_at",{ascending:false}).limit(30)
  ]);
  if(subscribers.error||drafts.error)throw Error();
  return reply({subscribers:subscribers.data.length,daily:subscribers.data.filter(x=>x.email_frequency==="daily").length,drafts:drafts.data,
   sendingEnabled:false,reason:"Add a valid business mailing address before enabling promotional email delivery. SMS provider is not connected."});
 }catch{return reply({error:"Marketing setup unavailable."},503);}
}
export async function POST(request:Request){
 const limited=await enforceRateLimit(request,"adminWrite");if(limited)return limited;
 try{
  const auth=await rewardsAuth(request,true);if(!auth)return reply({error:"Admin sign-in required."},403);
  const body=await request.json();
  if(typeof body.subject!=="string"||body.subject.trim().length<1||body.subject.length>150||typeof body.message!=="string"||body.message.trim().length<1||body.message.length>5000||!["daily","occasional"].includes(body.audience))return reply({error:"Enter a subject, message, and audience."},400);
  if(body.action!=="draft")return reply({error:"Campaign delivery is not enabled. Save a draft instead."},409);
  const result=await auth.db.from("reward_campaigns").insert({subject:body.subject.trim(),message:body.message.trim(),audience:body.audience,created_by:auth.user.id}).select("id").single();
  if(result.error)throw Error();
  return reply({success:true});
 }catch{return reply({error:"Draft could not be saved."},503);}
}