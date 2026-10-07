const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const order = { id: 'test', order_number: 'TH-TEST', fulfillment: 'delivery', total: 14.99, customer_email: 'customer@example.com', id_document_path: 'private-id', tracking_token: 'private-token' };
function fixture(env = {}, result = 202) {
  let calls = []; let logs = [];
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/owner-order-email.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports, process: { env }, AbortSignal,
    console: { error: (...args) => logs.push(args.join(' ')) },
    require(name) { assert.equal(name, 'server-only'); return {}; },
    fetch: async (url, options) => { calls.push({ url, options }); if (result instanceof Error) throw result; return { status: result }; }
  });
  return { run: () => module.exports.notifyOwnerOfOrder(order), calls, logs };
}
const configured = { ENABLE_OWNER_ORDER_EMAILS: 'true', SENDGRID_API_KEY: 'secret-test', ORDER_ALERT_FROM_EMAIL: 'orders@example.com', ORDER_ALERT_TO_EMAIL: 'owner@example.com' };
test('owner email defaults off and incomplete configuration does not send', async () => {
  for (const env of [{}, { ...configured, ENABLE_OWNER_ORDER_EMAILS: 'false' }, { ...configured, SENDGRID_API_KEY: '' }, { ...configured, ORDER_ALERT_TO_EMAIL: 'invalid' }]) {
    const f = fixture(env); assert.notEqual(await f.run(), 'accepted'); assert.equal(f.calls.length, 0);
  }
});
test('alert goes only to configured owner with fee-inclusive total and no private customer data', async () => {
  const f = fixture(configured); assert.equal(await f.run(), 'accepted'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.sendgrid.com/v3/mail/send');
  const body = JSON.parse(f.calls[0].options.body); assert.equal(body.personalizations[0].to[0].email, 'owner@example.com');
  assert.match(body.content[0].value, /14\.99/); assert.match(body.content[0].value, /ID review is pending/);
  for (const value of ['customer@example.com', 'private-id', 'private-token']) assert.ok(!f.calls[0].options.body.includes(value));
});
test('provider rejections and timeouts return failure without throwing or leaking secrets', async () => {
  for (const result of [401, 429, 500, new Error('secret-test')]) {
    const f = fixture(configured, result); assert.equal(await f.run(), 'failed'); assert.equal(f.calls.length, 1); assert.ok(!f.logs.join(' ').includes('secret-test'));
  }
});
