"use client";
import Link from "next/link";
import DemoInstall from "@/app/components/DemoInstall";
import { useEffect, useRef, useState } from "react";
import { StoreHeader, StoreFooter } from "@/app/components/StoreChrome";
import { demoDiscount } from "@/lib/demo-discount";
import { createId } from "@/lib/create-id";
type SampleOrder = { id:string; total:number; quantity:number; read:boolean };
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
export default function DemoPage() {
 const [quantity,setQuantity]=useState(2);
 const [code,setCode]=useState("");
 const [applied,setApplied]=useState("");
 const [error,setError]=useState("");
 const [sound,setSound]=useState(false);
 const [soundMessage,setSoundMessage]=useState("");
 const [orders,setOrders]=useState<SampleOrder[]>([]);
 const [popup,setPopup]=useState<SampleOrder|null>(null);
 const audio=useRef<AudioContext|null>(null);
 const subtotal=quantity*1500;
 const discount=applied?demoDiscount(applied,subtotal):{cents:0,error:""};
 const total=subtotal-discount.cents;
 const unread=orders.filter(order=>!order.read).length;
 useEffect(()=>()=>{void audio.current?.close();},[]);
 async function ding() {
  try {
   audio.current ||= new AudioContext();
   await audio.current.resume();
   const start=audio.current.currentTime;
   for(const [offset,frequency] of [[0,880],[0.18,1174]] as const) {
    const oscillator=audio.current.createOscillator();
    const gain=audio.current.createGain();
    oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0.0001,start+offset);
    gain.gain.exponentialRampToValueAtTime(0.18,start+offset+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001,start+offset+0.45);
    oscillator.connect(gain);gain.connect(audio.current.destination);
    oscillator.start(start+offset);oscillator.stop(start+offset+0.5);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
   }
   return true;
  } catch {setSoundMessage("Sound is unavailable on this device. Popup alerts still work.");return false;}
 }
 async function enableSound() {
  const enabled=await ding();setSound(enabled);
  if(enabled) setSoundMessage("Sound enabled. Keep this page open and your device volume on.");
 }
 function applyCode() {
  const result=demoDiscount(code,subtotal);
  setError(result.error);
  if(!result.error)setApplied(code.trim().toUpperCase());
 }
 function sampleOrder() {
  const order={id:createId(),quantity,total,read:false};
  setOrders(current=>[order,...current]);setPopup(order);
  if(sound)void ding();
 }
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container">
  <div className="demo-banner"><span className="demo-badge">SANDBOX</span><p>Sample tote bags only. No real order, payment, inventory change or customer data.</p></div>
  <h1 className="store-title">Discounts & order alerts demo.</h1><p className="store-muted">This sandbox is separate from the storefront checkout. Alerts only run on this open page; no background push or cross-device notifications.</p>
  <DemoInstall/><div className="checkout-layout" style={{marginTop:28}}><section className="checkout-box"><h2>Sample checkout</h2><p>Sample canvas tote · $15.00 each</p><div className="checkout-methods"><button className="store-primary" aria-label="Decrease sample quantity" disabled={quantity===1} onClick={()=>setQuantity(value=>value-1)}>−</button><span aria-live="polite">Quantity: {quantity}</span><button className="store-primary" aria-label="Increase sample quantity" disabled={quantity===99} onClick={()=>setQuantity(value=>value+1)}>+</button></div>
   <p className="store-muted">Try DEMO10 for 10% off or SAVE5 for $5 off. Both need $25 minimum. EXPIRED tests an expired code.</p>
   <form onSubmit={event=>{event.preventDefault();applyCode();}}><label htmlFor="demo-code">Discount code</label><input id="demo-code" className="demo-code-input" value={code} onChange={event=>setCode(event.target.value)} autoComplete="off"/><button className="store-primary" type="submit">APPLY CODE</button></form>
   {(error||discount.error)&&<p role="alert" className="cart-error">{error||discount.error}</p>}
   {applied&&!discount.error&&<p role="status">{applied} applied. <button className="cart-back-link" onClick={()=>{setApplied("");setError("");}}>Remove code</button></p>}
   <p className="store-cart-total">Subtotal <strong>{money(subtotal)}</strong></p><p className="store-cart-total">Discount <strong>−{money(discount.cents)}</strong></p><p className="store-cart-total">Sample total <strong>{money(total)}</strong></p><button className="store-primary cart-checkout-link" onClick={sampleOrder}>CREATE SAMPLE ORDER & TEST ALERT</button>
  </section><section className="checkout-box"><h2>Owner alerts <span className="demo-badge">{unread} unread</span></h2><button className="store-primary" onClick={()=>{if(sound){setSound(false);setSoundMessage("Sound muted.");}else void enableSound();}}>{sound?"MUTE DING":"ENABLE & TEST DING"}</button><p role="status" className="store-muted">{soundMessage}</p><button className="cart-back-link" disabled={!unread} onClick={()=>setOrders(current=>current.map(order=>({...order,read:true})))}>Mark all read</button>
   {!orders.length&&<p className="store-muted">Create a sample order to see a popup and unread count.</p>}
   {orders.map(order=><div className="store-cart-line" key={order.id}><strong>{order.read?"Read":"New"} · SAMPLE-{order.id.slice(0,8).toUpperCase()}</strong><p>{order.quantity} sample tote bags · {money(order.total)}</p><button className="cart-back-link" disabled={order.read} onClick={()=>setOrders(current=>current.map(item=>item.id===order.id?{...item,read:true}:item))}>Mark read</button></div>)}
  </section></div><Link href="/" className="cart-back-link">← Return to storefront</Link>
 </div><StoreFooter/>{popup&&<aside className="demo-order-popup" role="status" aria-live="polite"><button className="demo-popup-close" aria-label="Dismiss sample notification" onClick={()=>setPopup(null)}>×</button><span className="demo-badge">SAMPLE ORDER</span><h2>New order received</h2><p>{popup.quantity} sample tote bags · {money(popup.total)}</p><p>SAMPLE-{popup.id.slice(0,8).toUpperCase()}</p><button className="cart-back-link" onClick={()=>{setOrders(current=>current.map(order=>order.id===popup.id?{...order,read:true}:order));setPopup(null);}}>Mark read & dismiss</button></aside>}</main>;
}

