const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const id = '11111111-1111-4111-8111-111111111111';
function fixture(patch = {}, isAdmin = true) {
  const order = { id, status: 'pending', fulfillment: 'pickup', payment_status: 'unpaid',
    payment_method: 'cashapp', total: 10, id_review_status: 'pending',
    id_document_path: 'synthetic/id.jpg', updated_at: '2026-10-07T00:00:00.000Z', ...patch };
  let race; let writes = 0; let cancellations = 0;
  const db = {
    from(table) {
      let update; const filters = [];
      return {
        select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
        update(value) { update = value; return this; },
        async maybeSingle() {
          if (table === 'admin_users') return { data: isAdmin ? { user_id: id } : null, error: null };
          assert.equal(table, 'orders');
          if (!update) { const snapshot = { ...order }; if (race) { Object.assign(order, race); race = null; } return { data: snapshot, error: null }; }
          if (!filters.every(([k, v]) => order[k] === v)) return { data: null, error: null };
          writes++; Object.assign(order, update); return { data: { ...order }, error: null };
        }
      };
    },
    async rpc(name, args) {
      assert.equal(name, 'cancel_customer_order');
      if (order.status !== args.p_expected_status) return { data: null, error: { message: 'Order changed before cancellation.' } };
      cancellations++; order.status = 'cancelled'; return { data: { ...order }, error: null };
    }
  };
  const deps = {
    '@/lib/rate-limit': { enforceRateLimit: async () => null },
    'next/server': { NextResponse: { json: Response.json } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id } }, error: null }) } }) },
    '@/lib/admin-db': { adminDatabase: () => db }
  };
  const routes = {};
  for (const name of ['payment', 'id-review', 'status']) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/api/admin/orders', name, 'route.ts'), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
      { module, exports: module.exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } }, console,
        require(n) { assert.ok(Object.hasOwn(deps, n)); return deps[n]; } });
    routes[name] = module.exports.PATCH;
  }
  return { order, writes: () => writes, cancellations: () => cancellations, race: value => { race = value; },
    run: (name, body, auth = true) => routes[name](new Request('https://test/admin/' + name,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: 'Bearer test' } : {}) },
        body: JSON.stringify({ orderId: id, ...body }) })) };
}
test('pickup and delivery require payment and ID, then complete without permitting cancellation', async () => {
  for (const fulfillment of ['pickup', 'delivery']) {
    const f = fixture({ fulfillment, total: fulfillment === 'delivery' ? 14.99 : 10 });
    assert.equal((await f.run('status', { status: 'preparing' })).status, 400);
    assert.equal((await f.run('payment', { received: true, amountCents: Math.round(f.order.total * 100) })).status, 200);
    assert.equal((await f.run('status', { status: 'preparing' })).status, 400);
    assert.equal((await f.run('id-review', { status: 'approved', readableConfirmed: true, validConfirmed: true, dobMatchesConfirmed: true, age21Confirmed: true })).status, 200);
    assert.equal((await f.run('status', { status: 'confirmed' })).status, 200);
    assert.equal((await f.run('status', { status: 'preparing' })).status, 200);
    assert.equal((await f.run('status', { status: fulfillment === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery' })).status, 200);
    assert.equal((await f.run('status', { status: 'completed' })).status, 200);
    assert.equal((await f.run('status', { status: 'cancelled' })).status, 400);
    assert.equal((await f.run('payment', { received: true, amountCents: Math.round(f.order.total * 100) })).status, 409);
    assert.equal((await f.run('id-review', { status: 'rejected' })).status, 409);
    assert.equal(f.cancellations(), 0);
    assert.equal(f.order.status, 'completed');
  }
});
test('cancelled orders reject repeated cancellation, payment, review, and reopening', async () => {
  const f = fixture();
  assert.equal((await f.run('status', { status: 'cancelled' })).status, 200);
  assert.equal((await f.run('status', { status: 'cancelled' })).status, 400);
  assert.equal((await f.run('status', { status: 'confirmed' })).status, 400);
  assert.equal((await f.run('payment', { received: true, amountCents: 1000 })).status, 409);
  assert.equal((await f.run('id-review', { status: 'approved', readableConfirmed: true, validConfirmed: true, dobMatchesConfirmed: true, age21Confirmed: true })).status, 409);
  assert.equal(f.cancellations(), 1);
  assert.equal(f.writes(), 0);
});
test('rejected ID blocks fulfillment even after payment; a fresh approval permits fulfillment', async () => {
  const f = fixture({ payment_status: 'paid' });
  assert.equal((await f.run('id-review', { status: 'rejected' })).status, 200);
  assert.equal((await f.run('status', { status: 'completed' })).status, 400);
  assert.equal((await f.run('id-review', { status: 'approved', readableConfirmed: true, validConfirmed: true, dobMatchesConfirmed: true, age21Confirmed: true })).status, 200);
  assert.equal((await f.run('status', { status: 'preparing' })).status, 200);
});
test('stale ID reviews cannot overwrite newer reviews, lifecycle changes, or replaced documents', async () => {
  for (const race of [{ id_review_status: 'rejected' }, { status: 'cancelled' }, { status: 'completed' },
    { id_document_path: 'replacement.jpg' }, { id_document_path: null }, { updated_at: '2026-10-07T01:00:00.000Z' }]) {
    const f = fixture(); f.race(race);
    assert.equal((await f.run('id-review', { status: 'approved', readableConfirmed: true, validConfirmed: true, dobMatchesConfirmed: true, age21Confirmed: true })).status, 409);
    assert.equal(f.writes(), 0);
    for (const [key, value] of Object.entries(race)) assert.equal(f.order[key], value);
  }
});
test('ID review requires an existing document and a valid review choice', async () => {
  const f = fixture({ id_document_path: null });
  assert.equal((await f.run('id-review', { status: 'approved', readableConfirmed: true, validConfirmed: true, dobMatchesConfirmed: true, age21Confirmed: true })).status, 400);
  assert.equal((await f.run('id-review', { status: 'pending' })).status, 400);
  assert.equal(f.writes(), 0);
});
test('all admin flow writes require sign-in and admin membership', async () => {
  for (const name of ['payment', 'id-review', 'status']) {
    const body = { received: true, amountCents: 1000, status: 'approved' };
    const f = fixture(); assert.equal((await f.run(name, body, false)).status, 401);
    const nonAdmin = fixture({}, false); assert.equal((await nonAdmin.run(name, body)).status, 403);
    assert.equal(f.writes(), 0); assert.equal(nonAdmin.writes(), 0);
  }
});

test('ID approval requires every check to be strictly true before any database write', async () => {
  const checks = { readableConfirmed: true, validConfirmed: true, dobMatchesConfirmed: true, age21Confirmed: true };
  for (const key of Object.keys(checks)) {
    for (const value of [false, undefined, "true", 1]) {
      const f = fixture();
      assert.equal((await f.run('id-review', { status: 'approved', ...checks, [key]: value })).status, 400);
      assert.equal(f.writes(), 0);
    }
  }
  const f = fixture();
  assert.equal((await f.run('id-review', { status: 'approved' })).status, 400);
  assert.equal(f.writes(), 0);
});