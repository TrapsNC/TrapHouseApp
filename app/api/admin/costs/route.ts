import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inventoryCosts } from "@/lib/inventory-costs";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  await connection();
  const limited = await enforceRateLimit(request, "adminRead");
  if (limited) return limited;
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return reply({ error: "Please sign in." }, 401);
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return reply({ error: "Please sign in again." }, 401);
    const db = adminDatabase();
    const admin = await db.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (admin.error) throw new Error("Admin verification unavailable.");
    if (!admin.data) return reply({ error: "Admin access required." }, 403);
    const [products, variants, receipt] = await Promise.all([
      db.from("products").select("id,name,stock,price").order("name"),
      db.from("product_variants").select("product_id,stock,price"),
      db.storage.from("admin-purchases").download("costs/receipt-basis-v1.json"),
    ]);
    if (products.error || variants.error || receipt.error) throw new Error("Costs unavailable.");
    const sources = JSON.parse(await receipt.data.text());
    return reply({ ...inventoryCosts(products.data, variants.data, sources.basis), invoices: sources.invoices, unconfirmedReceipt: sources.unconfirmedReceipt, asOf: new Date().toISOString() });
  } catch { return reply({ error: "Inventory costs are temporarily unavailable. Please retry." }, 503); }
}
