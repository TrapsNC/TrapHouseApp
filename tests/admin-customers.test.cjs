const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
function fixture(authorized=true){
 let touched=false,range;
 const member={user_id:"member",email:"shopper@example.invalid",name:"Shopper",email_offers:false,email_frequency:"occasional",created_at:"2026-10-09"};
 const db={from(table){touched=true;return{
  select(columns){assert.ok(!columns.includes("unsubscribe_token"));return this;},order(){return this;},or(){return this;},in(){return this;},
  async range(start,end){if(table==="reward_members"){range=[start,end];return{data:[member],count:26,error:null};}
   return{data:[{user_id:"member",points:100},{user_id:"member",points:-100}],error:null};}
 };}};
 const deps={"next/server":{NextResponse:{json:Response.json}},"@/lib/rate-limit":{enforceRateLimit:async()=>null},
 "@/lib/rewards-auth":{rewardsAuth:async(req,admin)=>{assert.equal(admin,true);return authorized?{db}:null;}}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/admin/customers/route.ts","utf8"),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module,exports:module.exports,console,URL,require:n=>deps[n]});
 return{run:url=>module.exports.GET(new Request(url)),touched:()=>touched,range:()=>range};
}
test("non-admin cannot access customers or query the database",async()=>{
 const f=fixture(false),r=await f.run("https://test/api/admin/customers");
 assert.equal(r.status,403);assert.equal(f.touched(),false);
});
test("customer pagination and net points exclude private subscription tokens",async()=>{
 const f=fixture(),r=await f.run("https://test/api/admin/customers?page=2");
 assert.equal(r.status,200);assert.equal(r.headers.get("Cache-Control"),"no-store");
 const body=await r.json();assert.deepEqual(f.range(),[25,49]);assert.equal(body.total,26);
 assert.equal(body.customers[0].balance,0);assert.equal(body.customers[0].unsubscribe_token,undefined);
});
test("invalid pages rejected before customer queries",async()=>{
 const f=fixture(),r=await f.run("https://test/api/admin/customers?page=-1");
 assert.equal(r.status,400);assert.equal(f.touched(),false);
});