"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { downloadInventory } from "@/lib/download-inventory";
import BarcodeScanner from "./BarcodeScanner";

type NewProductInput = { action: "createProduct"; id: string; name: string; category: string; priceCents: number; barcode: string };
type Product = { id: string; name: string; stock: number; barcode?: string | null };
type Variant = { barcode?: string | null; id: string; product_id: string; stock: number; option1_value: string; option2_value: string; option3_value: string };
type Line = { productId: string; variantId: string; packs: number; unitsPerPack: number; packCostCents: number; productName?: string; variantName?: string };
type Purchase = { id: string; version: number; supplier: string; invoice: string; date: string; notes: string; extraCents: number; lines: Line[]; updatedAt?: string; receivedAt?: string };
const blankLine = (): Line => ({ productId: "", variantId: "", packs: 1, unitsPerPack: 1, packCostCents: 0 });
const blankPurchase = (): Purchase => ({ id: crypto.randomUUID(), version: 1, supplier: "", invoice: "", date: new Date().toLocaleDateString("en-CA"), notes: "", extraCents: 0, lines: [blankLine()] });
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const total = (p: Purchase) => p.extraCents + p.lines.reduce((sum, line) => sum + line.packs * line.packCostCents, 0);
const variantName = (v: Variant) => [v.option1_value, v.option2_value, v.option3_value].filter(Boolean).join(" / ");
const field = "mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white";
const button = "rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold disabled:opacity-40";

export default function PurchasesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [draft, setDraft] = useState<Purchase | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [receivingReady, setReceivingReady] = useState(false);
  const [scanTarget, setScanTarget] = useState<{ row: number; newProduct: boolean } | null>(null);
  const [newProductRow, setNewProductRow] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState<NewProductInput | null>(null);

  const api = useCallback(async (method = "GET", purchase?: NewProductInput | Purchase | { id: string; version: number; confirmReceived: boolean }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { router.replace("/login"); throw new Error("Please sign in."); }
    const response = await fetch("/api/admin/purchases", { method, headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, ...(purchase ? { body: JSON.stringify(purchase) } : {}) });
    const result = await response.json();
    if (response.status === 401) router.replace("/login");

    if (!response.ok) throw new Error(result.error);
    return result;
  }, [router]);

  useEffect(() => {
    let active = true;
    api().then((result) => {
      if (!active) return;
      setReceivingReady(result.receivingReady);
      setProducts(result.products);
      setVariants(result.variants);
      setPurchases(result.purchases);
      setDraft(blankPurchase());
      setReady(true);
    }).catch((error) => {
      if (active) { setDenied(error instanceof Error && error.message === "Admin access required."); setMessage(error instanceof Error ? error.message : "Could not load purchases."); }
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [api]);

  function updateLine(index: number, patch: Partial<Line>) {
    setDraft(current => current && ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }));
  }
  function openNewProduct(index: number) {
    setNewProductRow(index);
    setNewProduct({ action: "createProduct", id: crypto.randomUUID(), name: "", category: "", priceCents: 0, barcode: "" });
  }
  function applyBarcode(value: string) {
    if (!scanTarget) return;
    const target = scanTarget;
    setScanTarget(null);
    const barcode = value.trim().replace(/^'+/, "");
    if (!barcode || barcode.length > 80) { setMessage("Barcode is empty or too long."); return; }
    if (target.newProduct) {
      setNewProduct(current => current && ({ ...current, barcode }));
      return;
    }
    const normalize = (value?: string | null) => {
      const cleaned = (value || "").trim().replace(/^'+/, "");
      return /^\d{13}$/.test(cleaned) && cleaned.startsWith("0") ? cleaned.slice(1) : cleaned;
    };
    const matches = variants.filter(v => normalize(v.barcode) === normalize(barcode));
    const productMatches = products.filter(p => normalize(p.barcode) === normalize(barcode));
    const ids = new Set([...matches.map(v => v.product_id), ...productMatches.map(p => p.id)]);
    if (ids.size > 1) { setMessage("This barcode is used by multiple products. Select the correct product and flavor manually."); return; }
    if (ids.size === 1) {
      const productId = [...ids][0];
      const options = variants.filter(v => v.product_id === productId);
      const variantId = matches.length === 1 ? matches[0].id : options.length === 1 ? options[0].id : "";
      updateLine(target.row, { productId, variantId, productName: undefined, variantName: undefined });
      setMessage(options.length > 1 && !variantId ? "Product found. This barcode is shared across flavors—choose the correct flavor." : "Barcode matched. Product selected.");
      return;
    }
    openNewProduct(target.row);
    setNewProduct({ action: "createProduct", id: crypto.randomUUID(), name: "", category: "", priceCents: 0, barcode });
    setMessage("New barcode. Enter the product details to create it.");
  }

  async function createProduct() {
    if (!newProduct || newProductRow === null) return;
    if (!newProduct.name.trim() || !newProduct.category.trim() || !Number.isSafeInteger(newProduct.priceCents) || newProduct.priceCents < 0) {
      setMessage("Enter a name, category, and valid selling price for the new product.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const result = await api("POST", newProduct);
      setProducts(current => [...current.filter(p => p.id !== result.product.id), result.product].sort((a,b) => a.name.localeCompare(b.name)));
      updateLine(newProductRow, { productId: result.product.id, variantId: "", productName: undefined, variantName: undefined });
      setNewProductRow(null); setNewProduct(null);
      setMessage("Product created and selected in your purchase. Starting stock is zero; receive the purchase when goods arrive.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create product.");
    } finally { setBusy(false); }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const result = await api("POST", draft);
      setPurchases(current => [result.purchase, ...current.filter(p => p.id !== draft.id)]);
      setDraft({ ...result.purchase, version: result.purchase.version + 1 });
      setMessage("Purchase saved. Inventory quantities have not changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(false); }
  }
  async function receive(purchase: Purchase) {
    if (!window.confirm("Confirm these goods have arrived? This adds all purchased units to stock once and locks the purchase.")) return;
    setBusy(true); setMessage("");
    try {
      const result = await api("PATCH", { id: purchase.id, version: purchase.version, confirmReceived: true });
      const refreshed = await api();
      setProducts(refreshed.products); setVariants(refreshed.variants); setPurchases(refreshed.purchases);
      setReceivingReady(refreshed.receivingReady);
      setDraft(blankPurchase());
      setMessage(result.alreadyReceived ? "Already received. No duplicate stock was added." : "Purchase received. All item quantities were added to inventory.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not receive purchase.");
    } finally { setBusy(false); }
  }

  function download(purchase: Purchase) {
    const rows: (string | number)[][] = [["Supplier", "Invoice", "Date", "Product", "Flavor / variant", "Packs", "Units per pack", "Units purchased", "Cost per pack", "Cost per unit", "Line total", "Shipping / tax / other", "Purchase total", "Notes"]];
    purchase.lines.forEach((line, index) => rows.push([purchase.supplier, purchase.invoice, purchase.date,
      line.productName || products.find(p => p.id === line.productId)?.name || "",
      line.variantName || (variants.find(v => v.id === line.variantId) ? variantName(variants.find(v => v.id === line.variantId)!) : ""),
      line.packs, line.unitsPerPack, line.packs * line.unitsPerPack, (line.packCostCents / 100).toFixed(2),
      (line.packCostCents / 100 / line.unitsPerPack).toFixed(4), (line.packs * line.packCostCents / 100).toFixed(2),
      index === 0 ? (purchase.extraCents / 100).toFixed(2) : "", index === 0 ? (total(purchase) / 100).toFixed(2) : "", purchase.notes]));
    const cell = (value: string | number) => { const text = String(value); return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"'; };
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `purchase-${purchase.date}-${purchase.id.slice(0, 8)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  if (denied) return <main className="min-h-screen bg-black p-8 text-white"><h1 className="text-2xl font-bold">Admin access required</h1><Link href="/" className="mt-4 inline-block underline">Back to store</Link></main>;
  return <main className="min-h-screen bg-black p-5 text-white sm:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs tracking-widest text-zinc-500">OWNER DASHBOARD</p><h1 className="mt-2 text-4xl font-black">Purchases</h1><p className="mt-2 text-sm text-zinc-400">Track stock purchases, pack sizes, and what you paid.</p></div><nav className="flex flex-wrap gap-2"><button type="button" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold disabled:opacity-40" disabled={!ready || busy} onClick={() => downloadInventory(products, variants)}>DOWNLOAD INVENTORY CSV</button><Link className={button} href="/admin">INVENTORY</Link><Link className={button} href="/admin/orders">ORDERS</Link><Link className={button} href="/admin/costs">COSTS & PROFIT</Link></nav></header>
    {message && <p role="status" className="mt-5 rounded-xl border border-zinc-700 p-4">{message}</p>}
    {!ready || !draft ? <p className="mt-8">{busy ? "Checking admin access…" : "Purchases unavailable."}</p> : <>
      <section className="mt-8 grid gap-3 sm:grid-cols-3">{[{label:"Recorded purchases",value:String(purchases.length)}, {label:"Inventory",value:"View current stock"}].map(card=><div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><p className="text-sm text-zinc-400">{card.label}</p>{card.label === "Inventory" ? <Link href="/admin" className="mt-2 inline-flex rounded-xl border border-green-700 bg-green-950 px-4 py-3 text-lg font-bold text-green-300 hover:bg-green-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400">{card.value} →</Link> : <p className="mt-2 text-2xl font-bold text-green-400">{card.value}</p>}</div>)}</section>
      <form onSubmit={event=>{event.preventDefault(); void save();}} className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6"><fieldset disabled={busy}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{purchases.some(p=>p.id===draft.id) ? "Edit purchase" : "New purchase"}</h2><button type="button" className={button} onClick={()=>{if(window.confirm("Start a new purchase? Unsaved edits will be discarded.")){setDraft(blankPurchase());setNewProductRow(null);setNewProduct(null);setMessage("");}}}>NEW PURCHASE</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-sm text-zinc-400">Supplier<input required maxLength={120} className={field} value={draft.supplier} onChange={e=>setDraft({...draft,supplier:e.target.value})} placeholder="Mid Atlantic Distribution" /></label><label className="text-sm text-zinc-400">Invoice / receipt number<input maxLength={120} className={field} value={draft.invoice} onChange={e=>setDraft({...draft,invoice:e.target.value})} /></label><label className="text-sm text-zinc-400">Purchase date<input required type="date" className={field} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})} /></label></div>
        <div className="mt-6 space-y-4">{draft.lines.map((line,index)=>{
          const options=variants.filter(v=>v.product_id===line.productId);
          const stock=options.length ? options.find(v=>v.id===line.variantId)?.stock : products.find(p=>p.id===line.productId)?.stock;
          return <div key={index} className="rounded-xl border border-zinc-800 bg-black p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-zinc-400">Product<select required className={field} value={line.productId} onChange={e=>{const available=variants.filter(v=>v.product_id===e.target.value);updateLine(index,{productId:e.target.value,variantId:available.length===1?available[0].id:"",productName:undefined,variantName:undefined});}}><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" onClick={() => openNewProduct(index)} className="mt-2 rounded-lg border border-green-700 bg-green-950 px-3 py-2 text-sm font-bold text-green-300 hover:bg-green-900">+ NEW PRODUCT</button><button type="button" onClick={() => setScanTarget({row:index,newProduct:false})} className="ml-2 mt-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-bold">SCAN BARCODE</button></label><label className="text-sm text-zinc-400">Flavor / variant<select required={options.length>0} disabled={!options.length} className={field} value={line.variantId} onChange={e=>updateLine(index,{variantId:e.target.value,variantName:undefined})}><option value="">{options.length ? "Choose variant" : "No variants"}</option>{options.map(v=><option key={v.id} value={v.id}>{variantName(v)}</option>)}</select></label></div>
          {newProductRow === index && newProduct && <div className="mt-4 rounded-xl border border-green-700 bg-green-950/30 p-4">
            <h3 className="font-bold text-green-300">Create a new product</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-zinc-300">New product name<input autoFocus maxLength={160} className={field} value={newProduct.name} onChange={e=>setNewProduct({...newProduct,name:e.target.value})} placeholder="Product name, including flavor if applicable" /></label>
              <label className="text-sm text-zinc-300">Category<input maxLength={80} className={field} value={newProduct.category} onChange={e=>setNewProduct({...newProduct,category:e.target.value})} placeholder="Accessories, drinks, etc." /></label>
              <label className="text-sm text-zinc-300">Selling price per unit ($)<input type="number" min={0} max={1000000} step="0.01" className={field} value={newProduct.priceCents/100} onChange={e=>setNewProduct({...newProduct,priceCents:Math.round(Number(e.target.value)*100)})} /></label>
              <label className="text-sm text-zinc-300">Barcode (optional)<input maxLength={80} className={field} value={newProduct.barcode} onChange={e=>setNewProduct({...newProduct,barcode:e.target.value})} /><button type="button" onClick={()=>setScanTarget({row:index,newProduct:true})} className="mt-2 rounded-lg border border-green-700 px-3 py-2 text-sm font-bold text-green-300">SCAN BARCODE</button></label>
            </div>
            <p className="mt-3 text-xs text-zinc-400">Creates the product with zero stock. Enter your purchased quantities below.</p>
            <div className="mt-3 flex gap-2"><button type="button" disabled={busy || !newProduct.name.trim() || !newProduct.category.trim()} className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold disabled:opacity-40" onClick={()=>void createProduct()}>CREATE &amp; SELECT PRODUCT</button><button type="button" className={button} onClick={()=>{setNewProductRow(null);setNewProduct(null);}}>CANCEL</button></div>
          </div>}
          <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm text-zinc-400">Packs purchased<input required type="number" min={1} max={100000} step={1} className={field} value={line.packs} onChange={e=>updateLine(index,{packs:Number(e.target.value)})}/></label><label className="text-sm text-zinc-400">Sellable units per pack<input required type="number" min={1} max={100000} step={1} className={field} value={line.unitsPerPack} onChange={e=>updateLine(index,{unitsPerPack:Number(e.target.value)})}/></label><label className="text-sm text-zinc-400">Cost per pack ($)<input required type="number" min={0} max={1000000} step="0.01" className={field} value={line.packCostCents/100} onChange={e=>updateLine(index,{packCostCents:Math.round(Number(e.target.value)*100)})}/></label></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-400">{line.packs*line.unitsPerPack} units purchased · {money(line.packCostCents/Math.max(1,line.unitsPerPack))} per unit · {stock ?? "—"} currently in stock</p><button type="button" className="text-sm text-red-400 underline" disabled={draft.lines.length===1} onClick={()=>setDraft({...draft,lines:draft.lines.filter((_,i)=>i!==index)})}>Remove item</button></div></div>;
        })}</div>
        <button type="button" className={button+" mt-4"} disabled={draft.lines.length>=100} onClick={()=>setDraft({...draft,lines:[...draft.lines,blankLine()]})}>+ ADD ITEM</button>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-zinc-400">Shipping, tax, and other purchase costs ($)<input required type="number" min={0} max={1000000} step="0.01" className={field} value={draft.extraCents/100} onChange={e=>setDraft({...draft,extraCents:Math.round(Number(e.target.value)*100)})}/></label><label className="text-sm text-zinc-400">Notes<textarea maxLength={2000} className={field} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Receipt details, damage, or adjustments"/></label></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-zinc-400">Purchase total</p><p className="text-3xl font-bold text-green-400">{money(total(draft))}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>download(draft)}>DOWNLOAD CSV</button><button className="rounded-xl bg-green-700 px-5 py-3 font-bold hover:bg-green-600 disabled:opacity-40" type="submit">{busy?"SAVING…":"SAVE PURCHASE"}</button></div></div>
        <p className="mt-4 text-sm text-amber-400">Add multiple rows with + ADD ITEM, then save. In Purchase history, choose RECEIVE & ADD STOCK when the goods arrive. Packs × units per pack are added for every item.</p>
      </fieldset></form>
      {!receivingReady && <p role="status" className="mt-6 rounded-xl border border-amber-700 bg-amber-950 p-4 text-sm text-amber-300">Stock receiving needs one-time database setup. You can add multiple items and save purchases now; the receive button unlocks after setup.</p>}
      <section className="mt-8"><h2 className="text-xl font-bold">Purchase history</h2><p className="mt-2 text-sm text-zinc-400">Only purchases saved here appear. Your historical receipts have not been imported yet.</p>{purchases.length===0?<p className="mt-4 rounded-xl border border-zinc-800 p-6 text-zinc-500">No purchases recorded yet. Add your first supplier receipt above.</p>:<div className="mt-4 space-y-3">{purchases.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-5"><div><p className="font-bold">{p.supplier} · {p.invoice || "No invoice number"}</p><p className="mt-1 text-sm text-zinc-400">{p.date} · {p.lines.length} items · {money(total(p))}</p><p className={p.receivedAt ? "mt-2 text-sm font-bold text-green-400" : "mt-2 text-sm font-bold text-amber-400"}>{p.receivedAt ? "RECEIVED — STOCK ADDED" : "SAVED — NOT RECEIVED"}</p></div><div className="flex gap-2"><button disabled={busy || !!p.receivedAt} className={button} onClick={()=>{if(window.confirm("Open this purchase? Unsaved edits will be discarded.")){setDraft({...p,version:p.version+1});setMessage("");window.scrollTo({top:0,behavior:"smooth"});}}}>EDIT</button>{!p.receivedAt && <button disabled={busy || !receivingReady} className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold disabled:opacity-40" onClick={() => void receive(p)}>RECEIVE &amp; ADD STOCK</button>}<button className={button} onClick={()=>download(p)}>DOWNLOAD</button></div></div>)}</div>}</section>
    </>}
    {scanTarget && <BarcodeScanner onScan={applyBarcode} onClose={()=>setScanTarget(null)} />}
  </div></main>;
}
