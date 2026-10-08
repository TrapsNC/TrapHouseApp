const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const id = '11111111-1111-4111-8111-111111111111';
function fixture(patch = {}, race = {}, rpcError = null) {
  const order = { id, fulfillment: 'pickup', status: 'confirmed', payment_status: 'paid', id_review_status: 'approved', ...patch };
  let writes = 0; let cancellations = 0;
  const current = { ...order, ...race };
  const db = { async rpc(name, args) {
    cancellations++;
    assert.equal(name, 'cancel_customer_order');
    assert.deepEqual(JSON.parse(JSON.stringify(args)), { p_order_id: id, p_expected_status: order.status });
    if (rpcError) return { data: null, error: { message: rpcError } };
    if (current.status !== args.p_expected_status) return { data: null, error: { message: 'Order changed before cancellation.' } };
    current.status = 'cancelled';
    return { data: { ...current }, error: null };
  }, from(table) {
    const filters = []; let update;
    return {
      select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
      update(value) { writes++; update = value; return this; },
      async maybeSingle() {
        if (table === 'admin_users') return { data: { user_id: id }, error: null };
        if (!update) return { data: { ...(cancellations ? current : order) }, error: null };
        if (!filters.every(([key, value]) => current[key] === value)) return { data: null, error: null };
        Object.assign(current, update); return { data: current, error: null };
      }
    };
  } };
  const module = { exports: {} };
  const deps = {
    '@/lib/rate-limit': { enforceRateLimit: async () => null },
    'next/server': { NextResponse: { json: Response.json } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id } }, error: null }) } }) },
    '@/lib/admin-db': { adminDatabase: () => db }
  };
  const file = path.join(__dirname, '../app/api/admin/orders/status/route.ts');
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports, console, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
    require(name) { if (Object.hasOwn(deps, name)) return deps[name]; throw Error(name); }
  });
  return { run: status => module.exports.PATCH(new Request('https://test/api/admin/orders/status', { method: 'PATCH', headers: { authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id, status }) })), writes: () => writes, cancellations: () => cancellations, current };
}
test('paid approved meetup and delivery can advance', async () => {
  for (const [fulfillment, status] of [['pickup', 'ready_for_pickup'], ['delivery', 'out_for_delivery'], ['pickup', 'completed']]) {
    const f = fixture({ fulfillment }); assert.equal((await f.run(status)).status, 200); assert.equal(f.current.status, status);
  }
});
test('every fulfillment status requires payment and approved ID', async () => {
  for (const [fulfillment, status] of [['pickup', 'preparing'], ['pickup', 'ready_for_pickup'], ['delivery', 'out_for_delivery'], ['shipping', 'shipped'], ['pickup', 'completed']]) {
    for (const patch of [{ payment_status: 'pending' }, { id_review_status: 'pending' }, { id_review_status: 'rejected' }]) {
      const f = fixture({ fulfillment, ...patch }); assert.equal((await f.run(status)).status, 400); assert.equal(f.writes(), 0);
    }
  }
});
test('concurrent payment, ID, fulfillment or status changes prevent stale save', async () => {
  for (const race of [{ payment_status: 'refunded' }, { id_review_status: 'rejected' }, { fulfillment: 'delivery' }, { status: 'cancelled' }]) {
    const f = fixture({}, race); assert.equal((await f.run('ready_for_pickup')).status, 409); assert.equal(f.current.status, race.status || 'confirmed');
  }
});
test('wrong fulfillment and terminal orders cannot advance', async () => {
  for (const [patch, status] of [[{ fulfillment: 'delivery' }, 'ready_for_pickup'], [{ fulfillment: 'pickup' }, 'out_for_delivery'], [{ status: 'completed' }, 'confirmed'], [{ status: 'cancelled' }, 'confirmed']]) {
    const f = fixture(patch); assert.equal((await f.run(status)).status, 400); assert.equal(f.writes(), 0);
  }
});
test('unpaid unapproved orders can still be cancelled', async () => {
  const f = fixture({ payment_status: 'pending', id_review_status: 'pending' }); assert.equal((await f.run('cancelled')).status, 200);
});

test('cancellation uses atomic RPC without a direct status write', async () => {
  const f = fixture({ payment_status: 'pending', id_review_status: 'pending' });
  const response = await f.run('cancelled');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.status, 'cancelled');
  assert.equal(f.cancellations(), 1);
  assert.equal(f.writes(), 0);
  assert.equal((await f.run('cancelled')).status, 400);
  assert.equal(f.cancellations(), 1);
});
test('stale cancellation returns conflict without a direct status write', async () => {
  const f = fixture({}, { status: 'completed' });
  assert.equal((await f.run('cancelled')).status, 409);
  assert.equal(f.current.status, 'completed');
  assert.equal(f.writes(), 0);
});
test('inventory restoration failure cannot fall back to a status update', async () => {
  const f = fixture({}, {}, 'Could not restore variant inventory.');
  assert.equal((await f.run('cancelled')).status, 503);
  assert.equal(f.current.status, 'confirmed');
  assert.equal(f.writes(), 0);
});