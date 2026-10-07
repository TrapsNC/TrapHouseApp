"use client";

import { useState } from "react";

type Method = "apple" | "cashapp" | "zelle" | "cash";
const cashtag = (process.env.NEXT_PUBLIC_CASH_APP_CASHTAG || "traphousedirect").trim().replace(/^\$/, "");
const zelleRecipient = (process.env.NEXT_PUBLIC_ZELLE_RECIPIENT || "").trim();
const cashQr = process.env.NEXT_PUBLIC_CASH_APP_QR_IMAGE || "/payments/cash-app.svg";
const zelleQr = process.env.NEXT_PUBLIC_ZELLE_QR_IMAGE || "";

export default function PaymentOptions({ disabled, total, onApplePay, onMethodChange }: { disabled: boolean; total: number; onApplePay: () => void; onMethodChange?: (method: Method) => void }) {
 const [method, setMethod] = useState<Method>("apple");
 const [copied, setCopied] = useState("");
 const [copyError, setCopyError] = useState("");
 const recipient = method === "cashapp" ? (cashtag ? `$${cashtag}` : "") : zelleRecipient;
 const qr = method === "cashapp" ? cashQr : zelleQr;
 async function copyRecipient() {
  try { await navigator.clipboard.writeText(recipient); setCopied(recipient); setCopyError(""); }
  catch { setCopyError("Copy is unavailable. Select the payment details below to copy them."); }
 }
 return <section className="checkout-box"><h2>Payment</h2>
  <div className="checkout-methods" role="group" aria-label="Payment method">
   {([["apple", "Apple Pay · demo"], ["cashapp", "Cash App"], ["zelle", "Zelle"], ["cash", "Cash"]] as const).map(([value, label]) => <label key={value} className={method === value ? "checkout-method selected" : "checkout-method"}><input type="radio" name="payment-method" value={value} checked={method === value} onChange={() => { setMethod(value); onMethodChange?.(value); setCopied(""); setCopyError(""); }}/><span>{label}</span></label>)}
  </div>
  {method === "apple" ? <><div className="demo-wallet-preview"><span className="demo-wallet-symbol" aria-hidden="true">◈</span><div><strong>Apple Pay demo</strong><p className="store-muted">Preview a wallet-style payment sheet without a processor, real card or Face ID.</p></div></div><button className="demo-pay-button" disabled={disabled} onClick={onApplePay}>PREVIEW APPLE PAY <span>DEMO</span></button><p className="store-muted" style={{marginTop:14}}>This is a simulated interface, not an Apple Pay session.</p></> : method === "cash" ? <div className="manual-payment-panel">
   <h3>Pay with cash</h3>
   <p>Reviewed total: <strong>${total.toFixed(2)}</strong></p>
   <p>Cash rounding adjustment: <strong>{Math.round(total) - total < 0 ? "−" : "+"}${Math.abs(Math.round(total) - total).toFixed(2)}</strong></p>
   <p className="store-cart-total">Rounded cash amount <strong>${Math.round(total).toFixed(2)}</strong></p>
   <p className="cart-notice">Cash orders are rounded to the nearest whole dollar. Amounts ending in 50¢ or more round up; under 50¢ round down.</p>
   <p className="store-muted">Pay at local meetup or to your delivery driver. Confirm the final total with Trap House NC before paying. The local delivery fee is included when delivery is selected.</p>
   <p className="store-muted">Choosing cash does not place an order or mark it paid.</p>
   <a className="cart-back-link" href="/pages/contact" target="_blank" rel="noopener noreferrer">Contact Trap House NC</a>
  </div> : <div className="manual-payment-panel">
   <h3>{method === "cashapp" ? "Pay with Cash App" : "Pay with Zelle"}</h3>
   <p>Reviewed total: <strong>${total.toFixed(2)}</strong></p>
   <p className="cart-notice">This checkout is still a demo. Contact Trap House NC to confirm your order, final total and payment recipient before sending money.</p>
   {recipient ? <><p className="manual-payment-recipient">{recipient}</p><button className="cart-back-link" onClick={copyRecipient}>Copy payment details</button>{copied === recipient && <p role="status">Payment details copied.</p>}{copyError && <p role="alert">{copyError}</p>}</> : <p className="store-muted">The shop’s {method === "cashapp" ? "Cash App cashtag" : "Zelle recipient"} is being connected.</p>}
   {qr ? <figure className="manual-payment-qr"><img src={qr} alt={`${method === "cashapp" ? "Cash App" : "Zelle"} payment QR code for Trap House NC`}/><figcaption>Scan with your phone. Verify the recipient before paying.</figcaption></figure> : <p className="store-muted">The shop’s verified payment QR code will appear here once added.</p>}
   {method === "cashapp" && cashtag && <a className="store-primary cart-checkout-link" href={`https://cash.app/$${encodeURIComponent(cashtag)}`} target="_blank" rel="noopener noreferrer">OPEN CASH APP →</a>}
   {method === "zelle" && <p className="store-muted">Use Zelle inside your banking app. A bank-issued Zelle code is required for scanning.</p>}
   <p className="store-muted">Scanning or opening an app does not confirm payment. The shop must verify receipt.</p>
   <a className="cart-back-link" href="/pages/contact" target="_blank" rel="noopener noreferrer">Contact Trap House NC</a>
  </div>}
 </section>;
}


