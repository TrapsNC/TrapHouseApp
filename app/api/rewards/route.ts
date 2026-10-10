import { NextResponse } from "next/server";
import { rewardsAuth } from "@/lib/rewards-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request) {
 const limited=await enforceRateLimit(request,"adminRead"); if(limited) return limited;
 try {
  const auth=await rewardsAuth(request); if(!auth) return reply({error:"Sign in with a verified email to view rewards."},401);
  const joined=await auth.db.rpc("join_rewards",{p_user:auth.user.id,p_email:auth.user.email});
  if(joined.error) throw Error();
  const [profile,entries]=await Promise.all([
   auth.db.from("reward_members").select("name,email,email_offers,email_frequency").eq("user_id",auth.user.id).single(),
   auth.db.from("reward_entries").select("id,points,note,amount_cents,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false})
  ]);
  if(profile.error || entries.error) throw Error();
  return reply({profile:profile.data,entries:entries.data,balance:entries.data.reduce((n,e)=>n+Number(e.points),0)});
 } catch {return reply({error:"Rewards setup is not available yet. Please try again later."},503);}
}
export async function PATCH(request:Request) {
 const limited=await enforceRateLimit(request,"adminWrite"); if(limited) return limited;
 try {
  const auth=await rewardsAuth(request); if(!auth) return reply({error:"Sign in with a verified email."},401);
  const body=await request.json();
  if(typeof body.emailOffers!=="boolean" || !["daily","occasional"].includes(body.frequency) || typeof body.name!=="string" || body.name.trim().length>100) return reply({error:"Invalid preferences."},400);
  const {error}=await auth.db.from("reward_members").update({name:body.name.trim(),email_offers:body.emailOffers,email_frequency:body.frequency,consent_at:body.emailOffers?new Date().toISOString():null}).eq("user_id",auth.user.id);
  if(error) throw Error();
  return reply({success:true});
 }catch{return reply({error:"Preferences could not be saved."},503);}
}