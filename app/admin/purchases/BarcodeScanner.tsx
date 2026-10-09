"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export default function BarcodeScanner({ onScan, onClose }: { onScan: (barcode: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const media = useRef<MediaStream | null>(null);
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState("Use your camera or scan into the barcode field with a USB scanner.");
  const [running, setRunning] = useState(false);

  function stop() {
    generation.current += 1;
    if (timeout.current) clearTimeout(timeout.current);
    media.current?.getTracks().forEach(track => track.stop());
    media.current = null;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
  }
  useEffect(() => {
    const element = video.current;
    return () => {
      generation.current += 1;
      if (timeout.current) clearTimeout(timeout.current);
      media.current?.getTracks().forEach(track => track.stop());
      media.current = null;
      controls.current?.stop();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function start() {
    stop();
    const current = generation.current;
    setRunning(true); setStatus("Starting camera…");
    timeout.current = setTimeout(() => {
      if (current !== generation.current) return;
      stop(); setRunning(false); setStatus("Camera took too long to start. Try again, or take a barcode photo below.");
    }, 20000);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning requires localhost or HTTPS. You can still use the barcode field.");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== generation.current || !video.current) return;
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (current !== generation.current || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
      media.current = stream;
      video.current.muted = true;
      video.current.setAttribute("playsinline", "true");
      const handle = await reader.decodeFromStream(stream, video.current, (result, _error, handle) => {
        if (!result || current !== generation.current) return;
        generation.current += 1;
      if (timeout.current) clearTimeout(timeout.current);
      media.current?.getTracks().forEach(track => track.stop());
      media.current = null;
        handle.stop();
        controls.current = null;
        onScan(result.getText());
      });
      if (current !== generation.current) { handle.stop(); return; }
      controls.current = handle;
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        if (current !== generation.current) return;
        stop(); setRunning(false); setStatus("No barcode read yet. Try a clear photo with the entire barcode visible, or enter the number below.");
      }, 45000);
      setStatus("Hold the barcode steady inside the camera preview.");
    } catch (error) {
      if (current !== generation.current) return;
      stop(); setRunning(false);
      setStatus(error instanceof Error && error.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access or use the barcode field." : error instanceof Error ? error.message : "Camera unavailable. Use a USB scanner or type the barcode.");
    }
  }
  async function scanPhoto(file?: File) {
    if (!file) return;
    stop();
    const current = generation.current;
    setRunning(true); setStatus("Reading barcode photo…");
    const url = URL.createObjectURL(file);
    timeout.current = setTimeout(() => {
      if (current !== generation.current) return;
      stop(); setRunning(false); setStatus("Photo took too long to read. Try a clearer photo or enter the barcode number.");
    }, 15000);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== generation.current) return;
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      if (current !== generation.current) return;
      stop(); setRunning(false); onScan(result.getText());
    } catch {
      if (current !== generation.current) return;
      stop(); setRunning(false); setStatus("Could not read that photo. Include the whole barcode, keep it sharp, and avoid glare—or type the number below.");
    } finally { URL.revokeObjectURL(url); }
  }
  function submit() { if (barcode.trim()) { stop(); onScan(barcode.trim()); } }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-4" role="dialog" aria-modal="true" aria-labelledby="barcode-title" onKeyDown={event => { if (event.key === "Escape") { stop(); onClose(); } }}>
    <div className="w-full max-w-lg rounded-2xl border border-green-700 bg-zinc-950 p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="barcode-title" className="text-xl font-bold">Scan item barcode</h2><button type="button" onClick={()=>{stop();onClose();}} className="rounded-lg border border-zinc-700 px-3 py-2">Close</button></div>
      <video ref={video} autoPlay muted playsInline className="mt-4 aspect-video w-full rounded-xl bg-black object-cover" />
      <p role="status" className="mt-3 text-sm text-zinc-300">{status}</p>
      <button type="button" disabled={running} onClick={()=>void start()} className="mt-3 rounded-xl bg-green-700 px-4 py-3 font-bold disabled:opacity-40">{running ? "SCANNING…" : "START CAMERA"}</button>
      {running && <button type="button" onClick={() => { stop(); setRunning(false); setStatus("Camera stopped. Try a photo or enter the barcode number."); }} className="ml-3 rounded-xl border border-zinc-700 px-4 py-3 font-bold">STOP SCAN</button>}
      <label className="mt-4 block rounded-xl border border-green-700 p-3 text-sm font-bold text-green-300">TAKE / CHOOSE BARCODE PHOTO<input type="file" accept="image/*" capture="environment" disabled={running} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void scanPhoto(file); }} className="mt-2 block w-full text-sm text-white" /></label>
      <label className="mt-5 block text-sm text-zinc-300">USB scanner or barcode number<input autoComplete="off" inputMode="numeric" maxLength={80} value={barcode} onChange={e=>setBarcode(e.target.value)} onKeyDown={e=>{if(e.key === "Enter"){e.preventDefault();submit();}}} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-white" placeholder="Click here, scan, then press Enter" /></label>
      <button type="button" disabled={!barcode.trim()} onClick={submit} className="mt-3 rounded-xl border border-green-700 px-4 py-3 font-bold text-green-300 disabled:opacity-40">USE BARCODE</button>
    </div>
  </div>;
}
