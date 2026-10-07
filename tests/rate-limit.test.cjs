const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const response = { json: (body, options = {}) => Response.json(body, options) };
function load(relative, dependencies, env = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, process: { env }, URL,
    console: { error() {} },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return module.exports;
}
function limiter(rpc, overrides = {}) {
  return load('lib/rate-limit.ts', {
    'server-only': {}, 'node:crypto': crypto, 'node:net': require('node:net'),
    'next/server': { NextResponse: response },
    '@/lib/admin-db': { adminDatabase: () => ({ rpc }) },
  }, { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-secret', VERCEL: '1', NODE_ENV: 'production', ...overrides });
}
function request(ip = '192.0.2.1') {
  return new Request('https://example.test/api/track', { headers: { 'x-vercel-forwarded-for': ip } });
}

test('allowed request uses the shared RPC, policy and HMAC identity', async () => {
  let captured;
  const api = limiter(async (...args) => {
    captured = args;
    return { data: { allowed: true, retry_after_seconds: 60 }, error: null };
  });
  assert.equal(await api.enforceRateLimit(request(), 'tracking'), null);
  assert.equal(captured[0], 'consume_api_rate_limit');
  assert.deepEqual(JSON.parse(JSON.stringify(captured[1])), {
    p_scope: 'tracking', p_key: crypto.createHmac('sha256', 'synthetic-test-secret').update('192.0.2.1').digest('hex'),
    p_limit: 30, p_window_seconds: 60,
  });
});
test('denied requests return uncached 429 and integer Retry-After', async () => {
  const api = limiter(async () => ({ data: { allowed: false, retry_after_seconds: 42 } }));
  const result = await api.enforceRateLimit(request(), 'tracking');
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '42');
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('database errors, exceptions and malformed results fail closed', async () => {
  for (const rpc of [
    async () => ({ error: { code: 'PGRST202' } }),
    async () => { throw new Error('network unavailable'); },
    ...[null, {}, { allowed: true }, { allowed: false, retry_after_seconds: 0 },
      { allowed: false, retry_after_seconds: 1.5 }, { allowed: false, retry_after_seconds: 61 }]
      .map(data => async () => ({ data })),
  ]) {
    const result = await limiter(rpc).enforceRateLimit(request(), 'tracking');
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('retry-after'), '60');
  }
});
test('production rejects spoofable headers, missing trusted IP and missing secrets', async () => {
  let calls = 0;
  const rpc = async () => { calls++; return { data: { allowed: true, retry_after_seconds: 60 } }; };
  const spoofed = new Request('https://example.test', { headers: { 'x-forwarded-for': '192.0.2.2', 'x-real-ip': '192.0.2.2' } });
  for (const [input, env] of [[spoofed, {}], [request('invalid'), {}],
    [request('192.0.2.1, 192.0.2.2'), {}], [request(), { VERCEL: '' }],
    [request(), { SUPABASE_SERVICE_ROLE_KEY: '' }]]) {
    assert.equal((await limiter(rpc, env).enforceRateLimit(input, 'tracking')).status, 503);
  }
  assert.equal(calls, 0);
});
test('equivalent IPv6 spellings share identity; client IPs remain separate', async () => {
  const keys = [];
  const api = limiter(async (_, parameters) => {
    keys.push(parameters.p_key);
    return { data: { allowed: true, retry_after_seconds: 60 } };
  });
  await api.enforceRateLimit(request('2001:db8::1'), 'tracking');
  await api.enforceRateLimit(request('2001:0DB8:0:0:0:0:0:1'), 'tracking');
  await api.enforceRateLimit(request('2001:db8::2'), 'tracking');
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});
test('development ignores supplied forwarding headers', async () => {
  const keys = [];
  const api = limiter(async (_, parameters) => {
    keys.push(parameters.p_key);
    return { data: { allowed: true, retry_after_seconds: 60 } };
  }, { VERCEL: '', NODE_ENV: 'development' });
  await api.enforceRateLimit(request('192.0.2.1'), 'tracking');
  await api.enforceRateLimit(request('192.0.2.2'), 'tracking');
  assert.equal(keys[0], keys[1]);
});

const routes = [
  ['app/api/orders/route.ts', 'POST', 'orders'],
  ['app/api/orders/id-upload/route.ts', 'POST', 'idUpload'],
  ['app/api/track/route.ts', 'POST', 'tracking'],
  ['app/api/admin/orders/route.ts', 'GET', 'adminRead'],
  ['app/api/admin/orders/status/route.ts', 'PATCH', 'adminWrite'],
  ['app/api/admin/orders/id/route.ts', 'POST', 'adminId'],
  ['app/api/admin/orders/id-review/route.ts', 'PATCH', 'adminWrite'],
  ['app/api/admin/orders/id-cleanup/route.ts', 'POST', 'adminCleanup'],
];
function route(file, guard, env = {}) {
  return load(file, {
    '@/lib/delivery-area': { deliveryIsAvailable: () => false },
    '@/lib/shipping-policy': { shippingIsApproved: () => false },
    '@/lib/rate-limit': { enforceRateLimit: guard },
    'next/server': { NextResponse: response },
    '@/lib/admin-db': { adminDatabase: () => { throw new Error('Unexpected DB access'); } },
    '@supabase/supabase-js': { createClient: () => { throw new Error('Unexpected auth access'); } },
    '@/lib/server-cart': { CartInputError: class extends Error {} },
  }, env);
}
for (const [file, method, policy] of routes) {
  test(`${method} ${file} blocks before parsing, authentication or sensitive work`, async () => {
    const blocked = response.json({ error: 'limited' }, { status: 429 });
    let calls = 0;
    const handler = route(file, async (_, actualPolicy) => {
      calls++; assert.equal(actualPolicy, policy); return blocked;
    }, { ENABLE_ORDER_REQUESTS: 'true' });
    assert.equal(await handler[method]({ headers: new Headers(),
      json() { throw new Error('Unexpected parsing'); }, formData() { throw new Error('Unexpected upload'); },
    }), blocked);
    assert.equal(calls, 1);
  });
}
test('disabled orders keep existing 503 and never reach rate storage or order work', async () => {
  const handler = route('app/api/orders/route.ts', () => { throw new Error('Unexpected limiter'); }, {
    ENABLE_ORDER_REQUESTS: 'false',
  });
  const result = await handler.POST({});
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /not available yet/);
});
test('allowed requests still require age eligibility and explicit age confirmation', async () => {
  const handler = route('app/api/orders/route.ts', async () => null, { ENABLE_ORDER_REQUESTS: 'true' });
  const base = { requestId: '00000000-0000-0000-0000-000000000001',
    customerName: 'Synthetic Test', customerEmail: 'test@example.test', customerPhone: '2025550100' };
  for (const [fields, message] of [
    [{ dateOfBirth: '2010-01-01', ageConfirmed: true }, /at least 21/],
    [{ dateOfBirth: '2000-01-01', ageConfirmed: false }, /confirm/],
  ]) {
    const result = await handler.POST({ json: async () => ({ ...base, ...fields }) });
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, message);
  }
});
test('allowed tracking and upload requests still validate their request identifiers', async () => {
  const tracking = route('app/api/track/route.ts', async () => null);
  assert.equal((await tracking.POST({ json: async () => ({ orderNumber: 'bad', trackingToken: 'bad' }) })).status, 400);
  const upload = route('app/api/orders/id-upload/route.ts', async () => null);
  assert.equal((await upload.POST({ formData: async () => new Map([['requestId', 'bad']]) })).status, 400);
});
test('admin auth still rejects unauthenticated requests within the limit', async () => {
  for (const [file, method] of routes.filter(([file]) => file.includes('/admin/'))) {
    assert.equal((await route(file, async () => null)[method]({ headers: new Headers() })).status, 401);
  }
});
test('scheduled cleanup still requires its cron secret and does not consume manual budget', async () => {
  const handler = route('app/api/admin/orders/id-cleanup/route.ts', () => { throw new Error('Unexpected limiter'); }, {
    NODE_ENV: 'production', CRON_SECRET: 'synthetic-cron-secret',
  });
  assert.equal((await handler.GET({ headers: new Headers() })).status, 401);
  assert.equal((await handler.GET({ headers: new Headers({ authorization: 'Bearer wrong' }) })).status, 401);
});
