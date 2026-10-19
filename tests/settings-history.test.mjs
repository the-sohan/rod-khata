import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../lib/store.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rodshop-history-')),store=openStore(dir);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  store.addProduct({name:'রড',unit:'kg',openingQuantity:'5000',rate:'80'});
  const customer=store.saveCustomer({name:'পুরোনো নাম',mobile:'01712345678',address:'ঢাকা'});
  return {store,dir,customer};
}
const sale=(customerId,paid='20',note='')=>({requestKey:randomUUID(),kind:'sale',customerId,paid,note,items:[{productId:1,quantity:'1',rate:'80'}]});
test('shop settings persist, brand existing receipts and restore from verified backup with logo',async t=>{
  const {store,dir,customer}=fixture(t),entry=store.addEntry(sale(customer.id));
  const shop=store.saveShop({name:'মেসার্স আরিফ ট্রেডার্স',address:'রেকাবী বাজার\nমুন্সিগঞ্জ',mobile:'০১৭১২৩৪৫৬৭৮',logo:png});
  assert.equal(shop.mobile,'01712345678');assert.equal(shop.logo,png);
  assert.equal(store.receipt(entry.id).shop.name,shop.name);
  assert.equal(store.receipt(entry.id).address,'ঢাকা');
  assert.equal(store.snapshot().shop.logo,png);
  assert.equal(store.dashboard().recent[0].shop,undefined,'dashboard should include logo only once');
  const backup=await store.backupDatabase(),restoreDir=path.join(dir,'restored');fs.mkdirSync(restoreDir);
  fs.copyFileSync(path.join(dir,'backups',backup.filename),path.join(restoreDir,'shop.sqlite'));
  const restored=openStore(restoreDir);
  try {assert.deepEqual(restored.shop(),shop);assert.equal(restored.receipt(entry.id).amount,80);} finally {restored.close();}
  store.saveShop({...shop,logo:''});assert.equal(store.shop().logo,'');
});
test('invalid branding input never partially changes saved shop settings',t=>{
  const {store}=fixture(t),before=store.shop();
  for(const input of [{name:''},{name:'নতুন',mobile:'bad'},{name:'নতুন',logo:'data:image/svg+xml;base64,PHN2Zz4='},
    {name:'নতুন',logo:'data:image/png;base64,'+Buffer.alloc(40,1).toString('base64')},
    {name:'নতুন',logo:'data:image/png;base64,'+Buffer.alloc(500_001).toString('base64')}]) {
    assert.throws(()=>store.saveShop(input));assert.deepEqual(store.shop(),before);
  }
});
test('all customer history is paginated beyond latest 20, isolated by ID and totals include collections',t=>{
  const {store,customer}=fixture(t),other=store.saveCustomer({name:'অন্য ক্রেতা'}),ids=[];
  for(let i=0;i<30;i++) ids.push(store.addEntry(sale(customer.id,'20',i===0?'বিশেষ বিবরণ':'')).id);
  store.addEntry(sale(other.id));
  const collection=store.addEntry({requestKey:randomUUID(),kind:'collection',customerId:customer.id,amount:'100'});
  const latest=store.customerHistory({id:customer.id});
  assert.equal(latest.total,31);assert.equal(latest.entries.length,25);assert.equal(latest.pages,2);
  assert.equal(latest.entries[0].id,collection.id);
  assert.deepEqual(latest.summary,{billCount:30,collectionCount:1,sales:2400,received:700,balance:1700});
  const second=store.customerHistory({id:customer.id,page:2});
  assert.equal(second.entries.length,6);assert.equal(second.entries.at(-1).id,ids[0]);
  assert.equal(new Set([...latest.entries,...second.entries].map(row=>row.id)).size,31);
  assert.ok([...latest.entries,...second.entries].every(row=>row.partyId===customer.id));
  const oldest=store.customerHistory({id:customer.id,sort:'oldest',kind:'sale'});
  assert.equal(oldest.total,30);assert.equal(oldest.entries[0].id,ids[0]);
  assert.equal(store.customerHistory({id:customer.id,kind:'collection'}).entries[0].amount,100);
  assert.equal(store.customerHistory({id:customer.id,q:'বিশেষ'}).entries[0].id,ids[0]);
  assert.equal(store.customerHistory({id:customer.id,q:`RK-${String(ids[0]).padStart(5,'0')}`}).total,1);
  assert.equal(store.customerHistory({id:customer.id,q:'রড'}).total,30);
  assert.equal(store.customerHistory({id:customer.id,q:'%'}).total,0,'wildcards are literal search');
  assert.equal(store.customerHistory({id:customer.id,q:'none',page:9}).page,1);
  assert.throws(()=>store.customerHistory({id:customer.id,sort:'DROP TABLE entries'}));
});
test('history remains linked after rename and archive, including original receipt contact',t=>{
  const {store,customer}=fixture(t),entry=store.addEntry(sale(customer.id,'80'));
  store.saveCustomer({...customer,name:'নতুন নাম',address:'নতুন ঠিকানা'});
  store.archiveCustomer({id:customer.id});
  const history=store.customerHistory({id:customer.id});
  assert.equal(history.customer.name,'নতুন নাম');assert.equal(history.customer.archived,true);
  assert.equal(history.entries[0].id,entry.id);assert.equal(history.entries[0].party,'পুরোনো নাম');
  assert.equal(history.entries[0].address,'ঢাকা');assert.equal(history.summary.balance,0);
  assert.throws(()=>store.customerHistory({id:9999}),/পাওয়া যায়নি/);
});
