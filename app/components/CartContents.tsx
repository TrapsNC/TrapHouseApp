"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartTotal, MAX_QUANTITY, readCart, writeCart } from "@/lib/cart";
import type { CartItem } from "@/lib/cart";
import type { Quote } from "@/lib/quote";

export function CartContents({ onNavigate }: { onNavigate?: () => void }) {
  const [items,setItems] = useState<CartItem[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [checking,setChecking] = useState(false);
  const [quote,setQuote] = useState<Quote|null>(null);
  useEffect(() => {
    function load() { try { setItems(readCart()); setError(""); } catch { setError("Your saved cart could not be read. Please contact the shop if this continues."); } finally { setLoaded(true); } }
    load();
    window.addEventListener("storage",load);
    window.addEventListener("trap-cart-updated",load);
    return () => {window.removeEventListener("storage",load);window.removeEventListener("trap-cart-updated",load);};
  },[]);
  function update(next:CartItem[]) {
    try { writeCart(next); setItems(next); setQuote(null); setError(""); setNotice(""); }
    catch {setError("Your changes could not be saved on this device.");}
  }
  async function check() {
    setChecking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cart/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items})});
      const result = await response.json();
      if(!response.ok) throw new Error(result.error);
      const checked = result as Quote;
      const next = checked.items.map(item => ({lineId:item.lineId,productId:item.productId,variantId:item.variantId,name:item.name,variant:item.variant,price:item.price,quantity:item.quantity,fulfillment:item.fulfillment,image:item.image}));
      writeCart(next); setItems(next); setQuote(checked);
      setNotice(checked.items.some(item=>item.priceChanged) ? "Prices changed. Your cart now shows the latest prices; review them before checkout." : checked.canCheckout ? "Prices and availability checked. Your cart is ready to review." : "Some items need attention before checkout.");
    } catch (error) {setError(error instanceof Error ? error.message : "Cart check failed. Please try again.");}
    finally {setChecking(false);}
  }
  if(!loaded) return <p className="store-muted">Loading your cart…</p>;
  return <>
    {error && <p role="alert" className="cart-error">{error}</p>}
    {notice && <p role="status" className="cart-notice">{notice}</p>}
    {!items.length && !error && <div className="cart-empty"><p>Your cart is empty.</p><Link href="/#shop" onClick={onNavigate} className="store-primary">EXPLORE PRODUCTS</Link></div>}
    {items.map(item => <article key={item.lineId} className="store-cart-line">
      <div className="cart-item-heading">{item.image && <img src={item.image} alt=""/>}<div><strong>{item.name}</strong>{item.variant && <p>{item.variant}</p>}<p>${item.price.toFixed(2)} each</p></div></div>
      <div className="cart-item-controls"><div className="cart-quantity"><button aria-label={`Decrease ${item.name} ${item.variant || ""} quantity`} disabled={checking || item.quantity <= 1} onClick={()=>update(items.map(line=>line.lineId === item.lineId ? {...line,quantity:line.quantity-1} : line))}>−</button><span aria-label="Quantity">{item.quantity}</span><button aria-label={`Increase ${item.name} ${item.variant || ""} quantity`} disabled={checking || item.quantity >= MAX_QUANTITY} onClick={()=>update(items.map(line=>line.lineId === item.lineId ? {...line,quantity:line.quantity+1} : line))}>+</button></div><strong>${(item.quantity*item.price).toFixed(2)}</strong><button className="cart-remove" disabled={checking} onClick={()=>update(items.filter(line=>line.lineId!==item.lineId))} aria-label={`Remove ${item.name} ${item.variant || ""}`}>Remove</button></div>
      <label className="cart-fulfillment">Fulfillment<select aria-label={`Fulfillment for ${item.name} ${item.variant || ""}`} disabled={checking} value={item.fulfillment} onChange={event=>update(items.map(line=>line.lineId===item.lineId ? {...line,fulfillment:event.target.value as CartItem["fulfillment"]} : line))}><option value="pickup">Store pickup</option><option value="delivery">Local delivery</option><option value="shipping">Shipping</option></select></label>
      {quote?.items.find(line=>line.lineId===item.lineId)?.error && <p className="cart-error">{quote.items.find(line=>line.lineId===item.lineId)?.error}</p>}
    </article>)}
    {!!items.length && <><p className="store-cart-total">Subtotal <strong>${cartTotal(items).toFixed(2)}</strong></p><p className="store-muted">Taxes and any fulfillment fees are calculated at checkout. Availability is checked again before ordering.</p><button className="store-primary" disabled={checking || !!error} onClick={check}>{checking ? "CHECKING…" : "CHECK PRICES & STOCK"}</button>{quote?.canCheckout && <Link className="store-primary cart-checkout-link" href="/checkout" onClick={onNavigate}>REVIEW CHECKOUT →</Link>}</>}
  </>;
}
