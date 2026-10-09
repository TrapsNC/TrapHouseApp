const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const moduleValue={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/cost-edits.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleValue.exports,module:moduleValue});
const {emptyEdits,validReceipt,editedBasis}=moduleValue.exports;
const original=[{productId:'p',purchasedUnits:10,unitCostCents:500,invoiceIds:['1']}];
test('draft saves incomplete receipt without changing estimates',()=>{
  const e=emptyEdits();e.handwritten={supplier:'',date:'',totalCents:1000,confirmed:false,lines:[{productId:'p',boxes:2,unitsPerBox:null,amountCents:null}]};
  assert.equal(validReceipt(e.handwritten,new Set(['p'])),true);
  assert.equal(editedBasis(original,e)[0].unitCostCents,500);
  e.handwritten.confirmed=true;assert.equal(validReceipt(e.handwritten,new Set(['p'])),false);
});
test('confirmed receipt requires valid date and exact amount reconciliation',()=>{
  const r={supplier:'Supplier',date:'2025-05-06',totalCents:1000,confirmed:true,lines:[{productId:'p',boxes:2,unitsPerBox:5,amountCents:1000}]};
  assert.equal(validReceipt(r,new Set(['p'])),true);
  assert.equal(validReceipt({...r,totalCents:1100},new Set(['p'])),false);
  assert.equal(validReceipt({...r,date:'2025-02-30'},new Set(['p'])),false);
  assert.equal(validReceipt(r,new Set(['other'])),false);
});
test('receipt costs are recomputed once from immutable original',()=>{
  const e=emptyEdits();e.handwritten={supplier:'Supplier',date:'2025-05-06',totalCents:1000,confirmed:true,lines:[{productId:'p',boxes:2,unitsPerBox:5,amountCents:1000}]};
  assert.equal(editedBasis(original,e)[0].unitCostCents,300);
  assert.equal(editedBasis(original,e)[0].purchasedUnits,20);
  assert.equal(editedBasis(original,e)[0].purchasedUnits,20);
  assert.equal(original[0].purchasedUnits,10);
});
test('owner overrides replace receipt cost including zero; removing restores receipt',()=>{
  const e=emptyEdits();e.overrides.p={unitCostCents:0,coveredUnits:7};
  assert.equal(editedBasis(original,e)[0].unitCostCents,0);
  assert.equal(editedBasis(original,e)[0].purchasedUnits,7);
  delete e.overrides.p;assert.equal(editedBasis(original,e)[0].unitCostCents,500);
});
