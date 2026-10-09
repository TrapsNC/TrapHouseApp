"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BarcodeScanner from "./purchases/BarcodeScanner";
type Variant = { id:string; stock:number; barcode:string|null; option1_value:string|null; option2_value:string|null; option3_value:string|null };
export default function FlavorInventory({productId,onSaved}:{productId:string;onSaved:()=>Promise<void>}) {
  const [variants,setVariants]=useState<Variant[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<Variant|null>(null);
  const [stock,setStock]=useState("");
  const [barcode,setBarcode]=useState("");
  const [busy,setBusy]=useState(false);
  const [scanning,setScanning]=useState(false);
  useEffect(()=>{let active=true; void (async()=>{const result=await supabase.from("product_variants").select("id,stock,barcode,option1_value,option2_value,option3_value").eq("product_id",productId).order("option1_value");if(!active)return;if(result.error)setError("Could not load flavors.");else setVariants(result.data||[]);setLoading(false);})();return()=>{active=false;};},[productId]);
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!selected)return;
    const quantity=Number(stock);
    if(!stock.trim() || !Number.isSafeInteger(quantity) || quantity<0 || quantity>1000000){setError("Enter a whole stock quantity of zero or more.");return;}
    setBusy(true);setError("");
    try {
      const result=await supabase.from("product_variants").update({stock:quantity,barcode:barcode.trim()||null}).eq("id",selected.id).eq("product_id",productId).eq("stock",selected.stock).select("id");
      if(result.error)throw result.error;
      if(!result.data?.length)throw new Error("Stock changed or access was denied. Close and reopen the editor before saving.");
      setVariants(items=>items.map(item=>item.id===selected.id?{...item,stock:quantity,barcode:barcode.trim()||null}:item));setSelected(null);await onSaved();
    }catch(e){setError(e instanceof Error?e.message:"Could not save flavor.");}finally{setBusy(false);}
  }
  const label=(v:Variant)=>[v.option1_value,v.option2_value,v.option3_value].filter(Boolean).join(" / ")||"Default variant";
  return <section className="mt-6 border-t border-zinc-700 pt-5"><h3 className="font-bold">Flavor inventory</h3>{loading && <p>Loading flavors…</p>}{!loading&&!variants.length&&!error&&<p className="mt-2 text-sm text-zinc-400">This item has no flavors.</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}<div className="mt-3 space-y-2">{variants.map(v=><div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3"><div><p className="font-bold">{label(v)}</p><p className="text-sm text-zinc-400">Stock: {v.stock} · Barcode: {v.barcode||"Not set"}</p></div><button type="button" disabled={busy} onClick={()=>{setSelected(v);setStock(String(v.stock));setBarcode(v.barcode||"");setError("");setScanning(false);}} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-300">EDIT FLAVOR</button></div>)}</div>{selected&&<form onSubmit={save} className="mt-4 space-y-3 rounded-xl border border-emerald-900 p-4"><p className="font-bold">{label(selected)}</p><label className="block text-sm">Flavor stock<input type="number" min="0" max="1000000" step="1" required value={stock} onChange={e=>setStock(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3"/></label><div className="flex gap-2">{[-1,1,5,10].map(delta=><button type="button" key={delta} onClick={()=>setStock(String(Math.max(0,Number(stock||0)+delta)))} className="rounded-lg border border-zinc-700 px-3 py-2">{delta>0?"+":""}{delta}</button>)}</div><label className="block text-sm">Flavor barcode<input maxLength={80} value={barcode} onChange={e=>setBarcode(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3"/></label><button type="button" onClick={()=>setScanning(true)} className="text-sm font-bold text-emerald-300">SCAN FLAVOR BARCODE</button>{scanning&&<BarcodeScanner onClose={()=>setScanning(false)} onScan={value=>{setBarcode(value);setScanning(false);}}/>}<p className="text-xs text-zinc-400">Quantity changes apply when you save this flavor.</p><div className="flex gap-3"><button disabled={busy} className="rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black">{busy?"SAVING…":"SAVE FLAVOR"}</button><button type="button" disabled={busy} onClick={()=>{setSelected(null);setScanning(false);}} className="rounded-xl border border-zinc-700 px-4 py-3">CANCEL</button></div></form>}</section>;
}