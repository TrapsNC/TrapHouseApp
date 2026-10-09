const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('lib/inventory-costs.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const { inventoryCosts } = context.exports;
const product = { id: 'p', name: 'Product', stock: 99, price: 20 };
const basis = [{ productId: 'p', purchasedUnits: 10, unitCostCents: 550, invoiceIds: ['1'] }];

test('uses variant stock once and prices each variant separately', () => {
  const r = inventoryCosts([product], [{ product_id: 'p', stock: 2, price: 20 }, { product_id: 'p', stock: 3, price: 25 }], basis);
  assert.equal(r.rows[0].stock, 5);
  assert.equal(r.costCents, 2750);
  assert.equal(r.revenueCents, 11500);
  assert.equal(r.grossProfitCents, 8750);
});
test('excludes unknown costs and excess stock from totals', () => {
  const unknown = inventoryCosts([{ ...product, stock: 3 }], [], []);
  assert.equal(unknown.reviewProducts, 1); assert.equal(unknown.costCents, 0);
  const excess = inventoryCosts([{ ...product, stock: 11 }], [], basis);
  assert.equal(excess.rows[0].status, 'More stock than receipts cover');
  assert.equal(excess.rows[0].costCents, null);
});
test('excludes missing prices, ambiguous flower units and negative stock', () => {
  for (const p of [{ ...product, stock: 3, price: 0 }, { ...product, stock: 3, name: 'Flower - Jungle Cake' }, { ...product, stock: -1 }]) {
    const r = inventoryCosts([p], [], basis);
    assert.equal(r.costCents, 0); assert.equal(r.rows[0].grossProfitCents, null);
  }
});
test('shows a negative potential gross profit when price is below cost', () => {
  const r = inventoryCosts([{ ...product, stock: 2, price: 3 }], [], basis);
  assert.equal(r.grossProfitCents, -500);
});
