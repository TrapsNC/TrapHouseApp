"use client";
import { createId } from "@/lib/create-id";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StoreFooter,StoreHeader } from "@/app/components/StoreChrome";
import { readCart,writeCart } from "@/lib/cart";
import type { CartItem,Fulfillment } from "@/lib/cart";
import type { Quote } from "@/lib/quote";
import PaymentOptions from "@/app/components/PaymentOptions";

type Receipt={id:string;reference:string;subtotal:number;fulfillment:Fulfillment;createdAt:string;items:CartItem[];demo:true};
const money=(value:number)=>`$${value.toFixed(2)}`;
function cartItems(quote:Quote):CartItem[] {
 return quote.items.map(item=>({lineId:item.lineId,productId:item.productId,variantId:item.variantId,name:item.name,variant:item.variant,price:item.price,quantity:item.quantity,fulfillment:item.fulfillment,image:item.image}));
}

export default function CheckoutPage() {
 const [items,setItems]=useState<CartItem[]>([]);
 const [quote,setQuote]=useState<Quote|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [fulfillment,setFulfillment]=useState<Fulfillment|"">("");
 const [receipt,setReceipt]=useState<Receipt|null>(null);
 const [busy,setBusy]=useState(false);
 const [paymentError,setPaymentError]=useState("");
 const [outcome,setOutcome]=useState("approved");
 const sheet=useRef<HTMLDialogElement>(null);
 const requestId=useRef("");
 useEffect(()=>{
  let cancelled=false;
  async function load() {
   try {
    const saved=readCart();
    if(cancelled) return;
    setItems(saved);
    const methods=new Set(saved.map(item=>item.fulfillment));
    if(methods.size===1) setFulfillment(saved[0].fulfillment);
    if(!saved.length) {setLoading(false);return;}
    const response=await fetch("/api/cart/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:saved})});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error);
    if(!cancelled) {setQuote(result);setItems(cartItems(result));}
   } catch(error) {if(!cancelled) setError(error instanceof Error?error.message:"Checkout could not be loaded.");}
   finally {if(!cancelled) setLoading(false);}
  }
  void load();
  return ()=>{cancelled=true;};
 },[]);
 function chooseFulfillment(value:Fulfillment) {
  setFulfillment(value);setItems(current=>current.map(item=>({...item,fulfillment:value})));
  requestId.current="";
 }
 function openPayment() {
  if(!quote?.canCheckout||!fulfillment) return;
  setPaymentError("");sheet.current?.showModal();
 }
 async function simulate() {
  if(busy||!quote||!fulfillment) return;
  if(outcome==="declined") {setPaymentError("Demo payment declined. No charge or order was made. Choose Approved to try the success flow.");return;}
  setBusy(true);setPaymentError("");
  requestId.current ||= createId();
  try {
   const response=await fetch("/api/checkout/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:requestId.current,items:items.map(item=>({...item,fulfillment})),fulfillment,expectedSubtotalCents:Math.round(quote.subtotal*100)})});
   const result=await response.json();
   if(!response.ok) {
    if(result.quote) {setQuote(result.quote);setItems(cartItems(result.quote).map(item=>({...item,fulfillment})));requestId.current="";}
    throw new Error(result.error);
   }
   if(!result.demo||!result.receipt?.demo) throw new Error("The demo receipt could not be verified.");
   setReceipt(result.receipt);
   try {sessionStorage.setItem("trap-demo-receipt",JSON.stringify(result.receipt));} catch {}
   sheet.current?.close();
  } catch(error) {setPaymentError(error instanceof Error?error.message:"The demo could not finish. Please try again.");}
  finally {setBusy(false);}
 }
 function saveReviewedCart() {
  try {writeCart(items);setError("");} catch {setError("Your reviewed cart could not be saved on this device.");}
 }
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container">
  <div className="demo-banner"><span className="demo-badge">DEMO</span><p>Apple Pay simulation. No real charge, order, inventory reservation or customer information.</p></div>
  {receipt ? <section className="demo-receipt"><div className="demo-success-icon" aria-hidden="true">✓</div><p className="store-kicker">DEMO COMPLETE</p><h1 className="store-title">Your demo receipt is ready.</h1><p>This payment was simulated. No money was charged and no real order was placed.</p><div className="checkout-box"><p className="receipt-reference">{receipt.reference}</p><p>Demo amount: <strong>{money(Number(receipt.subtotal))}</strong></p><p>Fulfillment preference: {receipt.fulfillment}</p><p>Saved to your separate demo receipts in Supabase.</p></div><p className="store-muted">Your shopping cart has been kept so you can continue testing.</p>{receipt.fulfillment==="delivery"&&<Link href="/delivery" className="store-primary cart-checkout-link">TRACK DEMO DELIVERY →</Link>}<Link href="/cart" className="store-primary cart-checkout-link">RETURN TO CART</Link><Link href="/#shop" className="cart-back-link">Continue shopping</Link></section> : <>
   <p className="store-kicker">TRAP HOUSE NC</p><h1 className="store-title">Review your checkout.</h1>
   {loading ? <p role="status">Checking current prices and stock…</p> : <>
    {error && <p role="alert" className="cart-error">{error}</p>}
    {!items.length ? <div className="cart-empty"><p>Your cart is empty.</p><Link href="/#shop" className="store-primary">EXPLORE PRODUCTS</Link></div> : <div className="checkout-layout"><div>
     <section className="checkout-box"><h2>Fulfillment</h2><p className="store-muted">Select one method for this demo. Delivery areas and shipping eligibility are not validated in this simulation.</p><div className="checkout-methods">{([['pickup','Store pickup'],['delivery','Local delivery'],['shipping','Shipping']] as const).map(([value,label])=><label key={value} className={fulfillment===value?"checkout-method selected":"checkout-method"}><input type="radio" name="fulfillment" value={value} checked={fulfillment===value} onChange={()=>chooseFulfillment(value)}/><span>{label}</span></label>)}</div>{!fulfillment && <p className="store-muted">Your cart has mixed fulfillment choices. Select one to continue.</p>}</section>
     <PaymentOptions disabled={!quote?.canCheckout||!fulfillment} total={quote?.subtotal || 0} onApplePay={openPayment}/>
     <Link className="cart-back-link" href="/cart">← Edit your cart</Link>
    </div><aside className="checkout-summary"><h2 className="text-xl">Order summary</h2>{quote?.items.map(item=><div key={item.lineId} className="store-cart-line"><div className="cart-item-heading">{item.image && <img src={item.image} alt=""/>}<div><strong>{item.name}</strong><p>{item.variant}</p><p>{item.quantity} × {money(item.price)}</p></div></div>{item.error && <p className="cart-error">{item.error}</p>}{item.priceChanged && <p className="cart-notice">Price updated to {money(item.price)} each.</p>}</div>)}<p className="store-cart-total">Demo subtotal <strong>{money(quote?.subtotal || 0)}</strong></p><p className="store-muted">Taxes and fulfillment fees are excluded from this demo. Inventory is checked again when you simulate payment.</p>{quote && !quote.canCheckout && <p className="cart-error">Fix the highlighted items in your cart before continuing.</p>}<button className="cart-back-link" onClick={saveReviewedCart}>Save reviewed prices and fulfillment to cart</button></aside></div>}
   </>}
  </>}
 </div><StoreFooter/>
 <dialog ref={sheet} className="demo-payment-sheet" onCancel={event=>{if(busy)event.preventDefault();}}>
  <header className="demo-sheet-header"><strong>Apple Pay <span className="demo-badge">DEMO</span></strong><button disabled={busy} onClick={()=>sheet.current?.close()}>Cancel</button></header>
  <div className="demo-sheet-body"><p className="demo-sheet-disclaimer">SIMULATION ONLY · NO MONEY WILL BE CHARGED</p><div className="demo-card"><div className="demo-card-mark">DEMO CARD</div><strong>Sample Wallet Card</strong><p>•••• 0000 · Not a real card</p></div><div className="demo-sheet-row"><span>Merchant</span><strong>TRAP HOUSE NC</strong></div><div className="demo-sheet-row"><span>Fulfillment</span><strong>{fulfillment === "pickup" ? "Store pickup" : fulfillment === "delivery" ? "Local delivery" : "Shipping"}</strong></div>{fulfillment!=="pickup" && <div className="demo-sheet-row"><span>Demo address</span><strong>123 Demo Lane<br/>Sample City, NC</strong></div>}<div className="demo-sheet-row demo-sheet-amount"><span>Demo amount</span><strong>{money(quote?.subtotal || 0)}</strong></div><label className="demo-outcome">Simulation result<select disabled={busy} value={outcome} onChange={event=>{setOutcome(event.target.value);setPaymentError("");}}><option value="approved">Approved</option><option value="declined">Declined</option></select></label>{paymentError && <p role="alert" className="cart-error">{paymentError}</p>}<button className="demo-pay-button" disabled={busy||!quote?.canCheckout} onClick={simulate}>{busy ? "SAVING DEMO RECEIPT…" : "SIMULATE PAYMENT"}</button><p className="store-muted" style={{textAlign:"center",marginTop:14}}>No card, passcode, fingerprint or Face ID is requested.</p></div>
 </dialog>
 </main>;
}


