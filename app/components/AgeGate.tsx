"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function AgeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const gated = pathname === "/" || pathname === "/shop" || pathname.startsWith("/product/") || pathname === "/cart" || pathname === "/checkout";
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      let confirmed = false;
      try { confirmed = sessionStorage.getItem("trap-dob-age-confirmed-v1") === "true"; } catch {}
      try {
        const expiresAt = Number(localStorage.getItem("trap-age-remember-until-v1"));
        const now = Date.now();
        if (Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= now + 30 * 24 * 60 * 60 * 1000) confirmed = true;
        else localStorage.removeItem("trap-age-remember-until-v1");
      } catch {}
      setVerified(confirmed);
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function enter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredDob = String(new FormData(event.currentTarget).get("dateOfBirth") || "");
    const [year, month, day] = enteredDob.split("-").map(Number);
    const birth = new Date(year, month - 1, day);
    const now = new Date();
    if (!enteredDob || year < 1900 || birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > now) {
      setError("Enter a valid date of birth."); return;
    }
    const age = now.getFullYear() - year - (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day) ? 1 : 0);
    if (age < 21) { setError("You must be 21 or older to enter this store."); return; }
    try { sessionStorage.setItem("trap-dob-age-confirmed-v1", "true"); } catch {}
    try {
      if (remember) localStorage.setItem("trap-age-remember-until-v1", String(Date.now() + 30 * 24 * 60 * 60 * 1000));
      else localStorage.removeItem("trap-age-remember-until-v1");
    } catch {}
    setDob(""); setError(""); setVerified(true);
  }

  if (!gated) return children;
  if (!ready) return <main className="min-h-screen bg-black" aria-label="Checking age confirmation" />;
  if (verified) return children;
  return <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
    <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
      <img src="/trap-house-logo.png" alt="TRAP HOUSE NC" className="mx-auto mb-6 h-28 w-28 rounded-full object-cover" />
      <p className="text-xs tracking-[0.2em] text-zinc-400">WELCOME TO TRAP HOUSE NC</p>
      <h1 className="mt-3 text-3xl font-black">Before you enter</h1>
      <p className="mt-4 text-zinc-300">Enter your date of birth. You must be 21 or older to shop.</p>
      <form onSubmit={enter} className="mt-6 text-left">
        <label htmlFor="entry-dob" className="text-sm font-bold">Date of birth</label>
        <input id="entry-dob" name="dateOfBirth" type="date" required min="1900-01-01" value={dob} onChange={event => { setDob(event.target.value); setError(""); }} aria-describedby="entry-dob-error entry-dob-privacy" className="mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-zinc-600 bg-black px-3 py-3 text-white [color-scheme:dark]" />
        <p id="entry-dob-error" role="alert" className="mt-3 text-sm text-red-400">{error}</p>
        <label className="mt-4 flex items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)} className="h-5 w-5 accent-emerald-400" />Remember me on this device for 30 days</label>
        <button type="submit" className="mt-3 w-full rounded-xl bg-white px-4 py-4 font-bold text-black">VERIFY AGE & ENTER</button>
      </form>
      <a href="https://google.com" className="mt-3 block rounded-xl border border-zinc-700 px-4 py-3 text-sm">EXIT</a>
      <p id="entry-dob-privacy" className="mt-5 text-xs leading-relaxed text-zinc-400">Your birthday is checked on this device and is not saved or sent. ID verification is still required for regulated purchases.</p>
    </section>
  </main>;
}
