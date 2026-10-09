/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";

function fixture({ isAdmin = true, rpcData, rpcError = null } = {}) {
  let rpcCalls = 0;
  let orderTableReads = 0;

  const receipt = rpcData || {
    id,
    status: "cancelled",
    payment_status: "paid",
    payment_method: "cash",
    payment_received_amount: 10,
    refund_status: "refunded",
    refund_amount: 10,
    refunded_at: "2026-10-08T16:00:00.000Z",
    refunded_by: actor,
    updated_at: "2026-10-08T16:00:00.000Z",
    already_refunded: false,
  };

  const db = {
    from(table) {
      if (table === "orders") orderTableReads++;

      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          assert.equal(table, "admin_users");
          return {
            data: isAdmin ? { user_id: actor } : null,
            error: null,
          };
        },
      };
    },
    async rpc(name, args) {
      rpcCalls++;
      assert.equal(name, "mark_order_refunded");
      assert.deepEqual(JSON.parse(JSON.stringify(args)), {
        p_order_id: id,
        p_refunded_by: actor,
      });
      return {
        data: rpcError ? null : receipt,
        error: rpcError ? { message: rpcError } : null,
      };
    },
  };

  const module = { exports: {} };
  const deps = {
    "@/lib/rate-limit": { enforceRateLimit: async () => null },
    "next/server": { NextResponse: { json: Response.json } },
    "@supabase/supabase-js": {
      createClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: actor } },
            error: null,
          }),
        },
      }),
    },
    "@/lib/admin-db": { adminDatabase: () => db },
  };

  const file = path.join(
    __dirname,
    "../app/api/admin/orders/refund/route.ts"
  );
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      console,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "test",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "test",
        },
      },
      require(name) {
        if (Object.hasOwn(deps, name)) return deps[name];
        throw new Error(name);
      },
    }
  );

  return {
    rpcCalls: () => rpcCalls,
    orderTableReads: () => orderTableReads,
    run: (body = {}, authenticated = true) =>
      module.exports.PATCH(
        new Request("https://test/api/admin/orders/refund", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(authenticated
              ? { authorization: "Bearer test" }
              : {}),
          },
          body: JSON.stringify({
            orderId: id,
            confirmed: true,
            ...body,
          }),
        })
      ),
  };
}

test("refund route uses only the atomic RPC and ignores client amounts", async () => {
  const f = fixture();
  const response = await f.run({ amountCents: 999999 });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.alreadyRefunded, false);
  assert.equal(body.order.refund_amount, 10);
  assert.equal(body.order.already_refunded, undefined);
  assert.equal(f.rpcCalls(), 1);
  assert.equal(f.orderTableReads(), 0);
});

test("an idempotent RPC receipt is returned as already refunded", async () => {
  const f = fixture({
    rpcData: {
      id,
      refund_status: "refunded",
      refund_amount: 10,
      already_refunded: true,
    },
  });
  const response = await f.run();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.alreadyRefunded, true);
  assert.equal(f.rpcCalls(), 1);
});

test("authentication, admin membership, confirmation and IDs are required", async () => {
  const signedOut = fixture();
  assert.equal((await signedOut.run({}, false)).status, 401);
  assert.equal(signedOut.rpcCalls(), 0);

  const nonAdmin = fixture({ isAdmin: false });
  assert.equal((await nonAdmin.run()).status, 403);
  assert.equal(nonAdmin.rpcCalls(), 0);

  const unconfirmed = fixture();
  assert.equal(
    (await unconfirmed.run({ confirmed: false })).status,
    400
  );
  assert.equal(unconfirmed.rpcCalls(), 0);

  const invalid = fixture();
  assert.equal(
    (await invalid.run({ orderId: "not-a-uuid" })).status,
    400
  );
  assert.equal(invalid.rpcCalls(), 0);
});

test("known database guard failures map to safe HTTP responses", async () => {
  for (const [message, status] of [
    ["Order not found.", 404],
    ["Access denied.", 403],
    ["Only cancelled orders can be refunded.", 400],
    ["This order was not marked paid.", 400],
    ["Unsupported payment method.", 400],
    ["The recorded payment amount is invalid.", 400],
    ["This order does not require a refund.", 409],
    ["This order already has a different refund record.", 409],
    ["Recorded refunds are immutable.", 409],
  ]) {
    const f = fixture({ rpcError: message });
    const response = await f.run();
    assert.equal(response.status, status, message);
    assert.equal(f.rpcCalls(), 1);
    assert.equal(f.orderTableReads(), 0);
  }
});

test("unexpected RPC failures do not fall back to direct writes", async () => {
  const f = fixture({ rpcError: "Database unavailable." });
  assert.equal((await f.run()).status, 503);
  assert.equal(f.rpcCalls(), 1);
  assert.equal(f.orderTableReads(), 0);
});
