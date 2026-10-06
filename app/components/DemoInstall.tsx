"use client";
import { useEffect, useState } from "react";
export default function DemoInstall() {
 const [status,setStatus]=useState("For installation, open this demo at an HTTPS address.");
 useEffect(()=>{
  const timer=setTimeout(()=>{
   if(window.matchMedia("(display-mode: standalone)").matches) setStatus("Opened as an installed Home Screen app.");
   else if(window.isSecureContext) setStatus("Ready to add to your Home Screen.");
   else setStatus("Wi-Fi preview: move the demo to HTTPS for proper app installation. Push notifications are not connected.");
  },0);
  return()=>clearTimeout(timer);
 },[]);
 return <section className="checkout-box" style={{marginTop:24}}><h2>Install the sample demo</h2><p role="status" className="store-muted">{status}</p><p><strong>iPhone/iPad:</strong> Open this page in Safari, tap Share → Add to Home Screen → Add.</p><p><strong>Android:</strong> Open the browser menu and choose Install app or Add to Home screen, when available.</p><p className="store-muted">Use the new Order Lab icon to open the demo full-screen. Ding and popup tests need the app open. Background notifications, offline access and cross-device alerts are not included.</p></section>;
}
