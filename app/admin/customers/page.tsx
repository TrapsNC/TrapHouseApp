"use client";
import { useEffect,useRef,useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
type Customer={user_id:string;name:string;email:string;balance:number;email_offers:boolean;email_frequency:string;created_at:string};
type Detail={member:{name:string;email:string};balance:number;entries:{id:string;points:number;amount_cents:number;note:string;created_at:string}[]};
export default function Customers(){
 const [customers,setCustomers]=useState<Customer[]>([]),[search,setSearch]=useState(""),[filter,setFilter]=useState("");
 const [page,setPage]=useState(1),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [detail,setDetail]=useState<Detail|null>(null),[detailMessage,setDetailMessage]=useState("");
 const version=useRef(0);
 async function request(path:string){
  const {data}=await supabase.auth.getSession();if(!data.session)throw Error("Sign in to admin to view customers.");
  const res=await fetch(path,{headers:{Authorization:"Bearer "+data.session.access_token},cache:"no-store"});
  const result=await res.json();if(!res.ok)throw Error(result.error);return result;
 }
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setCustomers([]);
  void request("/api/admin/customers?page="+page+"&search="+encodeURIComponent(filter))
   .then(r=>{if(active){setCustomers(r.customers);setTotal(r.total);}})
   .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[page,filter]);
 async function view(c:Customer){
  const current=++version.current;setDetail(null);setDetailMessage("Loading details…");
  try{const r=await request("/api/admin/rewards?email="+encodeURIComponent(c.email));if(current===version.current){setDetail(r);setDetailMessage("");}}
  catch(e){if(current===version.current)setDetailMessage((e as Error).message);}
 }
 return <main className="min-h-screen bg-black text-white p-6 max-w-5xl mx-auto">
  <nav className="flex gap-5 flex-wrap"><Link href="/admin" className="underline">Back to admin</Link><Link href="/admin/rewards" className="underline">Rewards</Link><Link href="/admin/marketing" className="underline">Marketing</Link></nav>
  <h1 className="text-3xl font-bold mt-6">Customers</h1>
  <p className="mt-3 text-zinc-300">Customers who joined rewards. Guest orders and unconfirmed signups are not included.</p>
  <form className="flex flex-wrap gap-3 mt-5" onSubmit={e=>{e.preventDefault();setPage(1);setFilter(search.trim());++version.current;setDetail(null);setDetailMessage("");}}>
   <label className="flex-1 min-w-48">Search name or email<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} className="block w-full mt-2 border border-zinc-700 bg-black rounded-lg p-3"/></label>
   <button className="self-end bg-green-300 text-black rounded-lg p-3 font-bold">Search</button>
  </form>
  <p role="status" className="mt-4">{loading?"Loading customers…":error||total+" rewards customers"+(filter?" match your search":"")}</p>
  {!loading&&!error&&customers.length===0&&<section className="border border-zinc-800 rounded-xl p-6 mt-5"><h2 className="font-bold">{filter?"No matches found":"No rewards customers yet"}</h2><p className="mt-2">Customers appear after verifying their email and opening their rewards account.</p><Link href="/rewards" className="underline inline-block mt-3">View customer signup</Link></section>}
  <div className="grid gap-4 mt-5">{customers.map(c=><section key={c.user_id} className="border border-zinc-800 rounded-xl p-5">
   <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-bold text-xl">{c.name||"Name not added"}</h2><p className="break-all mt-1">{c.email}</p><p className="text-sm text-zinc-400 mt-2">Joined {new Date(c.created_at).toLocaleDateString()}</p></div><div><p className="text-green-300 font-bold text-xl">{c.balance} points</p><p className="text-sm mt-2">{c.email_offers?c.email_frequency==="daily"?"Subscribed: daily emails":"Subscribed: occasional offers":"Email offers: not subscribed"}</p></div></div>
   <button className="border border-zinc-600 rounded-lg p-3 mt-4" onClick={()=>void view(c)}>View customer</button>
  </section>)}</div>
  {!loading&&!error&&total>25&&<nav aria-label="Customer pages" className="flex gap-4 items-center mt-5"><button className="border p-3 rounded-lg" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {Math.ceil(total/25)}</span><button className="border p-3 rounded-lg" disabled={page*25>=total} onClick={()=>setPage(page+1)}>Next</button></nav>}
  <p role="status" className="mt-5">{detailMessage}</p>
  {detail&&<section className="border border-green-800 rounded-xl p-6 mt-6" aria-label="Customer details">
   <button className="underline" onClick={()=>{++version.current;setDetail(null);}}>Close details</button><h2 className="font-bold text-xl mt-4">{detail.member.name||detail.member.email}</h2><p className="mt-2">{detail.member.email} · {detail.balance} points</p><Link href="/admin/rewards" className="underline block mt-3">Manage purchases and rewards</Link>
   <h3 className="font-bold mt-6">Purchases & points history</h3><p className="text-zinc-400 text-sm mt-2">Recorded rewards activity. Purchase amounts exclude tax and delivery.</p>
   {detail.entries.length===0?<p className="mt-4">No rewards activity yet.</p>:detail.entries.map(e=><div key={e.id} className="border-b border-zinc-800 py-4"><strong>{e.points>0?"+":""}{e.points} points</strong><p className="mt-1">{e.note}</p>{e.amount_cents>0&&<p className="mt-1">Merchandise: {"$"+(e.amount_cents/100).toFixed(2)}</p>}<p className="text-zinc-400 text-sm mt-1">{new Date(e.created_at).toLocaleString()}</p></div>)}
  </section>}
 </main>;
}