"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { StoreHeader, StoreFooter } from "@/app/components/StoreChrome";
type Entry={id:string;points:number;note:string;created_at:string};
type Account={balance:number;profile:{name:string;email:string;email_offers:boolean;email_frequency:string};entries:Entry[]};
export default function RewardsPage(){
 const [account,setAccount]=useState<Account|null>(null),[email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [name,setName]=useState(""),[offers,setOffers]=useState(false),[frequency,setFrequency]=useState("occasional");
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  const {data}=await supabase.auth.getSession();if(!data.session){setAccount(null);return;}
  const res=await fetch("/api/rewards",{headers:{Authorization:"Bearer "+data.session.access_token},cache:"no-store"});
  const result=await res.json();if(!res.ok){setMessage(result.error);return;}
  setAccount(result);setName(result.profile.name);setOffers(result.profile.email_offers);setFrequency(result.profile.email_frequency);
 }
 useEffect(()=>{void load();const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(()=>void load(),0);});return()=>data.subscription.unsubscribe();},[]);
 async function authenticate(join:boolean){
  setBusy(true);setMessage("");
  try{
   const {error}=join?await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+"/rewards"}}):await supabase.auth.signInWithPassword({email,password});
   if(error)throw error;
   if(join)setMessage("Check your email to confirm your account, then sign in here.");
   else await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Could not sign in.");}finally{setBusy(false);}
 }
 async function save(){
  setBusy(true);try{
   const {data}=await supabase.auth.getSession();
   const res=await fetch("/api/rewards",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session?.access_token},body:JSON.stringify({name,emailOffers:offers,frequency})});
   const result=await res.json();setMessage(res.ok?"Preferences saved.":result.error);
  }finally{setBusy(false);}
 }
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container">
  <p className="store-kicker">TRAP HOUSE NC</p><h1 className="store-title">Rewards & Offers</h1>
  <p className="store-intro">Earn 1 point per $1 of merchandise purchased online or in store after payment is confirmed. 100 points earns $5 off in store. Refunded purchases reverse their points.</p>
  {!account?<section className="checkout-box" style={{maxWidth:600}}>
   <h2 className="text-xl font-bold">Join or sign in</h2><p className="store-muted mt-2">Use the same verified email for your website orders and at the counter.</p>
   <label className="block mt-4">Email<input className="w-full border p-3 bg-black mt-2" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label className="block mt-4">Password<input className="w-full border p-3 bg-black mt-2" type="password" autoComplete="current-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <div className="flex gap-4 mt-4"><button className="store-primary p-3" disabled={busy||!email||password.length<8} onClick={()=>void authenticate(false)}>Sign in</button><button className="border p-3" disabled={busy||!email||password.length<8} onClick={()=>void authenticate(true)}>Create account</button></div>
  </section>:<>
   <section className="checkout-box" style={{maxWidth:600}}><h2 className="text-3xl font-bold">{account.balance} points</h2>
    <p className="mt-3">{Math.floor(Math.max(account.balance,0)/100)} available $5 rewards. Ask staff to apply your reward at the counter.</p>
    <p className="store-muted mt-2">Points exclude tax and delivery. Website reward redemption is not enabled yet.</p>
    <p className="mt-3">{account.profile.email}</p>
    <button className="underline mt-3" onClick={async()=>{await supabase.auth.signOut();setAccount(null);}}>Sign out</button>
   </section>
   <section className="checkout-box mt-6" style={{maxWidth:600}}><h2 className="text-xl font-bold">Your preferences</h2>
    <label className="block mt-3">Name<input className="w-full border p-3 bg-black mt-2" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="flex gap-3 mt-4"><input type="checkbox" checked={offers} onChange={e=>setOffers(e.target.checked)}/>Email me Trap House NC discounts and store updates. I can unsubscribe anytime.</label>
    <label className="block mt-4">Email frequency<select className="bg-black border p-3 block mt-2" value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="occasional">Holiday offers and occasional updates</option><option value="daily">Daily updates and offers</option></select></label>
    <p className="store-muted mt-3">Marketing is optional. Text offers are not available yet.</p>
    <button className="store-primary p-3 mt-4" disabled={busy} onClick={()=>void save()}>Save preferences</button>
   </section>
   <section className="checkout-box mt-6" style={{maxWidth:600}}><h2 className="text-xl font-bold">Points history</h2>{account.entries.length===0?<p className="mt-3">Your points will appear here after a qualifying purchase.</p>:account.entries.map(e=><div key={e.id} className="border-b py-3"><strong>{e.points>0?"+":""}{e.points} points</strong><p>{e.note}</p><p className="store-muted">{new Date(e.created_at).toLocaleDateString()}</p></div>)}</section>
  </>}
  <p role="status" className="mt-4">{message}</p>
 </div><StoreFooter/></main>;
}