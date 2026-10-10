import { NextResponse } from "next/server";
import { rewardsAuth } from "@/lib/rewards-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 const limited=await enforceRateLimit(request,"adminRead");if(limited)return limited;
 try{
  const auth=await rewardsAuth(request,true);if(!auth)return reply({error:"Admin sign-in required."},403);
  const params=new URL(request.url).searchParams,page=Number(params.get("page")||1);
  if(!Number.isSafeInteger(page)||page<1||page>100000)return reply({error:"Invalid page."},400);
  const search=(params.get("search")||"").trim().slice(0,100);
  const term=search.replace(/[^a-zA-Z0-9@. +'-]/g,"").trim();
  let query=auth.db.from("reward_members").select("user_id,email,name,email_offers,email_frequency,created_at",{count:"exact"}).order("email",{ascending:true}).order("user_id",{ascending:true});
  if(search&&!term)return reply({customers:[],total:0,page});
  if(term)query=query.or("name.ilike.%"+term+"%,email.ilike.%"+term+"%");
  const members=await query.range((page-1)*25,page*25-1);if(members.error)throw Error();
  const customers=members.data||[],balances=new Map<string,number>();
  if(customers.length){
   const ids=customers.map(m=>m.user_id);
   for(let offset=0;;offset+=1000){
    const entries=await auth.db.from("reward_entries").select("user_id,points").in("user_id",ids).order("id",{ascending:true}).range(offset,offset+999);
    if(entries.error)throw Error();
    for(const e of entries.data||[])balances.set(e.user_id,(balances.get(e.user_id)||0)+Number(e.points));
    if((entries.data||[]).length<1000)break;
   }
  }
  return reply({customers:customers.map(m=>({...m,balance:balances.get(m.user_id)||0})),total:members.count||0,page});
 }catch{return reply({error:"Customer list is temporarily unavailable."},503);}
}