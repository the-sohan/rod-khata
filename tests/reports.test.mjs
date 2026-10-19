import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore,dayKey} from '../lib/store.mjs';
import {reportRange} from '../lib/report-dates.mjs';

test('report periods use inclusive Bangladesh calendar dates, Saturday weeks and leap years',()=>{
  const today='2026-10-19';
  assert.deepEqual([reportRange({},today).from,reportRange({},today).to],[today,today]);
  const week=reportRange({period:'weekly',date:'2026-01-01'},today);
  assert.equal(week.from,'2025-12-27');assert.equal(week.to,'2026-01-02');
  const saturday=reportRange({period:'weekly',date:'2026-10-17'},today);
  assert.equal(saturday.from,'2026-10-17');assert.equal(saturday.to,'2026-10-23');
  const leap=reportRange({period:'monthly',month:'2024-02'},today);
  assert.equal(leap.from,'2024-02-01');assert.equal(leap.to,'2024-02-29');
  assert.equal(reportRange({period:'monthly',month:'2026-02'},today).to,'2026-02-28');
  assert.equal(reportRange({period:'yearly',year:'2025'},today).to,'2025-12-31');
  const custom=reportRange({period:'custom',from:'2026-08-01',to:today},today);
  assert.equal(custom.from,'2026-08-01');assert.equal(custom.to,today);
});
test('report range rejects impossible dates, reversed periods and invalid input',()=>{
  for(const input of [{date:'2026-02-29'},{date:'2026-02-30'},{date:'bad'},
    {period:'monthly',month:'2026-13'},{period:'yearly',year:'abc'},
    {period:'custom',from:'2026-09-30',to:'2026-09-01'},{period:'custom',from:'2026-09-01'},
    {period:'anything'}]) assert.throws(()=>reportRange(input,'2026-10-19'),RangeError);
});
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rodshop-reports-')),store=openStore(dir);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  store.addProduct({name:'রড',unit:'kg',openingQuantity:'5000',rate:'80'});
  store.addProduct({name:'সিমেন্ট',unit:'pcs',openingQuantity:'100',rate:'500'});
  const a=store.saveCustomer({name:'আগের নাম'}),b=store.saveCustomer({name:'দ্বিতীয় ক্রেতা'});
  function at(date,input) {
    const result=store.addEntry({requestKey:randomUUID(),...input}),time=date.includes('T')?date:`${date}T06:00:00Z`;
    store.db.prepare('UPDATE entries SET created_at=?,local_day=? WHERE id=?').run(time,dayKey(new Date(time)),result.id);
    return result.id;
  }
  const sale=(customerId,items,paid)=>({kind:'sale',customerId,items,paid});
  at('2026-08-31',sale(a.id,[{productId:1,quantity:'1',rate:'100'}],'20'));
  // 18:30 UTC on August 31 is September 1 in Bangladesh.
  at('2026-08-31T18:30:00Z',sale(a.id,[{productId:1,quantity:'2',rate:'80'},{productId:2,quantity:'3',rate:'500'}],'600'));
  at('2026-09-10',{kind:'collection',customerId:a.id,amount:'40'});
  at('2026-09-12',{kind:'purchase',party:'সাপ্লায়ার',items:[{productId:1,quantity:'10',rate:'50'}],paid:'200'});
  at('2026-09-13',{kind:'supplier_payment',party:'সাপ্লায়ার',amount:'100'});
  at('2026-09-14',{kind:'expense',amount:'30',note:'যাতায়াত'});
  at('2026-09-15',sale(b.id,[{productId:1,quantity:'1',rate:'90'}],'90'));
  at('2026-09-30',sale(a.id,[{productId:1,quantity:'1',rate:'80'},{productId:1,quantity:'1',rate:'80'}],'160'));
  at('2026-10-01',sale(a.id,[{productId:2,quantity:'1',rate:'500'}],'0'));
  store.saveCustomer({...a,name:'পরিবর্তিত নাম'});store.archiveCustomer({id:b.id});
  return {store,a,b,at,sale};
}
const monthly={period:'monthly',month:'2026-09'};
test('report totals count mixed bills once and separate sales, collections and cash out',t=>{
  const {store}=fixture(t),report=store.salesReport(monthly),total=report.totals;
  assert.deepEqual(total,{sales:1910,salePaid:850,collections:40,purchases:500,purchasePaid:200,supplierPayments:100,
    expenses:30,invoiceCount:3,customerCount:2,received:890,newDue:1060,openingDue:80,closingDue:1100,cashOut:330,cashMovement:560});
  assert.equal(report.products.reduce((sum,p)=>sum+p.sales,0),total.sales);
  assert.equal(report.customers.reduce((sum,p)=>sum+p.sales,0),total.sales);
  assert.equal(report.days.reduce((sum,day)=>sum+day.sales,0),total.sales);
  assert.equal(report.days.reduce((sum,day)=>sum+day.received,0),total.received);
  assert.equal(report.days.reduce((sum,day)=>sum+day.invoiceCount,0),3);
});
test('product report keeps KG and pieces separate and handles repeat product lines in one invoice',t=>{
  const {store}=fixture(t),report=store.salesReport(monthly);
  const rod=report.products.find(p=>p.unit==='kg'),cement=report.products.find(p=>p.unit==='pcs');
  assert.equal(rod.quantity,5);assert.equal(rod.sales,410);assert.equal(rod.invoiceCount,3);assert.equal(rod.averageRate,82);
  assert.equal(cement.quantity,3);assert.equal(cement.sales,1500);assert.equal(cement.invoiceCount,1);
  assert.equal(report.totals.invoiceCount,3,'product invoice counts must not inflate total bill count');
});
test('customer report uses stable IDs, includes archived customers and excludes future debt',t=>{
  const {store,a,b}=fixture(t),report=store.salesReport(monthly);
  const first=report.customers.find(p=>p.id===a.id),second=report.customers.find(p=>p.id===b.id);
  assert.equal(first.name,'পরিবর্তিত নাম');assert.equal(first.invoiceCount,2);assert.equal(first.sales,1820);
  assert.equal(first.salePaid,760);assert.equal(first.collections,40);assert.equal(first.openingDue,80);assert.equal(first.closingDue,1100);
  assert.equal(second.archived,true);assert.equal(second.sales,90);
  assert.equal(store.customers(true).find(p=>p.id===a.id).due,1600,'current balance includes October unpaid bill');
});
test('empty periods and collection-only customers retain correct opening and closing balances',t=>{
  const {store,a}=fixture(t);
  const collection=store.salesReport({period:'daily',date:'2026-09-10'});
  assert.equal(collection.totals.sales,0);assert.equal(collection.totals.received,40);
  assert.equal(collection.customers[0].id,a.id);assert.equal(collection.customers[0].invoiceCount,0);
  assert.equal(collection.customers[0].openingDue,1140);assert.equal(collection.customers[0].closingDue,1100);
  const empty=store.salesReport({period:'monthly',month:'2026-11'});
  assert.equal(empty.totals.sales,0);assert.equal(empty.totals.openingDue,1600);assert.equal(empty.totals.closingDue,1600);
  assert.deepEqual(empty.products,[]);assert.deepEqual(empty.customers,[]);assert.deepEqual(empty.days,[]);
  const september=store.salesReport({period:'custom',from:'2026-09-01',to:'2026-09-30'});
  assert.equal(september.totals.sales,1910);assert.equal(september.range.to,'2026-09-30');
  assert.equal(store.salesReport({period:'daily',date:'2026-09-01'}).totals.sales,1660);
});
