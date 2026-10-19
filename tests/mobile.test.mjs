import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../lib/store.mjs';
import {snapshotReport,validateOwnerSnapshot} from '../lib/snapshot-reports.mjs';
import {mobileConfiguration,setMobileConfiguration,publicMobileConfiguration,createMobileServer} from '../lib/mobile-access.mjs';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rodshop-mobile-')),store=openStore(dir);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  store.addProduct({name:'রড',unit:'kg',openingQuantity:'5000',rate:'80'});store.addProduct({name:'সিমেন্ট',unit:'pcs',openingQuantity:'100',rate:'500'});
  const customer=store.saveCustomer({name:'পরীক্ষার ক্রেতা',mobile:'01000000001'});
  function at(day,input){const entry=store.addEntry({requestKey:randomUUID(),...input});store.db.prepare('UPDATE entries SET local_day=?,created_at=? WHERE id=?').run(day,`${day}T06:00:00Z`,entry.id);return entry.id;}
  at('2026-08-31',{kind:'sale',customerId:customer.id,items:[{productId:1,quantity:'1.125',rate:'80'}],paid:'20'});
  at('2026-09-01',{kind:'sale',customerId:customer.id,items:[{productId:1,quantity:'2.5',rate:'80'},{productId:2,quantity:'3',rate:'500'},{productId:1,quantity:'1.5',rate:'90'}],paid:'500'});
  at('2026-09-10',{kind:'collection',customerId:customer.id,amount:'40'});
  at('2026-09-12',{kind:'purchase',party:'পরীক্ষার সরবরাহকারী',items:[{productId:1,quantity:'10',rate:'60'}],paid:'300'});
  at('2026-09-13',{kind:'supplier_payment',party:'পরীক্ষার সরবরাহকারী',amount:'100'});
  at('2026-09-14',{kind:'expense',amount:'20'});
  at('2026-10-01',{kind:'sale',customerId:customer.id,items:[{productId:2,quantity:'1',rate:'500'}],paid:'0'});
  return {store,dir};
}
const byId=rows=>[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
test('mobile snapshot reports match PC SQL totals, products, customers and days for every period',t=>{
  const {store}=fixture(t),snapshot=store.snapshot();validateOwnerSnapshot(snapshot);
  for(const input of [{period:'daily',date:'2026-09-01'},{period:'weekly',date:'2026-09-12'},
    {period:'monthly',month:'2026-09'},{period:'yearly',year:'2026'},{period:'custom',from:'2026-08-01',to:'2026-10-19'},
    {period:'daily',date:'2026-09-10'},{period:'monthly',month:'2026-11'}]) {
    const pc=store.salesReport(input),mobile=snapshotReport(snapshot,input);
    assert.deepEqual(mobile.range,pc.range);assert.deepEqual(mobile.totals,pc.totals);
    assert.deepEqual(byId(mobile.products),byId(pc.products));assert.deepEqual(byId(mobile.customers),byId(pc.customers));assert.deepEqual(mobile.days,pc.days);
  }
});
test('owner reports retain the published snapshot until the PC creates its next update',t=>{
  const {store}=fixture(t),first=store.snapshot(),input={period:'yearly',year:'2026'},before=snapshotReport(first,input).totals.sales;
  store.addEntry({requestKey:randomUUID(),kind:'sale',party:'নতুন ক্রেতা',items:[{productId:1,quantity:'1',rate:'80'}],paid:'80'});
  assert.equal(snapshotReport(store.readSnapshot(),input).totals.sales,before);
  assert.equal(snapshotReport(store.snapshot(),input).totals.sales,before+80);
});
test('mobile pairing is disabled by default, produces fresh tokens and revokes disabled connections',t=>{
  const {store}=fixture(t);assert.equal(mobileConfiguration(store.db).enabled,false);
  setMobileConfiguration(store.db,true);const first=mobileConfiguration(store.db);assert.match(first.token,/^[\w-]{43}$/);
  assert.equal('token' in publicMobileConfiguration(store.db),false);
  setMobileConfiguration(store.db,false);assert.equal(mobileConfiguration(store.db).token,'');
  setMobileConfiguration(store.db,true);assert.notEqual(mobileConfiguration(store.db).token,first.token);
});
test('mobile gateway requires the token and exposes no entry-writing or reports endpoints',async t=>{
  const {store,dir}=fixture(t);store.snapshot();setMobileConfiguration(store.db,true);
  const config=()=>mobileConfiguration(store.db),apk=path.join(dir,'test.apk');fs.writeFileSync(apk,'test-apk');
  const server=createMobileServer({getConfiguration:config,readSnapshot:store.readSnapshot,apkPath:apk});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${config().token}`};
    assert.equal((await fetch(url+'/snapshot')).status,401);
    const response=await fetch(url+'/snapshot',{headers});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.equal((await response.json()).data.reportData.version,1);
    assert.equal((await fetch(url+'/api/entry',{method:'POST',headers,body:'{}'})).status,405);
    assert.equal((await fetch(url+'/api/reports',{headers})).status,404);
    const download=await fetch(url+'/download/owner.apk');assert.equal(download.headers.get('content-type'),'application/vnd.android.package-archive');assert.equal(await download.text(),'test-apk');
    setMobileConfiguration(store.db,false);assert.equal((await fetch(url+'/snapshot',{headers})).status,403);
    for(let i=0;i<11;i++) {setMobileConfiguration(store.db,true);await fetch(url+'/snapshot');}
    assert.equal((await fetch(url+'/snapshot')).status,429);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('APK demo contains only fictional customers and all three months, without live pairing credentials',()=>{
  const data=validateOwnerSnapshot(JSON.parse(fs.readFileSync(new URL('../apps/owner/public/demo-owner.json',import.meta.url))));
  assert.equal(data.shop.id,'rodshop-public-demo');assert.equal(data.customerRecords.length,30);assert.equal(data.reportData.entries.length,135);
  assert.ok(data.customerRecords.every(row=>row.mobile.startsWith('010000000')));
  assert.equal(snapshotReport(data,{period:'monthly',month:'2026-08'}).totals.invoiceCount,45);
  assert.equal(snapshotReport(data,{period:'monthly',month:'2026-09'}).totals.invoiceCount,45);
  assert.equal(snapshotReport(data,{period:'monthly',month:'2026-10'}).totals.invoiceCount,45);
  assert.ok(!JSON.stringify(data).includes('mobile_token'));
  assert.throws(()=>validateOwnerSnapshot({readonly:true}));
});
