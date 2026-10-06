"use client";

import Link from "next/link";
import { useCallback,useEffect,useMemo,useState,useSyncExternalStore } from "react";
import { StoreFooter,StoreHeader } from "@/app/components/StoreChrome";

const steps=["Preparing your order","Demo driver assigned","Demo driver on the way","Demo driver arriving","Demo delivery complete"];
type DemoReceipt={reference:string;subtotal:number;fulfillment:string;demo:true;id:string};
const subscribe = (callback: () => void) => { window.addEventListener("storage",callback); return () => window.removeEventListener("storage",callback); };
const subscribeProgress=(callback:()=>void)=>{window.addEventListener("trap-demo-delivery-updated",callback);window.addEventListener("storage",callback);return()=>{window.removeEventListener("trap-demo-delivery-updated",callback);window.removeEventListener("storage",callback);};};
function readProgress(key:string){try{const value=Number(sessionStorage.getItem(key)||0);return Number.isInteger(value)&&value>=0&&value<=4?value:0;}catch{return 0;}}
const subscribeHydration = () => () => {};
export default function DeliveryPage() {
 const loaded=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
 const storedReceipt=useSyncExternalStore(subscribe,()=>{try{return sessionStorage.getItem("trap-demo-receipt");}catch{return null;}},()=>null);
 const receipt=useMemo<DemoReceipt|null>(()=>{try{const saved=JSON.parse(storedReceipt||"null");return saved?.demo===true&&saved.fulfillment==="delivery"&&typeof saved.reference==="string"?saved:null;}catch{return null;}},[storedReceipt]);
 const progressKey=`trap-demo-delivery-${receipt?.id || "none"}`;
 const step=useSyncExternalStore(subscribeProgress,()=>readProgress(progressKey),()=>0);
 const setStep=useCallback((next:number|((current:number)=>number))=>{try{sessionStorage.setItem(progressKey,String(typeof next==="function"?next(readProgress(progressKey)):next));window.dispatchEvent(new Event("trap-demo-delivery-updated"));}catch{}},[progressKey]);
 const [running,setRunning]=useState(false);
 useEffect(()=>{
  if(!running||!receipt||step>=4)return;
  const timer=setTimeout(()=>setStep(current=>Math.min(4,current+1)),5000);
  return ()=>clearTimeout(timer);
 },[running,step,receipt,setStep]);

 const progress=step/4;
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container" style={{maxWidth:1000}}><div className="demo-banner"><span className="demo-badge">DEMO</span><p>Simulated delivery tracking. No real driver, location or delivery has been booked.</p></div><p className="store-kicker">TRAP HOUSE NC / DELIVERY</p><h1 className="store-title">Follow your delivery.</h1>
  {!loaded?<p>Loading demo delivery…</p>:!receipt?<section className="checkout-box"><h2>No demo delivery yet.</h2><p className="store-muted">Choose local delivery during the Apple Pay demo to try driver tracking.</p><Link className="store-primary cart-checkout-link" href="/cart">GO TO CART</Link></section>:<>
   <div className="delivery-heading"><div><p className="receipt-reference">{receipt.reference}</p><p className="store-muted">Apple Pay demo · ${Number(receipt.subtotal).toFixed(2)}</p></div><span className="delivery-status" role="status">{steps[step]}</span></div>
   <div className="delivery-layout"><section className="delivery-map" aria-label="Simulated route diagram"><div className="delivery-map-label">SIMULATED ROUTE · NOT A LIVE MAP</div><svg viewBox="0 0 600 380" role="img" aria-label={`Demo driver progress: ${Math.round(progress*100)} percent`}><defs><pattern id="blocks" width="75" height="75" patternUnits="userSpaceOnUse"><rect width="60" height="60" x="8" y="8" rx="8" fill="#e7ebdf"/></pattern></defs><rect width="600" height="380" fill="#f2f4ed"/><rect width="600" height="380" fill="url(#blocks)"/><path d="M60 280H220V125H500" fill="none" stroke="white" strokeWidth="34"/><path d="M60 280H220V125H500" fill="none" stroke="#b9c1b1" strokeWidth="3" strokeDasharray="8 8"/><path d="M60 280H220V125H500" fill="none" stroke="#121212" strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress*100} 100`}/><circle cx="60" cy="280" r="16" fill="#121212"/><text x="60" y="322" textAnchor="middle" fontSize="14">Shop</text><circle cx="500" cy="125" r="16" fill="#6a854a"/><text x="500" y="168" textAnchor="middle" fontSize="14">Demo address</text><g transform={step===0?"translate(60 280)":step===1?"translate(180 280)":step===2?"translate(220 170)":step===3?"translate(380 125)":"translate(500 125)"} style={{transition:"transform 1s ease"}}><circle r="23" fill="#fff" stroke="#121212" strokeWidth="3"/><text x="0" y="7" textAnchor="middle" fontSize="21">↗</text></g></svg><div className="delivery-map-controls"><button className="store-primary" onClick={()=>setRunning(value=>!value)} disabled={step>=4}>{step>=4?"DEMO COMPLETE":running?"PAUSE DEMO DRIVER":"START DEMO DRIVER"}</button><button className="cart-back-link" onClick={()=>{setStep(0);setRunning(false);}}>Restart simulation</button></div></section>
    <aside><section className="checkout-box"><h2>Delivery progress</h2><ol className="delivery-steps">{steps.map((label,index)=><li key={label} className={index<=step?"complete":""}><span aria-hidden="true">{index<step?"✓":index+1}</span>{label}</li>)}</ol><p className="store-muted">The demo advances every five seconds after you press Start. Real driver tracking will need a driver app or delivery service connection.</p></section><section className="checkout-box"><h2>Need to change delivery?</h2><p className="store-muted">Speak with the shop before requesting changes or cancellation. Delivery changes cannot be made here.</p><a className="store-primary cart-checkout-link" href="/pages/contact" target="_blank" rel="noreferrer">CONTACT TRAP HOUSE</a></section></aside>
   </div>
  </>}
 </div><StoreFooter/></main>;
}

