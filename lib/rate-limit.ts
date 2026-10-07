import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { adminDatabase } from "@/lib/admin-db";

// Separate budgets, shared across all Vercel instances and deployments.
export const rateLimitPolicies = {
  orders: { limit: 5, windowSeconds: 600 },
  idUpload: { limit: 5, windowSeconds: 600 },
  tracking: { limit: 30, windowSeconds: 60 },
  adminRead: { limit: 60, windowSeconds: 60 },
  adminId: { limit: 20, windowSeconds: 60 },
  adminWrite: { limit: 30, windowSeconds: 60 },
  adminCleanup: { limit: 2, windowSeconds: 600 },
} as const;

type Policy = keyof typeof rateLimitPolicies;

function clientIdentity(request: Request): string {
  // Only Vercel's infrastructure may supply the production client IP.
  // Local development uses one bucket; client-supplied headers cannot rotate it.
  if (process.env.VERCEL !== "1") {
    if (process.env.NODE_ENV !== "production") return "local-development";
    throw new Error("A trusted client IP provider is required.");
  }
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) throw new Error("Trusted client IP is unavailable.");
  // Normalize IPv6 spelling so equivalent addresses cannot rotate buckets.
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
}

export async function enforceRateLimit(request: Request, policy: Policy) {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("Rate limit configuration is missing.");
    const key = createHmac("sha256", secret)
      .update(clientIdentity(request))
      .digest("hex");
    const { limit, windowSeconds } = rateLimitPolicies[policy];
    const { data, error } = await adminDatabase().rpc("consume_api_rate_limit", {
      p_scope: policy,
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (
      error || !data || typeof data.allowed !== "boolean" ||
      !Number.isInteger(data.retry_after_seconds) || data.retry_after_seconds < 1 ||
      data.retry_after_seconds > windowSeconds
    ) {
      throw new Error("Rate limit storage is unavailable.");
    }
    if (data.allowed) return null;
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(data.retry_after_seconds),
      } },
    );
  } catch {
    // Never fall back to per-instance memory or bypass protection on DB failure.
    // Do not log IPs, auth tokens, or database error details.
    console.error("RATE LIMIT ERROR: protection temporarily unavailable.");
    return NextResponse.json(
      { error: "This service is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
}
