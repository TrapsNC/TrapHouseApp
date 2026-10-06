"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { collectionFor, collections } from "@/lib/catalog";
import { StoreFooter, StoreHeader } from "./components/StoreChrome";

type Product = { id:string; name:string; category:string; price:number|string; stock:number; image_url?:string|null; handle?:string|null };
const collectionImages = ["dispos.png?v=1774485107", "thca.png?v=1774485527", "cigars.png?v=1774485888", "ACCESSORIES.png?v=1774486254"];

export default function Home() {
 const [verified,setVerified] = useState(false);
 const [products,setProducts] = useState<Product[]>([]);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState("");
 const [search,setSearch] = useState("");
 const [category,setCategory] = useState("ALL");
 const [sort,setSort] = useState("newest");
 const [inStock,setInStock] = useState(false);
 useEffect(() => {
   const initial = new URLSearchParams(window.location.search).get("category");
   if(initial) setCategory(initial);
   setVerified(sessionStorage.getItem("trap-age-confirmed") === "true");
   async function load() {
    const {data,error} = await supabase.from("products").select("*").eq("active",true).order("created_at",{ascending:false});
    if(error) setError("Inventory could not be loaded. Please refresh and try again.");
    else setProducts(data || []);
    setLoading(false);
   }
   void load();
 },[]);
 const filtered = useMemo(() => {
   const result = products.filter(product => {
    const group = collectionFor(product.category,product.name);
    return (category === "ALL" || group === category) && (!inStock || product.stock > 0) && `${product.name} ${group}`.toLowerCase().includes(search.trim().toLowerCase());
   });
   if(sort === "price-low") result.sort((a,b)=>Number(a.price)-Number(b.price));
   if(sort === "price-high") result.sort((a,b)=>Number(b.price)-Number(a.price));
   if(sort === "name") result.sort((a,b)=>a.name.localeCompare(b.name));
   return result;
 },[products,category,inStock,search,sort]);
 const categoryOptions = Array.from(new Set([...collections,...products.map(product=>collectionFor(product.category,product.name))]));
 function chooseCategory(value:string) {
  setCategory(value);
  const url = new URL(window.location.href);
  if(value === "ALL") url.searchParams.delete("category"); else url.searchParams.set("category",value);
  window.history.replaceState(null,"",url);
  document.getElementById("shop")?.scrollIntoView({behavior:"smooth"});
 }
 if(!verified) return <main style={{background:"#050505",color:"white"}} className="storefront min-h-screen flex items-center justify-center bg-black p-6 text-white"><section className="max-w-md border border-zinc-700 p-10 text-center"><p className="text-xs tracking-widest">WELCOME TO</p><h1 className="mt-4 text-4xl font-bold">TRAP HOUSE NC</h1><p className="mt-6 text-zinc-300">You must be 21 or older to enter.</p><button className="mt-8 w-full bg-white p-4 font-bold text-black" onClick={()=>{sessionStorage.setItem("trap-age-confirmed","true");setVerified(true);}}>I AM 21+</button><a className="mt-4 block border border-zinc-500 p-4" href="https://google.com">EXIT</a><p className="mt-6 text-xs text-zinc-400">Age confirmation does not replace legally required age verification for regulated purchases.</p></section></main>;
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container">
  <p className="store-kicker">TRAP HOUSE NC / COLLECTIONS</p><h1 className="store-title">Find your next favorite.</h1><p className="store-intro">Explore disposables, THCA, tobacco and everyday essentials. Choose your products, then select pickup, local delivery or shipping.</p>
  <section aria-label="Shop collections" className="store-collections">{collections.map((group,index)=><button className="store-collection" key={group} onClick={()=>chooseCategory(group)}><img src={`https://traphousenc.com/cdn/shop/collections/${collectionImages[index]}&width=600`} alt=""/><span>{group} <span aria-hidden="true" style={{display:"inline"}}>↗</span></span></button>)}</section>
  <section id="shop" style={{scrollMarginTop:24}}><p className="store-kicker">SHOP THE COLLECTION</p><h2 className="store-title">{category === "ALL" ? "All products" : category.charAt(0)+category.slice(1).toLowerCase()}</h2>
   <div className="store-tools"><input aria-label="Search products" placeholder="Search products…" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="Collection" value={category} onChange={event=>chooseCategory(event.target.value)}><option value="ALL">All collections</option>{categoryOptions.map(group=><option key={group}>{group}</option>)}</select><select aria-label="Sort products" value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select><label className="text-xs flex items-center gap-2"><input type="checkbox" checked={inStock} onChange={event=>setInStock(event.target.checked)} style={{minWidth:0,flex:0}}/>In stock only</label></div>
   <p className="store-result-count" role="status">{loading ? "Loading products…" : error || `${filtered.length} products`}</p>
   <div className="store-grid">{filtered.map(product=>{const content=<><div className="store-card-image">{product.image_url ? <img loading="lazy" src={product.image_url} alt={product.name}/> : <div className="aspect-square flex items-center justify-center text-sm text-zinc-400">TRAP HOUSE</div>}{product.stock <= 0 && <span className="store-card-badge">SOLD OUT</span>}</div><p className="store-kicker">{collectionFor(product.category,product.name)}</p><h3>{product.name}</h3><p className="store-card-price">${Number(product.price).toFixed(2)}</p><span className="store-card-action">{product.stock <= 0 ? "VIEW PRODUCT · SOLD OUT" : "CHOOSE OPTIONS"}</span></>;return <Link className="store-card" key={product.id} href={`/product/${product.handle || product.id}`}>{content}</Link>;})}</div>
   {!loading && !error && !filtered.length && <div className="py-12 text-center"><p>No products match your filters.</p><button className="mt-4 underline" onClick={()=>{setSearch("");setInStock(false);chooseCategory("ALL");}}>Clear filters</button></div>}
  </section>
 </div><StoreFooter/></main>;
}
