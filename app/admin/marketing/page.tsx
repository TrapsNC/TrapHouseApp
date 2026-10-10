"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
type Draft={id:string;subject:string;message:string;audience:string};
export default function Marketing(){
 const [subject,setSubject]=useState(""),[body,setBody]=useState(""),[audience,setAudience]=useState("occasional");
 const [drafts,setDrafts]=useState<Draft[]>([]),[count,setCount]=useState(0),[daily,setDaily]=useState(0),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function request(value?:unknown){
  const {data}=await supabase.auth.getSession();if(!data.session)throw Error("Sign in to admin first.");
  const res=await fetch("/api/admin/marketing",{method:value?"POST":"GET",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:value?JSON.stringify(value):undefined,cache:"no-store"});
  const result=await res.json();if(!res.ok)throw Error(result.error);return result;
 }
 async function load(){try{const r=await request();setCount(r.subscribers);setDaily(r.daily);setDrafts(r.drafts);}catch(e){setMessage((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function save(){setBusy(true);try{await request({action:"draft",subject,message:body,audience});setMessage("Draft saved. No messages sent.");await load();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <main className="min-h-screen bg-black text-white max-w-3xl mx-auto p-6">
  <Link href="/admin" className="underline">Back to admin</Link><Link href="/admin/rewards" className="underline ml-5">Rewards</Link>
  <h1 className="text-3xl font-bold mt-6">Store Updates & Offers</h1><p className="mt-3">{count} email subscribers · {daily} selected daily updates</p>
  <p className="border border-amber-500 rounded-lg p-4 mt-5">Drafts and previews are available. Sending needs a valid business mailing address and unsubscribe footer. Marketing texts need a connected SMS service.</p>
  <label className="block mt-5">Audience<select className="bg-black border p-3 block mt-2" value={audience} onChange={e=>setAudience(e.target.value)}><option value="occasional">All email subscribers: occasional / holiday offer</option><option value="daily">Daily-update subscribers only</option></select></label>
  <label className="block mt-4">Subject<input maxLength={150} className="bg-black border p-3 w-full mt-2" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
  <label className="block mt-4">Message<textarea rows={7} maxLength={5000} className="bg-black border p-3 w-full mt-2" value={body} onChange={e=>setBody(e.target.value)}/></label>
  <p className="text-sm mt-2">Only include discount codes that are configured and redeemable. Saving a draft does not create a discount code.</p>
  <button className="bg-green-300 text-black rounded-lg p-3 mt-4" disabled={busy||!subject.trim()||!body.trim()} onClick={()=>void save()}>Save draft</button>
  <section className="border rounded-xl p-5 mt-6"><h2 className="font-bold">Customer preview</h2><h3 className="text-xl mt-3">{subject||"Your subject"}</h3><p className="whitespace-pre-wrap mt-4">{body||"Your message"}</p><p className="text-sm mt-6">Trap House NC · Email preferences / Unsubscribe</p>{process.env.NODE_ENV === "development" && <p className="text-sm text-amber-300 mt-2">DEMO ADDRESS — NOT FOR SENDING</p>}</section>
  <p role="status" className="mt-4">{message}</p>
  <h2 className="font-bold text-xl mt-6">Saved drafts</h2>{drafts.map(d=><button className="block border p-4 rounded-lg mt-3 w-full text-left" key={d.id} onClick={()=>{setSubject(d.subject);setBody(d.message);setAudience(d.audience);}}>{d.subject}</button>)}
 </main>;
}