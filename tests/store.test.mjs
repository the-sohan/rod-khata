import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dayKey, decimal, openStore } from '../lib/store.mjs';

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rod-shop-test-'));
  const store=openStore(directory);
  t.after(()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});});
  store.addProduct({name:'BSRM 16 mm',openingQuantity:'5000',rate:'80'});
  return {store,directory};
}
function sale(overrides={}) {
  return {requestKey:randomUUID(),kind:'sale',party:'ক্রেতা এক',productId:1,quantity:'1000',rate:'80',paid:'50000',...overrides};
}
test('sale, collection, purchase and supplier payment keep quantities and debts consistent',t=>{
  const {store}=fixture(t);
  store.addEntry(sale());
  let result=store.dashboard();
  assert.equal(result.products[0].quantityKg,4000);
  assert.equal(result.totals.sales,80000);
  assert.equal(result.totals.received,50000);
  assert.equal(result.totals.customerDue,30000);
  store.addEntry({requestKey:randomUUID(),kind:'collection',party:'ক্রেতা এক',amount:'10000'});
  store.addEntry({requestKey:randomUUID(),kind:'purchase',party:'সাপ্লায়ার এক',productId:1,quantity:'1000',rate:'70',paid:'20000'});
  store.addEntry({requestKey:randomUUID(),kind:'supplier_payment',party:'সাপ্লায়ার এক',amount:'10000'});
  store.addEntry({requestKey:randomUUID(),kind:'expense',amount:'1000',note:'পরিবহন'});
  result=store.dashboard();
  assert.equal(result.products[0].quantityKg,5000);
  assert.equal(result.totals.customerDue,20000);
  assert.equal(result.totals.supplierDue,40000);
  assert.equal(result.totals.received,60000);
  assert.equal(result.totals.supplierPaid,30000);
  assert.equal(result.totals.expenses,1000);
});
test('network retry with the same request key cannot create a second sale',t=>{
  const {store}=fixture(t);
  const input=sale();
  const first=store.addEntry(input), second=store.addEntry(input);
  assert.equal(second.id,first.id);
  assert.equal(second.duplicate,true);
  assert.equal(store.dashboard().totals.saleCount,1);
  assert.equal(store.products()[0].quantityKg,4000);
  assert.throws(()=>store.addEntry({...input,quantity:'2000'}),/ভিন্ন হিসাব/);
});
test('invalid stock or overpayment rolls back the whole transaction',t=>{
  const {store}=fixture(t);
  assert.throws(()=>store.addEntry(sale({quantity:'6000'})),/পর্যাপ্ত স্টক/);
  assert.equal(store.products()[0].quantityKg,5000);
  assert.equal(store.dashboard().recent.length,0);
  assert.throws(()=>store.addEntry(sale({paid:'90000'})),/বেশি হতে পারে না/);
  assert.equal(store.products()[0].quantityKg,5000);
  assert.equal(store.dashboard().recent.length,0);
  store.addEntry(sale());
  assert.throws(()=>store.addEntry({requestKey:randomUUID(),kind:'collection',party:'ক্রেতা এক',amount:'30000.01'}),/বেশি হতে পারে না/);
  assert.equal(store.dashboard().totals.customerDue,30000);
});
test('fractional kilograms and poisha remain exact across repeated small entries',t=>{
  const {store}=fixture(t);
  for(let i=0;i<10;i++) store.addEntry(sale({quantity:'0.125',rate:'80.08',paid:'0'}));
  const result=store.dashboard();
  assert.equal(result.products[0].quantityKg,4998.75);
  assert.equal(result.totals.sales,100.10);
  assert.equal(result.totals.customerDue,100.10);
  assert.equal(decimal('১২.৫০',2,'দর'),1250);
  assert.throws(()=>decimal('1.234',2,'দর'));
});
test('owner snapshot stays at its published state until a new snapshot is created',t=>{
  const {store}=fixture(t);
  const initial=store.snapshot();
  store.addEntry(sale());
  assert.equal(initial.totals.sales,0);
  assert.equal(store.readSnapshot().totals.sales,0);
  assert.equal(store.snapshot().totals.sales,80000);
  assert.equal(store.readSnapshot().readonly,true);
  assert.equal(store.status().driveConnected,false);
  assert.equal(store.status().cloudUploadedAt,null);
});
test('live SQLite backup can be opened independently and restored with the same balances',async t=>{
  const {store,directory}=fixture(t);
  store.addEntry(sale());
  const result=await store.backupDatabase();
  assert.equal(result.verified,true);
  const backupPath=path.join(directory,'backups',result.filename);
  const source=new DatabaseSync(backupPath,{readOnly:true});
  assert.equal(source.prepare('SELECT stock_grams FROM products WHERE id=1').get().stock_grams,4_000_000);
  source.close();
  const restoreDir=path.join(directory,'restore-test');
  fs.mkdirSync(restoreDir);
  fs.copyFileSync(backupPath,path.join(restoreDir,'shop.sqlite'));
  const restored=openStore(restoreDir);
  try {
    assert.equal(restored.dashboard().totals.sales,80000);
    assert.equal(restored.dashboard().totals.customerDue,30000);
  } finally {restored.close();}
});
test('daily accounting uses Bangladesh midnight rather than the host timezone',()=>{
  assert.equal(dayKey(new Date('2026-10-18T17:59:59Z')),'2026-10-18');
  assert.equal(dayKey(new Date('2026-10-18T18:00:00Z')),'2026-10-19');
});
