import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../lib/store.mjs';

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rodshop-v2-'));
  const store=openStore(directory);
  t.after(()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});});
  store.addProduct({name:'রড',unit:'kg',openingQuantity:'5000',rate:'80'});
  store.addProduct({name:'সিমেন্ট',unit:'pcs',openingQuantity:'100',rate:'500'});
  return store;
}
function mixed(overrides={}) {
  return {requestKey:randomUUID(),kind:'sale',party:'পরীক্ষার ক্রেতা',paid:'4000',
    items:[{productId:1,quantity:'80',rate:'80'},{productId:2,quantity:'2',rate:'500'}],...overrides};
}
test('one mixed-unit bill makes one sale, correct totals, stock and immutable receipt items',t=>{
  const store=fixture(t),input=mixed();
  const result=store.addEntry(input),receipt=store.receipt(result.id),data=store.dashboard();
  assert.equal(data.totals.saleCount,1);
  assert.equal(data.totals.sales,7400);assert.equal(data.totals.received,4000);assert.equal(data.totals.customerDue,3400);
  assert.equal(data.products.find(p=>p.unit==='kg').quantity,4920);
  assert.equal(data.products.find(p=>p.unit==='pcs').quantity,98);
  assert.deepEqual(receipt.items.map(p=>[p.unit,p.quantity,p.amount]),[['kg',80,6400],['pcs',2,1000]]);
  assert.equal(receipt.amount,7400);assert.equal(receipt.paid,4000);assert.equal(receipt.due,3400);
  assert.equal(store.addEntry(input).duplicate,true);
  assert.equal(store.dashboard().totals.saleCount,1);
  assert.equal(store.products().find(p=>p.unit==='pcs').quantity,98);
  store.db.prepare("UPDATE products SET name='নতুন নাম' WHERE id=2").run();
  assert.equal(store.receipt(result.id).items[1].name,'সিমেন্ট');
});
test('a mixed-unit purchase adds both stocks and supplier debt once',t=>{
  const store=fixture(t);
  const result=store.addEntry(mixed({kind:'purchase',party:'সাপ্লায়ার',paid:'2000',items:[
    {productId:1,quantity:'100',rate:'70'},{productId:2,quantity:'10',rate:'450'}]}));
  const data=store.dashboard();
  assert.equal(data.totals.supplierDue,9500);assert.equal(data.totals.supplierPaid,2000);
  assert.equal(data.totals.saleCount,0);assert.equal(data.products.find(p=>p.unit==='kg').quantity,5100);
  assert.equal(data.products.find(p=>p.unit==='pcs').quantity,110);assert.equal(store.receipt(result.id).amount,11500);
});
test('later line failure and repeated-product overselling roll back the entire bill',t=>{
  const store=fixture(t);
  assert.throws(()=>store.addEntry(mixed({items:[{productId:1,quantity:'20',rate:'80'},{productId:2,quantity:'101',rate:'500'}]})),/পর্যাপ্ত স্টক/);
  assert.equal(store.products().find(p=>p.unit==='kg').quantity,5000);
  assert.equal(store.dashboard().recent.length,0);assert.equal(store.customers().length,0);
  assert.throws(()=>store.addEntry(mixed({items:[{productId:2,quantity:'60',rate:'500'},{productId:2,quantity:'60',rate:'500'}]})),/পর্যাপ্ত স্টক/);
  assert.equal(store.products().find(p=>p.unit==='pcs').quantity,100);
  assert.equal(store.dashboard().recent.length,0);
});
test('piece products reject fractional stock and quantity while kilograms retain three decimals',t=>{
  const store=fixture(t);
  assert.throws(()=>store.addProduct({name:'ভগ্নাংশ পিস',unit:'pcs',openingQuantity:'1.5',rate:'10'}),/পূর্ণ সংখ্যা/);
  assert.throws(()=>store.addEntry(mixed({items:[{productId:2,quantity:'0.5',rate:'500'}]})),/পূর্ণ সংখ্যা/);
  const result=store.addEntry(mixed({paid:'0',items:[{productId:1,quantity:'0.125',rate:'80.08'}]}));
  assert.equal(store.receipt(result.id).amount,10.01);assert.equal(store.receipt(result.id).items[0].quantity,0.125);
});
test('customer create, rename, archive and restore preserve debt and original receipt contact',t=>{
  const store=fixture(t);
  const customer=store.saveCustomer({name:'প্রথম নাম',address:'আগের ঠিকানা',mobile:'০১৭১২৩৪৫৬৭৮'});
  assert.equal(customer.mobile,'01712345678');
  const result=store.addEntry(mixed({customerId:customer.id,party:'',paid:'4000'}));
  const edited=store.saveCustomer({id:customer.id,name:'পরিবর্তিত নাম',address:'নতুন ঠিকানা',mobile:'01812345678'});
  assert.equal(edited.due,3400);assert.equal(store.dashboard().customers[0].name,'পরিবর্তিত নাম');
  assert.equal(store.receipt(result.id).party,'প্রথম নাম');assert.equal(store.receipt(result.id).address,'আগের ঠিকানা');
  assert.equal(store.receipt(result.id).mobile,'01712345678');
  assert.throws(()=>store.archiveCustomer({id:customer.id}),/বাকি আছে/);
  store.addEntry({kind:'collection',customerId:customer.id,amount:'3400',requestKey:randomUUID()});
  store.archiveCustomer({id:customer.id});
  assert.equal(store.customers().length,0);assert.equal(store.customers(true)[0].archived,true);
  assert.equal(store.dashboard().totals.sales,7400);
  assert.throws(()=>store.addEntry(mixed({customerId:customer.id})),/পুনরায় সক্রিয়/);
  store.archiveCustomer({id:customer.id,restore:true});assert.equal(store.customers()[0].archived,false);
  assert.throws(()=>store.saveCustomer({name:'পরিবর্তিত নাম'}),/আগে থেকেই আছে/);
});
test('snapshot and restored backup retain customer contacts and all mixed-unit bill items',async t=>{
  const store=fixture(t);
  const customer=store.saveCustomer({name:'ড্যাশবোর্ড ক্রেতা',address:'ঢাকা',mobile:'01712345678'});
  store.addEntry(mixed({customerId:customer.id,party:''}));
  const snapshot=store.snapshot();
  assert.equal(snapshot.schemaVersion,2);assert.equal(snapshot.recent[0].items.length,2);
  assert.equal(snapshot.products.find(p=>p.unit==='pcs').quantity,98);
  const result=await store.backupDatabase();
  const backup=new DatabaseSync(path.join(path.dirname(store.databasePath),'backups',result.filename),{readOnly:true});
  try {assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM entry_items').get().n,2);assert.equal(backup.prepare('SELECT mobile FROM parties').get().mobile,'01712345678');}
  finally {backup.close();}
});
test('version-1 migration preserves IDs, stock, sale totals and debt and can run repeatedly',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rodshop-legacy-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const legacy=new DatabaseSync(path.join(directory,'shop.sqlite'));
  legacy.exec(`
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO settings VALUES ('shop_id','legacy-shop'),('shop_name','পুরোনো দোকান');
    CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,stock_grams INTEGER NOT NULL,rate_poisha INTEGER NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO products VALUES (1,'পুরোনো রড',4000000,8000,'2026-10-19T00:00:00Z');
    CREATE TABLE entries(id INTEGER PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,kind TEXT NOT NULL,
      party TEXT NOT NULL,product_id INTEGER,quantity_grams INTEGER NOT NULL,rate_poisha INTEGER NOT NULL,
      amount_poisha INTEGER NOT NULL,paid_poisha INTEGER NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,local_day TEXT NOT NULL);
    INSERT INTO entries VALUES (1,'legacy-sale','hash','sale','পুরোনো ক্রেতা',1,1000000,8000,8000000,5000000,'','2026-10-19T00:00:00Z','2026-10-19');
    INSERT INTO entries VALUES (2,'legacy-collection','hash2','collection','পুরোনো ক্রেতা',NULL,0,0,1000000,1000000,'','2026-10-19T01:00:00Z','2026-10-19');
    PRAGMA user_version=1;
  `);legacy.close();
  let store=openStore(directory);
  try {
    const data=store.dashboard(new Date('2026-10-19T05:00:00Z'));
    assert.equal(data.shop.id,'legacy-shop');assert.equal(data.totals.sales,80000);assert.equal(data.totals.received,60000);
    assert.equal(data.totals.customerDue,20000);assert.equal(store.customers()[0].name,'পুরোনো ক্রেতা');
    assert.equal(store.products()[0].quantity,4000);assert.equal(store.products()[0].unit,'kg');
    assert.equal(store.receipt(1).items[0].amount,80000);assert.equal(store.receipt(2).items.length,0);
  } finally {store.close();}
  store=openStore(directory);
  try {assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM entry_items').get().n,1);assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,2);}
  finally {store.close();}
});
