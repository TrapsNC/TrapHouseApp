"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import FlavorInventory from "./FlavorInventory";
import BarcodeScanner from "./purchases/BarcodeScanner";
type Item = { id: string; name: string; category: string; price: number | string; image_url?: string | null; barcode?: string | null };
export default function EditItem({ product, onClose, onSaved }: { product: Item; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name,setName]=useState(product.name);
  const [category,setCategory]=useState(product.category || "");
  const [price,setPrice]=useState(String(product.price));
  const [barcode,setBarcode]=useState(product.barcode || "");
  const [image,setImage]=useState<File|null>(null);
  const [scanning,setScanning]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const field="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount=Number(price);
    if (!name.trim() || !category.trim() || !price.trim() || !Number.isFinite(amount) || amount<0 || amount>1000000) {setError("Enter a name, category and valid price.");return;}
    setBusy(true);setError("");
    try {
      let imageUrl=product.image_url ?? null;
      if(image) {
        if(!["image/jpeg","image/png","image/webp"].includes(image.type) || image.size>5*1024*1024) throw new Error("Choose a JPG, PNG or WebP picture under 5 MB.");
        const extension=image.type==="image/jpeg"?"jpg":image.type==="image/png"?"png":"webp";
        const path=`products/${crypto.randomUUID()}.${extension}`;
        const uploaded=await supabase.storage.from("product-images").upload(path,image);
        if(uploaded.error) throw uploaded.error;
        imageUrl=supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      const updated=await supabase.from("products").update({name:name.trim(),category:category.trim(),price:Math.round(amount*100)/100,barcode:barcode.trim()||null,image_url:imageUrl}).eq("id",product.id).select("id");
      if(updated.error) throw updated.error;
      if(!updated.data?.length) throw new Error("Item could not be updated. Refresh and check your admin access.");
      await onSaved();onClose();
    } catch(e) {setError(e instanceof Error?e.message:"Could not save item.");}
    finally {setBusy(false);}
  }
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4 sm:p-8"><section role="dialog" aria-modal="true" aria-labelledby="edit-item-heading" className="mx-auto max-w-xl rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-white"><div className="flex items-center justify-between gap-3"><h2 id="edit-item-heading" className="text-xl font-bold">Edit item</h2><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2">CANCEL</button></div><form onSubmit={save} className="mt-5 space-y-4"><label className="block text-sm">Product name<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} className={field}/></label><label className="block text-sm">Category<input required maxLength={300} value={category} onChange={e=>setCategory(e.target.value)} className={field}/></label><label className="block text-sm">Selling price ($)<input required type="number" min="0" max="1000000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className={field}/></label><label className="block text-sm">Product barcode<input maxLength={80} value={barcode} onChange={e=>setBarcode(e.target.value)} className={field}/></label><button type="button" onClick={()=>setScanning(true)} className="rounded-xl border border-emerald-700 px-4 py-2 text-emerald-300">SCAN BARCODE</button><p className="text-xs text-zinc-400">Flavor-specific barcodes and prices stay with their variants.</p>{scanning && <BarcodeScanner onClose={()=>setScanning(false)} onScan={value=>{setBarcode(value);setScanning(false);}}/>}{product.image_url && <img src={product.image_url} alt={product.name} className="h-24 w-24 rounded-xl object-cover"/>}<label className="block text-sm">Replace picture<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setImage(e.target.files?.[0]||null)} className={field}/></label>{image && <p className="text-sm text-emerald-300">Selected: {image.name}</p>}{error && <p role="alert" className="text-sm text-red-400">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black disabled:opacity-50">{busy?"SAVING…":"SAVE CHANGES"}</button></form><FlavorInventory productId={product.id} onSaved={onSaved}/></section></div>;
}