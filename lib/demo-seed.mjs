import fs from 'node:fs';
import path from 'node:path';
import {openStore,dayKey} from './store.mjs';

// Synthetic records only; never copies a local shop database or owner snapshot.
export function seedDemo(dataDir, now = new Date()) {
  if (fs.existsSync(path.join(dataDir,'shop.sqlite'))) throw new Error('Demo seeding requires an empty directory.');
  const store = openStore(dataDir);
  try {
    store.saveShop({name:'রডখাতা ডেমো ট্রেডার্স',address:'নমুনা বাজার, বাংলাদেশ · সব তথ্য কাল্পনিক',mobile:'',logo:''});
    const names=['রহিম উদ্দিন','করিম মিয়া','আব্দুল্লাহ আল মামুন','সুমন আহমেদ','রফিকুল ইসলাম','জাহিদ হাসান','মাহমুদুল হাসান','আল আমিন','সাইফুল ইসলাম','ইমরান হোসেন','শাহাদাত হোসেন','মিজানুর রহমান','আরিফুল ইসলাম','কামাল হোসেন','জামাল উদ্দিন','মোস্তফা কামাল','আবুল কালাম','আনিসুর রহমান','সোহেল রানা','রুবেল হোসেন','তানভীর আহমেদ','মাসুদ রানা','নাসির উদ্দিন','বেলাল হোসেন','তৌহিদুল ইসলাম','নাজমুল হাসান','ফারুক আহমেদ','শফিকুল ইসলাম','হাবিবুর রহমান','ইউসুফ আলী'];
    const areas=['নমুনা বাজার','ডেমো সদর','পরীক্ষা পাড়া','নমুনা সড়ক','ডেমো নগর'];
    const customers=names.map((name,index)=>store.saveCustomer({name,address:`${areas[index%areas.length]} · কাল্পনিক ঠিকানা`,mobile:''}));
    for(const product of [
      {name:'BSRM রড ১২ মিমি',unit:'kg',rate:'88',openingQuantity:'100000'},
      {name:'BSRM রড ১৬ মিমি',unit:'kg',rate:'90',openingQuantity:'100000'},
      {name:'AKS রড ১০ মিমি',unit:'kg',rate:'85',openingQuantity:'100000'},
      {name:'Crown Cement',unit:'pcs',rate:'500',openingQuantity:'10000'},
      {name:'Shah Cement',unit:'pcs',rate:'520',openingQuantity:'10000'},
    ]) store.addProduct(product);
    const products=store.products(),today=dayKey(now),[year,month,day]=today.split('-').map(Number);
    let counter=0;
    const dateEntry=(id,date)=>store.db.prepare('UPDATE entries SET local_day=?,created_at=? WHERE id=?').run(date,`${date}T05:30:00.000Z`,id);
    for(let offset=2;offset>=0;offset--) {
      const anchor=new Date(Date.UTC(year,month-1-offset,1)),y=anchor.getUTCFullYear(),m=anchor.getUTCMonth()+1;
      const days=offset===0?day:new Date(Date.UTC(y,m,0)).getUTCDate();
      for(let i=0;i<45;i++) {
        const product=products[(i+offset)%products.length],quantity=product.unit==='pcs'?5+i%16:100+(i%10)*25;
        const items=[{productId:product.id,quantity:String(quantity),rate:String(product.rate)}];
        if(i%5===0) {const extra=products.find(p=>p.id!==product.id&&p.unit!==product.unit);items.push({productId:extra.id,quantity:extra.unit==='pcs'?'3':'50',rate:String(extra.rate)});}
        const amount=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.rate),0);
        const paid=i%3===0?amount:Math.floor(amount*(i%3===1?0.7:0.4));
        const result=store.addEntry({requestKey:`demo-sale-${String(++counter).padStart(6,'0')}`,kind:'sale',customerId:customers[(i+offset*7)%customers.length].id,items,paid:String(paid),note:'শুধু নমুনা বিক্রি'});
        // Include the current day so the first dashboard is meaningful.
        const d=i===44?days:1+Math.floor(i*days/45);
        dateEntry(result.id,`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
      }
    }
    store.addEntry({requestKey:'demo-purchase-0001',kind:'purchase',party:'নমুনা সাপ্লায়ার',items:[{productId:products[0].id,quantity:'1000',rate:String(products[0].rate-5)}],paid:'30000',note:'নমুনা মাল কেনা'});
    store.addEntry({requestKey:'demo-expense-00001',kind:'expense',amount:'800',note:'নমুনা পরিবহন খরচ'});
    const owed=store.customers().find(customer=>customer.due>=1000);
    if(owed) store.addEntry({requestKey:'demo-collection-001',kind:'collection',customerId:owed.id,amount:'1000',note:'নমুনা বাকি আদায়'});
    store.snapshot(now);
    return {customers:customers.length,invoices:counter};
  } finally {store.close();}
}
