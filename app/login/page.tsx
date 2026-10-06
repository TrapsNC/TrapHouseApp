"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/admin");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
        <p className="text-sm text-zinc-500">TRAP SHOP</p>

        <h1 className="mt-2 text-3xl font-black">
          Admin Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-6 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-3 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3"
        />

        <button
          onClick={login}
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-white px-5 py-3 font-bold text-black disabled:opacity-50"
        >
          {loading ? "SIGNING IN..." : "SIGN IN"}
        </button>
      </div>
    </main>
  );
}