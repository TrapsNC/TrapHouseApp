"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function AdminInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const check = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const timer = window.setTimeout(check, 0);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    display.addEventListener("change", check);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.clearTimeout(timer);
      display.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function install() {
    if (!prompt) { setHelp(current => !current); return; }
    setBusy(true);
    try { await prompt.prompt(); }
    catch { setHelp(true); }
    finally { setPrompt(null); setBusy(false); }
  }

  if (installed) return null;
  return (
    <aside className="border-b border-zinc-800 bg-black px-5 py-3 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-300">Your store tools, right on your home screen.</p>
        <button type="button" onClick={install} disabled={busy} aria-expanded={help} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{busy ? "Opening…" : "Install Admin App"}</button>
      </div>
      {help && <div className="mx-auto mt-3 max-w-7xl space-y-2 text-sm text-zinc-300" role="status">
        <p><strong className="text-white">iPhone / iPad:</strong> Open this admin page in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown.</p>
        <p><strong className="text-white">Android / computer:</strong> Open this page in Chrome or Edge, then use the browser menu’s Install app or Add to Home Screen option.</p>
        <p>On your phone, use your live HTTPS website’s /admin page. Sign-in is still required, and the app needs an internet connection.</p>
      </div>}
    </aside>
  );
}
