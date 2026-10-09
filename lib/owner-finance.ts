import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";

export type OwnerConfig = { ownerId: string; salt?: string; hash?: string };
export async function financeOwner(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  const db = adminDatabase();
  const member = await db.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (member.error || !member.data) return null;
  const bucket = db.storage.from("admin-purchases");
  const assignment = await bucket.download("owner/assignment.json");
  if (assignment.error) throw new Error("Owner setup unavailable.");
  const { ownerId } = JSON.parse(await assignment.data.text()) as OwnerConfig;
  if (data.user.id !== ownerId) return null;
  const pin = await bucket.download("owner/pin.json");
  if (pin.error && !["404", "400"].includes(String(pin.error.statusCode))) throw new Error("Owner PIN lookup unavailable.");
  const config = pin.data ? JSON.parse(await pin.data.text()) as OwnerConfig : { ownerId };
  if (config.ownerId !== ownerId) throw new Error("Owner PIN configuration mismatch.");
  return { db, bucket, ownerId, config };
}

export function hashPin(pin: string, salt = randomBytes(32).toString("hex")) {
  return { salt, hash: scryptSync(pin, salt, 64).toString("hex") };
}
export function matchesPin(pin: string, config: OwnerConfig) {
  if (!config.salt || !config.hash || !/^[a-f0-9]{128}$/.test(config.hash)) return false;
  return timingSafeEqual(Buffer.from(hashPin(pin, config.salt).hash, "hex"), Buffer.from(config.hash, "hex"));
}
function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Owner security unavailable.");
  return createHmac("sha256", secret).update(`owner-finance:${payload}`).digest("hex");
}
export function issueUnlock(ownerId: string) {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ ownerId, expiresAt, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return { unlock: `${payload}.${signature(payload)}`, expiresAt };
}
export function validUnlock(value: string | null, ownerId: string) {
  if (!value || value.length > 1000) return false;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  if (!timingSafeEqual(Buffer.from(parts[1], "hex"), Buffer.from(signature(parts[0]), "hex"))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return payload.ownerId === ownerId && Number.isSafeInteger(payload.expiresAt) && payload.expiresAt > Date.now() && payload.expiresAt <= Date.now() + 10 * 60 * 1000;
  } catch { return false; }
}
