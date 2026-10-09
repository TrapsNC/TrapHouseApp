import { connection } from "next/server";
import { financeOwner, validUnlock } from "@/lib/owner-finance";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inventoryCosts } from "@/lib/inventory-costs";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  await connection();
  const limited = await enforceRateLimit(request, "adminRead");
  if (limited) return limited;
  try {
    const owner = await financeOwner(request);
    if (!owner) return reply({ error: "Store owner sign-in required." }, 403);
    if (!validUnlock(request.headers.get("x-owner-unlock"), owner.ownerId)) return reply({ error: "Enter your owner PIN to view financial figures." }, 423);
    const db = owner.db;
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
