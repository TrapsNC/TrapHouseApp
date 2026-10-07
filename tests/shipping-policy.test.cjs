const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,process:{env},console,require(name){if(Object.hasOwn(dependencies,name))return dependencies[name];throw Error('Unexpected dependency '+name);}});
  return module.exports;
}
const { shippingIsApproved } = load('lib/shipping-policy.ts');
const item = { productId:'product-a',variantId:null };
const now = Date.parse('2026-10-07T00:00:00Z');
const approval = {...item,state:'NC',zip:'27601',carrier:'reviewed-carrier',reviewReference:'review-123',expiresAt:'2026-10-08T00:00:00Z'};
const check = (items=[item],state='NC',zip='27601',carrier='reviewed-carrier',rules=[approval]) => shippingIsApproved(items,state,zip,carrier,rules,now);
test('shipping defaults to blocked even for a known product and destination',()=>assert.equal(shippingIsApproved([item],'NC','27601','reviewed-carrier'),false));
test('exact reviewed product, destination and carrier are approved',()=>assert.equal(check(),true));
test('unapproved mixed carts and variants block the entire shipment',()=>{assert.equal(check([item,{productId:'other',variantId:null}]),false);assert.equal(check([{...item,variantId:'other'}]),false);});
test('state, ZIP and carrier must match the same approval',()=>{for(const args of [[undefined,'CA'],[undefined,'NC','99999'],[undefined,'NC','27601','other'],[undefined,'ZZ'],[undefined,'NC','27601extra'],[undefined,'NC','27601','']])assert.equal(check(...args),false);assert.equal(check([],undefined,undefined,undefined),false);});
test('expired, invalid and unreviewed approvals fail closed',()=>{for(const patch of [{expiresAt:'2026-10-07T00:00:00Z'},{expiresAt:'invalid'},{reviewReference:' '}])assert.equal(check(undefined,undefined,undefined,undefined,[{...approval,...patch}]),false);});
test('shipping route blocks before ID lookup, quote or order creation despite allowlisted state and forged client approval',async()=>{
 const route=load('app/api/orders/route.ts',{'@/lib/delivery-area':{deliveryIsAvailable:()=>false},'@/lib/shipping-policy':{shippingIsApproved},'@/lib/rate-limit':{enforceRateLimit:async()=>null},'next/server':{NextResponse:{json:Response.json}},'@/lib/admin-db':{adminDatabase:()=>{throw Error('DB must not be reached');}},'@/lib/server-cart':{CartInputError:class extends Error{},parseCart:()=>[{...item,fulfillment:'shipping'}],freshQuote:()=>{throw Error('Quote must not be reached');}}},{ENABLE_ORDER_REQUESTS:'true',ALLOWED_SHIPPING_STATES:'NC',SHIPPING_CARRIER:'reviewed-carrier'});
 const response=await route.POST({json:async()=>({requestId:'11111111-1111-4111-8111-111111111111',customerName:'Test User',customerEmail:'test@example.com',customerPhone:'9195550100',dateOfBirth:'1990-01-01',ageConfirmed:true,fulfillment:'shipping',deliveryAddress:'123 Test Street, Raleigh NC 27601',deliveryState:'NC',deliveryZip:'27601',expectedSubtotalCents:100,items:[item],shippingApproved:true,shippingApprovals:[approval]})});
 assert.equal(response.status,403);assert.match((await response.json()).error,/Shipping is unavailable/);
});
