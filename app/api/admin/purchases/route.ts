import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";
import { enforceRateLimit } from "@/lib/rate-limit";

const bucketName = "admin-purchases";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function authorize(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { response: reply({ error: "Please sign in." }, 401) };
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return { response: reply({ error: "Please sign in again." }, 401) };
  const db = adminDatabase();
  const admin = await db.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (admin.error) throw new Error("Admin verification unavailable.");
  if (!admin.data) return { response: reply({ error: "Admin access required." }, 403) };
  return { db, userId: data.user.id };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "adminRead");
  if (limited) return limited;
  try {
    const admin = await authorize(request);
    if (admin.response) return admin.response;
    const db = admin.db!;
    const [products, variants] = await Promise.all([
      db.from("products").select("id,name,stock,price,barcode").order("name"),
      db.from("product_variants").select("id,product_id,stock,price,sku,barcode,option1_value,option2_value,option3_value"),
    ]);
    if (products.error || variants.error) throw new Error("Inventory could not be loaded.");
    const bucket = db.storage.from(bucketName);
    const latest = new Map<string, { name: string; version: number }>();
    for (let offset = 0; ; offset += 1000) {
      const result = await bucket.list("records", { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (result.error) throw new Error("Purchase storage could not be loaded.");
      for (const file of result.data) {
        const match = file.name.match(/^([0-9a-f-]{36})-(\d+)\.json$/);
        if (!match) continue;
        const version = Number(match[2]);
        if (!latest.has(match[1]) || latest.get(match[1])!.version < version) latest.set(match[1], { name: file.name, version });
      }
      if (result.data.length < 1000) break;
    }
    const purchases = [];
    for (const file of latest.values()) {
      const result = await bucket.download(`records/${file.name}`);
      if (result.error) throw new Error("A purchase could not be loaded.");
      purchases.push(JSON.parse(await result.data.text()));
    }
    const receipts = await db.from("purchase_receipts").select("purchase_id,purchase,received_at");
    const receivingReady = !receipts.error;
    if (receipts.error && !["PGRST205", "42P01"].includes(receipts.error.code)) throw new Error("Receipt lookup unavailable.");
    for (const receipt of receipts.data || []) {
      const index = purchases.findIndex(p => p.id === receipt.purchase_id);
      const received = { ...receipt.purchase, receivedAt: receipt.received_at };
      if (index >= 0) purchases[index] = received;
      else purchases.push(received);
    }
    purchases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return reply({ products: products.data, variants: variants.data, purchases, receivingReady });
  } catch {
    return reply({ error: "Purchase management is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "adminWrite");
  if (limited) return limited;
  try {
    const admin = await authorize(request);
    if (admin.response) return admin.response;
    const raw = await request.text();
    if (raw.length > 100000) return reply({ error: "Purchase is too large." }, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid purchase." }, 400); }
    if (body?.action === "createProduct") {
      if (!uuid.test(body.id || "") || typeof body.name !== "string" || !body.name.trim() || body.name.length > 160 ||
        typeof body.category !== "string" || !body.category.trim() || body.category.length > 80 ||
        !Number.isSafeInteger(body.priceCents) || body.priceCents < 0 || body.priceCents > 100000000 ||
        typeof body.barcode !== "string" || body.barcode.length > 80)
        return reply({ error: "Enter a product name, category, and valid selling price." }, 400);
      const db = admin.db!;
      const existing = await db.from("products").select("id,name,stock,price,barcode").eq("id", body.id).maybeSingle();
      if (existing.error) throw new Error("Product lookup failed.");
      if (existing.data) return reply({ product: existing.data });
      const created = await db.from("products").insert({
        id: body.id, name: body.name.trim(), category: body.category.trim(),
        price: body.priceCents / 100, stock: 0, barcode: body.barcode.trim() || null, active: true,
      }).select("id,name,stock,price,barcode").single();
      if (created.error) return reply({ error: "Could not create product. Retry or check the product details." }, 409);
      return reply({ product: created.data }, 201);
    }
    if (!body || !uuid.test(body.id || "") || !Number.isSafeInteger(body.version) || body.version < 1 || body.version > 100000 ||
      typeof body.supplier !== "string" || !body.supplier.trim() || body.supplier.length > 120 ||
      typeof body.invoice !== "string" || body.invoice.length > 120 ||
      typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || Number.isNaN(Date.parse(body.date)) ||
      typeof body.notes !== "string" || body.notes.length > 2000 ||
      !Number.isSafeInteger(body.extraCents) || body.extraCents < 0 || body.extraCents > 100000000 ||
      !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) return reply({ error: "Check the supplier, date, costs, and items." }, 400);
    const db = admin.db!;
    const received = await db.from("purchase_receipts").select("purchase_id").eq("purchase_id", body.id).maybeSingle();
    if (received.data) return reply({ error: "Received purchases are locked. Create a new purchase for additional stock." }, 409);
    if (received.error && !["PGRST205", "42P01"].includes(received.error.code)) throw new Error("Receipt lookup unavailable.");
    const lines = [];
    for (const line of body.lines) {
      if (!uuid.test(line.productId || "") || (line.variantId && !uuid.test(line.variantId)) ||
        !Number.isSafeInteger(line.packs) || line.packs < 1 || line.packs > 100000 ||
        !Number.isSafeInteger(line.unitsPerPack) || line.unitsPerPack < 1 || line.unitsPerPack > 100000 ||
        line.packs * line.unitsPerPack > 1000000 ||
        !Number.isSafeInteger(line.packCostCents) || line.packCostCents < 0 || line.packCostCents > 100000000 ||
        line.packCostCents * line.packs > 100000000) return reply({ error: "Check item quantities and costs." }, 400);
      const product = await db.from("products").select("id,name").eq("id", line.productId).maybeSingle();
      if (product.error) throw new Error("Product lookup failed.");
      if (!product.data) return reply({ error: "Product no longer exists." }, 400);
      const variants = await db.from("product_variants").select("id,option1_value,option2_value,option3_value").eq("product_id", line.productId);
      if (variants.error) throw new Error("Variant lookup failed.");
      const variant = variants.data.find(v => v.id === line.variantId);
      if ((variants.data.length && !variant) || (!variants.data.length && line.variantId)) return reply({ error: "Select the product's flavor or variant." }, 400);
      lines.push({ productId: line.productId, variantId: variant?.id || "", productName: product.data.name,
        variantName: variant ? [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(" / ") : "",
        packs: line.packs, unitsPerPack: line.unitsPerPack, packCostCents: line.packCostCents });
    }
    const bucket = db.storage.from(bucketName);
    if (body.version > 1) {
      const previous = await bucket.download(`records/${body.id}-${body.version - 1}.json`);
      if (previous.error) return reply({ error: "Purchase changed. Refresh before editing." }, 409);
    }
    const purchase = { id: body.id, version: body.version, supplier: body.supplier.trim(), invoice: body.invoice.trim(), date: body.date,
      notes: body.notes.trim(), extraCents: body.extraCents, lines, updatedAt: new Date().toISOString(), updatedBy: admin.userId };
    const saved = await bucket.upload(`records/${body.id}-${body.version}.json`, JSON.stringify(purchase), { contentType: "application/json", upsert: false });
    if (saved.error) return reply({ error: "Could not save. Refresh before retrying; another edit may have been saved." }, 409);
    return reply({ purchase });
  } catch {
    return reply({ error: "Purchase could not be saved." }, 503);
  }
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "adminWrite");
  if (limited) return limited;
  try {
    const admin = await authorize(request);
    if (admin.response) return admin.response;
    let body;
    try { body = await request.json(); } catch { return reply({ error: "Invalid receipt request." }, 400); }
    if (!body || !uuid.test(body.id || "") || !Number.isSafeInteger(body.version) || body.version < 1 || body.confirmReceived !== true)
      return reply({ error: "Confirm the purchase has arrived before adding stock." }, 400);
    const db = admin.db!;
    const bucket = db.storage.from(bucketName);
    const file = await bucket.download(`records/${body.id}-${body.version}.json`);
    if (file.error) return reply({ error: "Saved purchase not found. Save it first." }, 404);
    const files = await bucket.list("records", { search: body.id, limit: 1000 });
    if (files.error) throw new Error("Purchase lookup unavailable.");
    if (files.data.some(file => {
      const match = file.name.match(/-(\d+)\.json$/);
      return match && Number(match[1]) > body.version;
    })) return reply({ error: "Purchase changed. Refresh and review the latest saved purchase." }, 409);
    const purchase = JSON.parse(await file.data.text());
    const result = await db.rpc("receive_admin_purchase", {
      p_purchase_id: body.id, p_version: body.version, p_purchase: purchase, p_actor: admin.userId,
    });
    if (result.error) {
      if (result.error.code === "PGRST202") return reply({ error: "Stock receiving needs the one-time database setup." }, 503);
      return reply({ error: "Could not receive this purchase. No stock was added; check that all products still exist." }, 409);
    }
    return reply({ purchase: { ...result.data.purchase, receivedAt: result.data.receivedAt }, alreadyReceived: result.data.alreadyReceived });
  } catch {
    return reply({ error: "Could not receive purchase. Refresh to check its status before retrying." }, 503);
  }
}