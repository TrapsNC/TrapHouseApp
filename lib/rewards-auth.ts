import "server-only";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";
export async function rewardsAuth(request: Request, admin = false) {
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if(!token) return null;
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 const {data,error}=await auth.auth.getUser(token);
 if(error || !data.user?.email || !data.user.email_confirmed_at) return null;
 const db=adminDatabase();
 if(admin) {
  const member=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
  if(member.error || !member.data) return null;
 }
 return {db,user:data.user};
}