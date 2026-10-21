import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('hosted demo is isolated, seeds three months, allows demo entries and blocks real connections',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rod-demo-test-'));
  const realFolder=fs.mkdtempSync(path.join(os.tmpdir(),'rod-real-test-'));
  process.env.ROD_SHOP_DEMO='1';process.env.ROD_SHOP_DEMO_DATA_DIR=folder;
  process.env.ROD_SHOP_DATA_DIR=realFolder;process.env.ROD_SHOP_DEMO_ORIGIN='https://demo.example.com';
  const {seedDemo}=await import('../lib/demo-seed.mjs');
  const {openStore,defaultDataDir,dayKey}=await import('../lib/store.mjs');
  const route=await import('../apps/pc/app/api/[action]/route.js');
  const drive=await import('../apps/pc/app/api/drive/[action]/route.js');
  const context=action=>({params:Promise.resolve({action})});
  const request=(action,{origin='https://demo.example.com',host='demo.example.com',payload}={})=>new Request(`https://demo.example.com/api/${action}`,{method:payload?'POST':'GET',headers:{Host:host,Origin:origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
  try {
    assert.equal(defaultDataDir,folder);
    assert.deepEqual(seedDemo(folder),{customers:30,invoices:135});
    assert.throws(()=>seedDemo(folder),/empty directory/);
    assert.deepEqual(fs.readdirSync(realFolder),[]);
    const store=openStore();let customer,product;
    try {
      assert.equal(store.customers().length,30);
      assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM entries WHERE kind='sale'").get().n,135);
      const months=store.db.prepare("SELECT substr(local_day,1,7) AS month,COUNT(*) AS n FROM entries WHERE kind='sale' GROUP BY month ORDER BY month").all();
      assert.equal(months.length,3);assert.deepEqual(months.map(row=>row.n),[45,45,45]);
      assert.equal(months.at(-1).month,dayKey().slice(0,7));
      assert.ok(store.dashboard().totals.sales>0);assert.equal(store.status().demo,true);
      assert.ok(store.customers().every(row=>row.mobile===''));
      [customer]=store.customers();[product]=store.products();
    } finally {store.close();}
    const data=await route.GET(request('dashboard'),context('dashboard'));
    assert.equal(data.status,200);assert.equal((await data.json()).status.demo,true);
    for(const action of ['mobile-config','owner-export']) assert.equal((await route.GET(request(action),context(action))).status,403);
    for(const action of ['backup','mobile-config']) assert.equal((await route.POST(request(action,{payload:{}}),context(action))).status,403);
    assert.equal((await route.GET(request('dashboard',{host:'evil.example'}),context('dashboard'))).status,403);
    assert.equal((await route.POST(request('entry',{origin:'https://evil.example',payload:{}}),context('entry'))).status,403);
    const entry=await route.POST(request('entry',{payload:{kind:'sale',customerId:customer.id,items:[{productId:product.id,quantity:'2',rate:String(product.rate)}],paid:'0',requestKey:'demo-new-entry-0001'}}),context('entry'));
    assert.equal(entry.status,200);
    const owner=await (await route.GET(request('owner-snapshot'),context('owner-snapshot'))).json();
    assert.equal(owner.demo,true);assert.equal(owner.data.reportData.entries.filter(row=>row.kind==='sale').length,136);
    assert.equal((await drive.GET(request('drive/status'),context('status'))).status,403);
    assert.equal((await drive.POST(request('drive/configure',{payload:{ownerEmail:'owner@example.com'}}),context('configure'))).status,403);
    assert.ok(!fs.existsSync(path.join(folder,'google-drive')));
  } finally {fs.rmSync(folder,{recursive:true,force:true});fs.rmSync(realFolder,{recursive:true,force:true});}
});
