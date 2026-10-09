import { connection } from "next/server";
import { financeOwner, validUnlock } from "@/lib/owner-finance";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emptyEdits, editedBasis, validReceipt, type CostEdits } from "@/lib/cost-edits";
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
    const costEdits = await readEdits(owner.bucket);
    const unconfirmedReceipt = costEdits.handwritten ? { total: costEdits.handwritten.totalCents / 100, confirmed: costEdits.handwritten.confirmed, reason: costEdits.handwritten.confirmed ? "Confirmed and included in estimates." : "Draft saved. Confirm remaining fields before applying." } : sources.unconfirmedReceipt;
    return reply({ ...inventoryCosts(products.data, variants.data, editedBasis(sources.basis, costEdits)), invoices: sources.invoices, unconfirmedReceipt, costEdits, asOf: new Date().toISOString() });
  } catch { return reply({ error: "Inventory costs are temporarily unavailable. Please retry." }, 503); }
}

async function readEdits(bucket: NonNullable<Awaited<ReturnType<typeof financeOwner>>>["bucket"]): Promise<CostEdits> {
  const files = await bucket.list("costs/edits", { limit: 1, sortBy: { column: "name", order: "desc" } });
  if (files.error) throw new Error("Cost edit history unavailable.");
  if (!files.data.length) return emptyEdits();
  const file = await bucket.download(`costs/edits/${files.data[0].name}`);
  if (file.error) throw new Error("Cost edit unavailable.");
  return JSON.parse(await file.data.text());
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "adminWrite");
  if (limited) return limited;
  try {
    const owner = await financeOwner(request);
    if (!owner) return reply({ error: "Store owner sign-in required." }, 403);
    if (!validUnlock(request.headers.get("x-owner-unlock"), owner.ownerId)) return reply({ error: "Unlock with your owner PIN before editing." }, 423);
    const raw = await request.text();
    if (raw.length > 50000) return reply({ error: "Edit is too large." }, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid edit." }, 400); }
    const edits = await readEdits(owner.bucket);
    if (body.version !== edits.version) return reply({ error: "Figures changed in another tab. Refresh before editing." }, 409);
    const products = await owner.db.from("products").select("id");
    if (products.error) throw new Error("Products unavailable.");
    const productIds = new Set<string>(products.data.map(p => p.id));
    if (body.action === "handwritten") {
      if (!validReceipt(body.receipt, productIds)) return reply({ error: "Check receipt quantities, date and amounts. To apply it, fill every field and make the line amounts equal the receipt total." }, 400);
      edits.handwritten = { supplier: body.receipt.supplier.trim(), date: body.receipt.date, totalCents: body.receipt.totalCents, confirmed: body.receipt.confirmed, lines: body.receipt.lines.map((l: { productId: string; boxes: number; unitsPerBox: number | null; amountCents: number | null }) => ({ productId: l.productId, boxes: l.boxes, unitsPerBox: l.unitsPerBox, amountCents: l.amountCents })) };
    } else if (body.action === "unitCost") {
      if (!productIds.has(body.productId) || !Number.isSafeInteger(body.unitCostCents) || body.unitCostCents < 0 || body.unitCostCents > 100000000 || !Number.isSafeInteger(body.coveredUnits) || body.coveredUnits < 1 || body.coveredUnits > 1000000) return reply({ error: "Enter a valid product, unit cost and covered quantity." }, 400);
      edits.overrides[body.productId] = { unitCostCents: body.unitCostCents, coveredUnits: body.coveredUnits };
    } else if (body.action === "removeUnitCost") {
      if (!productIds.has(body.productId)) return reply({ error: "Product not found." }, 400);
      delete edits.overrides[body.productId];
    } else return reply({ error: "Invalid edit action." }, 400);
    edits.version += 1;
    const saved = await owner.bucket.upload(`costs/edits/${String(edits.version).padStart(10,"0")}.json`, JSON.stringify(edits), { contentType: "application/json", upsert: false });
    if (saved.error) return reply({ error: "Could not save. Refresh to check whether another edit was saved." }, 409);
    return reply({ saved: true, version: edits.version });
  } catch { return reply({ error: "Cost editing is temporarily unavailable. Please retry." }, 503); }
}
