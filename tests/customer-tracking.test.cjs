const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const token = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const filters = [];
  const record = { order_number: "TH-123456ABCDEF", status: "pending", fulfillment: "pickup",
    payment_status: "paid", id_review_status: "pending", refund_status: "none",
    created_at: "2026-10-09", updated_at: "2026-10-09",
    customer_email: "private@example.invalid", id_image_path: "private-id", tracking_token: token };
  const query = { select() { return this; }, eq(k,v) { filters.push([k,v]); return this; },
    async maybeSingle() { return { data: filters.every(([k,v]) => record[k] === v) ? record : null, error: null }; } };
  const module = { exports: {} };
  const deps = { "@/lib/rate-limit": { enforceRateLimit: async () => null },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/admin-db": { adminDatabase: () => ({ from: () => query }) } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/track/route.ts","utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, console, require: n => deps[n] });
  return value => module.exports.POST(new Request("https://test/api/track", { method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ orderNumber:record.order_number, trackingToken:value }) }));
}
test("matching private code returns payment and ID states without private order fields", async () => {
  const response = await fixture()(token);
  assert.equal(response.status,200);
  assert.equal(response.headers.get("Cache-Control"),"no-store");
  const { order } = await response.json();
  assert.equal(order.paymentStatus,"paid");
  assert.equal(order.idReviewStatus,"pending");
  assert.equal(order.refundStatus,"none");
  assert.deepEqual(Object.keys(order).sort(),["orderNumber","status","fulfillment","createdAt","updatedAt","paymentStatus","idReviewStatus","refundStatus"].sort());
});
test("wrong private tracking code cannot retrieve the order", async () => {
  const response = await fixture()("22222222-2222-4222-8222-222222222222");
  assert.equal(response.status,404);
  assert.equal((await response.json()).order,undefined);
});