import { connection } from "next/server";
import { createHmac } from "node:crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { financeOwner, hashPin, matchesPin, issueUnlock } from "@/lib/owner-finance";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  await connection();
  const limited = await enforceRateLimit(request, "adminRead");
  if (limited) return limited;
  try {
    const owner = await financeOwner(request);
    if (!owner) return reply({ error: "Store owner sign-in required." }, 403);
    return reply({ pinSet: Boolean(owner.config.hash) });
  } catch { return reply({ error: "Owner access is temporarily unavailable." }, 503); }
}
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "adminId");
  if (limited) return limited;
  try {
    const owner = await financeOwner(request);
    if (!owner) return reply({ error: "Store owner sign-in required." }, 403);
    const raw = await request.text();
    if (raw.length > 1000) return reply({ error: "Invalid PIN request." }, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid PIN request." }, 400); }
    if (typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin)) return reply({ error: "Use a numeric PIN of exactly 4 digits." }, 400);
    const key = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`owner-pin-attempts:${owner.ownerId}`).digest("hex");
    const attempts = await owner.db.rpc("consume_api_rate_limit", { p_scope: "adminId", p_key: key, p_limit: 5, p_window_seconds: 600 });
    if (attempts.error || typeof attempts.data?.allowed !== "boolean") throw new Error("PIN protection unavailable.");
    if (!attempts.data.allowed) return reply({ error: "Too many PIN attempts. Wait 10 minutes and try again." }, 429);
    if (body.action === "setup") {
      if (owner.config.hash) return reply({ error: "Owner PIN is already set. Unlock with your existing PIN." }, 409);
      if (body.confirmPin !== body.pin) return reply({ error: "The PINs do not match." }, 400);
      const saved = await owner.bucket.upload("owner/pin.json", JSON.stringify({ ownerId: owner.ownerId, ...hashPin(body.pin) }), { contentType: "application/json", upsert: false });
      if (saved.error) return reply({ error: "PIN setup could not be completed. Refresh and try again." }, 409);
    } else if (body.action === "unlock") {
      if (!owner.config.hash) return reply({ error: "Set your owner PIN first." }, 409);
      if (!matchesPin(body.pin, owner.config)) return reply({ error: "Incorrect PIN." }, 403);
    } else return reply({ error: "Invalid PIN action." }, 400);
    return reply(issueUnlock(owner.ownerId));
  } catch { return reply({ error: "Owner access is temporarily unavailable." }, 503); }
}
