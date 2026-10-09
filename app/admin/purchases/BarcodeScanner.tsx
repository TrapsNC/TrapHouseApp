"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export default function BarcodeScanner({ onScan, onClose }: { onScan: (barcode: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState("Use your camera or scan into the barcode field with a USB scanner.");
  const [running, setRunning] = useState(false);

  function stop() {
    generation.current += 1;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
  }
  useEffect(() => {
    const element = video.current;
    return () => {
      generation.current += 1;
      controls.current?.stop();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function start() {
    stop();
    const current = generation.current;
    setRunning(true); setStatus("Starting camera…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning requires localhost or HTTPS. You can still use the barcode field.");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== generation.current || !video.current) return;
      const reader = new BrowserMultiFormatReader();
      const handle = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, video.current, (result, _error, handle) => {
        if (!result || current !== generation.current) return;
        generation.current += 1;
        handle.stop();
        controls.current = null;
        onScan(result.getText());
      });
      if (current !== generation.current) { handle.stop(); return; }
      controls.current = handle;
      setStatus("Hold the barcode steady inside the camera preview.");
    } catch (error) {
      if (current !== generation.current) return;
      stop(); setRunning(false);
      setStatus(error instanceof Error && error.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access or use the barcode field." : error instanceof Error ? error.message : "Camera unavailable. Use a USB scanner or type the barcode.");
    }
  }
  function submit() { if (barcode.trim()) { stop(); onScan(barcode.trim()); } }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-4" role="dialog" aria-modal="true" aria-labelledby="barcode-title" onKeyDown={event => { if (event.key === "Escape") { stop(); onClose(); } }}>
    <div className="w-full max-w-lg rounded-2xl border border-green-700 bg-zinc-950 p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="barcode-title" className="text-xl font-bold">Scan item barcode</h2><button type="button" onClick={()=>{stop();onClose();}} className="rounded-lg border border-zinc-700 px-3 py-2">Close</button></div>
      <video ref={video} muted playsInline className="mt-4 aspect-video w-full rounded-xl bg-black object-cover" />
      <p role="status" className="mt-3 text-sm text-zinc-300">{status}</p>
      <button type="button" disabled={running} onClick={()=>void start()} className="mt-3 rounded-xl bg-green-700 px-4 py-3 font-bold disabled:opacity-40">{running ? "SCANNING…" : "START CAMERA"}</button>
      <label className="mt-5 block text-sm text-zinc-300">USB scanner or barcode number<input autoFocus autoComplete="off" inputMode="numeric" maxLength={80} value={barcode} onChange={e=>setBarcode(e.target.value)} onKeyDown={e=>{if(e.key === "Enter"){e.preventDefault();submit();}}} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white" placeholder="Click here, scan, then press Enter" /></label>
      <button type="button" disabled={!barcode.trim()} onClick={submit} className="mt-3 rounded-xl border border-green-700 px-4 py-3 font-bold text-green-300 disabled:opacity-40">USE BARCODE</button>
    </div>
  </div>;
}
