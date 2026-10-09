const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(path, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, Response, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-secret' } }, require: name => dependencies[name] ?? (() => { throw Error(`Unexpected dependency ${name}`); })() });
  return module.exports;
}
const helpers = load('lib/owner-finance.ts', { 'server-only': {}, 'node:crypto': crypto, '@supabase/supabase-js': {}, '@/lib/admin-db': {} });
test('PIN hash verifies exact input and never stores the PIN', () => {
  const config = helpers.hashPin('1234');
  assert.notEqual(config.hash, '1234'); assert.equal(config.hash.length, 128);
  assert.equal(helpers.matchesPin('1234', config), true);
  assert.equal(helpers.matchesPin('4321', config), false);
  assert.equal(helpers.matchesPin('1234', {}), false);
});
test('unlocks are owner-bound, signed and expire', () => {
  const { unlock } = helpers.issueUnlock('owner-one');
  assert.equal(helpers.validUnlock(unlock, 'owner-one'), true);
  assert.equal(helpers.validUnlock(unlock, 'other-admin'), false);
  assert.equal(helpers.validUnlock(unlock + '0', 'owner-one'), false);
  const payload = Buffer.from(JSON.stringify({ ownerId: 'owner-one', expiresAt: Date.now() - 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', 'test-secret').update(`owner-finance:${payload}`).digest('hex');
  assert.equal(helpers.validUnlock(`${payload}.${signature}`, 'owner-one'), false);
});
test('cost figures are blocked before any inventory queries when PIN is absent', async () => {
  const route = load('app/api/admin/costs/route.ts', { 'next/server': { connection: async () => {} }, '@/lib/rate-limit': { enforceRateLimit: async () => null }, '@/lib/owner-finance': { financeOwner: async () => ({ ownerId: 'owner', db: { from: () => { throw Error('Must not query figures'); } } }), validUnlock: () => false }, '@/lib/inventory-costs': {} });
  const response = await route.GET(new Request('http://example.test/api', { headers: { authorization: 'Bearer test' } }));
  assert.equal(response.status, 423);
  assert.equal((await response.json()).costCents, undefined);
});
test('non-owner cannot request PIN setup or financial figures', async () => {
  const deps = { 'next/server': { connection: async () => {} }, 'node:crypto': crypto, '@/lib/rate-limit': { enforceRateLimit: async () => null }, '@/lib/owner-finance': { financeOwner: async () => null }, '@/lib/inventory-costs': {} };
  const pins = load('app/api/admin/owner-pin/route.ts', deps);
  const costs = load('app/api/admin/costs/route.ts', deps);
  assert.equal((await pins.GET(new Request('http://example.test'))).status, 403);
  assert.equal((await pins.POST(new Request('http://example.test', { method: 'POST', body: JSON.stringify({ action: 'setup', pin: '1234', confirmPin: '1234' }) }))).status, 403);
  assert.equal((await costs.GET(new Request('http://example.test'))).status, 403);
});
test('shared owner attempt budget rejects guessing before PIN comparison', async () => {
  const route = load('app/api/admin/owner-pin/route.ts', { 'node:crypto': crypto, 'next/server': {}, '@/lib/rate-limit': { enforceRateLimit: async () => null }, '@/lib/owner-finance': { financeOwner: async () => ({ ownerId: 'owner', config: { hash: 'exists' }, db: { rpc: async () => ({ data: { allowed: false } }) } }), matchesPin: () => { throw Error('Must not compare'); } } });
  const response = await route.POST(new Request('http://example.test', { method: 'POST', body: JSON.stringify({ action: 'unlock', pin: '1234' }) }));
  assert.equal(response.status, 429);
});
test('existing owner PIN cannot be replaced using setup', async () => {
  const route = load('app/api/admin/owner-pin/route.ts', { 'node:crypto': crypto, 'next/server': {}, '@/lib/rate-limit': { enforceRateLimit: async () => null }, '@/lib/owner-finance': { financeOwner: async () => ({ ownerId: 'owner', config: { hash: 'exists' }, db: { rpc: async () => ({ data: { allowed: true } }) }, bucket: { upload: () => { throw Error('Must not replace'); } } }) } });
  const response = await route.POST(new Request('http://example.test', { method: 'POST', body: JSON.stringify({ action: 'setup', pin: '1234', confirmPin: '1234' }) }));
  assert.equal(response.status, 409);
});
