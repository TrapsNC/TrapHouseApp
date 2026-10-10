"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { createId } from "@/lib/create-id";
type Member={user_id:string;email:string;name:string};
type Result={member:Member;balance:number;entries:{id:string;points:number;note:string;amount_cents:number;created_at:string}[]};
export default function AdminRewards(){
 const [email,setEmail]=useState(""),[result,setResult]=useState<Result|null>(null),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[key,setKey]=useState(createId);
 async function request(path:string,body?:unknown){
  const {data}=await supabase.auth.getSession();
  if(!data.session)throw Error("Sign in to admin first.");
  const res=await fetch(path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const value=await res.json();if(!res.ok)throw Error(value.error);return value;
 }
 async function find(){
  setBusy(true);setMessage("");setResult(null);try{setResult(await request("/api/admin/rewards?email="+encodeURIComponent(email)));setKey(createId());setConfirmed(false);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function record(action:string){
  if(!result)return;setBusy(true);setMessage("");
  try{await request("/api/admin/rewards",{action,userId:result.member.user_id,key,cents:Math.round(Number(amount)*100),note,confirmed});
   setResult(await request("/api/admin/rewards?email="+encodeURIComponent(email)));setKey(createId());setConfirmed(false);setAmount("");setNote("");setMessage("Recorded successfully.");
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-black text-white p-6 max-w-3xl mx-auto">
  <Link href="/admin" className="underline">Back to admin</Link><Link href="/admin/marketing" className="underline ml-5">Marketing</Link>
  <h1 className="text-3xl font-bold mt-6">Customer Rewards</h1><p className="mt-3">Find a verified rewards account by email. Online paid orders earn points automatically.</p>
  <label className="block mt-5">Customer email<input type="email" className="bg-black border p-3 w-full mt-2" value={email} onChange={e=>{setEmail(e.target.value);setResult(null);setConfirmed(false);}}/></label>
  <button className="bg-green-300 text-black p-3 rounded-lg mt-3" disabled={busy} onClick={()=>void find()}>Find customer</button>
  {result&&<section className="border rounded-xl p-5 mt-6"><h2 className="text-xl font-bold">{result.member.name||result.member.email}</h2><p className="text-3xl mt-4">{result.balance} points</p>
   <h3 className="font-bold mt-6">Record an in-person paid purchase</h3>
   <p className="text-sm mt-2">Enter merchandise paid after discounts, excluding tax. This records points and a sale amount; it does not update stock.</p>
   <label className="block mt-3">Merchandise amount ($)<input type="number" min="0.01" step="0.01" className="bg-black border p-3 w-full mt-2" value={amount} onChange={e=>{setAmount(e.target.value);setKey(createId());setConfirmed(false);}}/></label>
   <label className="block mt-3">Receipt / sale reference<input maxLength={200} className="bg-black border p-3 w-full mt-2" value={note} onChange={e=>{setNote(e.target.value);setKey(createId());setConfirmed(false);}}/></label>
   <label className="flex gap-3 mt-4"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm payment was received, or the $5 reward discount was applied at the counter.</label>
   <div className="flex gap-3 mt-4"><button disabled={busy||!confirmed||!note.trim()||Number(amount)<=0} className="border rounded-lg p-3" onClick={()=>void record("sale")}>Record paid purchase</button><button disabled={busy||!confirmed||result.balance<100} className="border rounded-lg p-3" onClick={()=>void record("redeem")}>Redeem 100 points for $5 off</button></div>
   <h3 className="font-bold mt-6">History</h3>{result.entries.map(e=><p className="border-b py-3" key={e.id}>{e.points>0?"+":""}{e.points} · {e.note} · {new Date(e.created_at).toLocaleDateString()}</p>)}
  </section>}
  <p role="status" className="mt-4">{message}</p>
 </main>;
}