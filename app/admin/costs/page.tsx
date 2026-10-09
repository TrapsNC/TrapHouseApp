"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Row = { id: string; name: string; stock: number; purchasedUnits: number | null; unitCostCents: number | null; costCents: number | null; revenueCents: number | null; grossProfitCents: number | null; status: string; invoiceIds: string[] };
type Report = { rows: Row[]; costCents: number; revenueCents: number; grossProfitCents: number; coveredProducts: number; reviewProducts: number; invoices: { invoice: string; supplier: string; total: number }[]; unconfirmedReceipt: { total: number; reason: string }; asOf: string };
const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function CostsPage() {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const unlockToken = useRef("");
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const load = useCallback(async () => {
    if (!unlockToken.current) return;
    const currentUnlock = unlockToken.current;
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      const response = await fetch("/api/admin/costs", { headers: { Authorization: `Bearer ${data.session.access_token}`, "x-owner-unlock": currentUnlock } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load costs.");
      if (unlockToken.current === currentUnlock) setReport(result);
    } catch (e) { if (unlockToken.current === currentUnlock) { unlockToken.current = ""; setReport(null); setExpiresAt(0); setError(e instanceof Error ? e.message : "Could not load costs."); } }
    finally { setBusy(false); }
  }, [router]);
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { router.replace("/login"); return; }
        const response = await fetch("/api/admin/owner-pin", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) setPinSet(result.pinSet);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Owner access unavailable."); }
      finally { if (active) setBusy(false); }
    }
    void check();
    return () => { active = false; unlockToken.current = ""; };
  }, [router]);
  function lock() { unlockToken.current = ""; setReport(null); setExpiresAt(0); setPin(""); setConfirmPin(""); setError(""); }
  useEffect(() => {
    if (!expiresAt) return;
    const hide = () => { if (document.visibilityState === "hidden") lock(); };
    const timer = setTimeout(lock, Math.max(0, expiresAt - Date.now()));
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [expiresAt]);
  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      const response = await fetch("/api/admin/owner-pin", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: pinSet ? "unlock" : "setup", pin, confirmPin }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (document.visibilityState === "hidden") return;
      unlockToken.current = result.unlock; setExpiresAt(result.expiresAt); setPinSet(true); setPin(""); setConfirmPin("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not unlock figures."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-black p-5 text-white sm:p-8"><div className="mx-auto max-w-7xl">
    <p className="text-xs tracking-widest text-zinc-400">OWNER DASHBOARD</p>
    <h1 className="mt-2 text-3xl font-black">Inventory costs & potential profit</h1>
    <div className="my-5 flex flex-wrap gap-4 text-sm font-bold"><Link href="/admin">INVENTORY</Link><Link href="/admin/purchases">PURCHASES</Link><Link href="/admin/orders">ORDERS</Link>{report && <><button onClick={() => void load()} disabled={busy}>{busy ? "LOADING…" : "REFRESH"}</button><button onClick={lock}>LOCK FIGURES</button></>}</div>
    {error && <p role="alert" className="rounded-xl border border-red-800 p-4 text-red-300">{error}</p>}
    {!report && <section className="my-8 max-w-md rounded-2xl border border-emerald-900 bg-zinc-950 p-6"><h2 className="text-xl font-bold">Owner figures are locked</h2><p className="mt-3 text-sm text-zinc-400">Only the store owner can unlock spending, inventory costs and potential profit. Figures lock after 10 minutes or when you switch away.</p>
      {busy && pinSet === null && <p className="mt-4" role="status">Checking owner access…</p>}
      {pinSet !== null && <form onSubmit={unlock} className="mt-5 space-y-4"><p className="text-sm">{pinSet ? "Enter your owner PIN." : "Create your owner PIN. Keep it private."}</p><label className="block text-sm">{pinSet ? "Owner PIN" : "New owner PIN"}<input type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required value={pin} onChange={event => setPin(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3" /></label>{!pinSet && <label className="block text-sm">Confirm PIN<input type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required value={confirmPin} onChange={event => setConfirmPin(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3" /></label>}<p className="text-xs text-zinc-400">Exactly 4 numbers. Your PIN is stored as a protected hash.</p><button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black disabled:opacity-40">{busy ? "PLEASE WAIT…" : pinSet ? "UNLOCK FIGURES" : "SET PIN & UNLOCK"}</button></form>}
    </section>}
    {report && <>
      <div className="grid gap-4 sm:grid-cols-3">{[["Remaining stock cost", report.costCents], ["Potential sales", report.revenueCents], ["Potential gross profit", report.grossProfitCents]].map(([title, amount]) => <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><p className="text-sm text-zinc-400">{title}</p><p className="mt-2 text-3xl font-black text-emerald-400">{money(amount as number)}</p><p className="mt-2 text-xs text-zinc-400">Matched stock only</p></div>)}</div>
      <p className="mt-4 text-sm text-zinc-300">{report.coveredProducts} stocked products included · {report.reviewProducts} need review. Checked {new Date(report.asOf).toLocaleString()}.</p>
      <p className="mt-2 text-sm text-zinc-400">Estimates use weighted average purchase costs across flavors, with invoice tax allocated by item value. Potential sales use current prices. Gross profit excludes expenses, selling fees, discounts and future taxes. This is not actual sales profit.</p>
      <section className="my-6 rounded-2xl border border-zinc-800 p-5"><h2 className="font-bold">Receipt history</h2><p className="mt-2">Printed invoices: <strong>{money(Math.round(report.invoices.reduce((sum, i) => sum + i.total, 0) * 100))}</strong></p><p className="mt-2 text-sm text-zinc-400">{report.invoices.map(i => `${i.supplier} #${i.invoice}: ${money(Math.round(i.total * 100))}`).join(" · ")}</p><p className="mt-3 text-sm text-amber-300">Handwritten receipt: {money(report.unconfirmedReceipt.total * 100)} awaiting confirmation. {report.unconfirmedReceipt.reason}</p><p className="mt-3 text-sm text-zinc-400">Lower current stock does not establish a loss or a sale. No historical receipts were added to stock. New purchase costs need to be included in a subsequent cost review.</p></section>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800"><table className="w-full text-left text-sm"><thead className="bg-zinc-900 text-zinc-300"><tr>{["Product", "Left", "Receipt units", "Avg unit cost", "Stock cost", "Potential sales", "Gross profit", "Review"].map(h => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{report.rows.filter(r => r.stock > 0).map(r => <tr key={r.id} className="border-t border-zinc-800"><td className="min-w-64 p-3">{r.name}<p className="mt-1 text-xs text-zinc-500">{r.invoiceIds.map(i => `#${i}`).join(", ")}</p></td><td className="p-3">{r.stock}</td><td className="p-3">{r.purchasedUnits ?? "—"}</td><td className="p-3">{money(r.unitCostCents)}</td><td className="p-3">{money(r.costCents)}</td><td className="p-3">{money(r.revenueCents)}</td><td className="p-3">{money(r.grossProfitCents)}</td><td className={`min-w-48 p-3 ${r.status === "Estimate ready" ? "text-emerald-400" : "text-amber-300"}`}>{r.status}</td></tr>)}</tbody></table></div>
    </>}
  </div></main>;
}
