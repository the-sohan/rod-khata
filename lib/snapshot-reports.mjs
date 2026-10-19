import {reportRange} from './report-dates.mjs';

// Snapshot report values stay in poisha and thousandths until presentation.
export function snapshotReport(data,input={}) {
  const source=data?.reportData;
  if(source?.version!==1) throw new Error('এই হিসাবের ফাইলে রিপোর্ট নেই। PC থেকে নতুন আপডেট নিন।');
  const range=reportRange(input,data.day),{from,to}=range;
  const sums={sales:0,salePaid:0,collections:0,purchases:0,purchasePaid:0,supplierPayments:0,expenses:0,openingDue:0,invoiceCount:0};
  const customerMap=new Map(),productMap=new Map(),days=new Map(),salesIds=new Set(),buyers=new Set();
  const customers=new Map(source.customers.map(row=>[row.id,row])),products=new Map(source.products.map(row=>[row.id,row]));
  for(const e of source.entries) {
    if(e.day>to) continue;
    const inside=e.day>=from,customerKind=['sale','collection'].includes(e.kind);
    if(customerKind) {
      const change=e.kind==='sale'?e.amountPoisha-e.paidPoisha:-e.amountPoisha;
      if(!inside) sums.openingDue+=change;
      let row=customerMap.get(e.partyId);
      if(!row) {row={...customers.get(e.partyId),invoiceCount:0,sales:0,salePaid:0,collections:0,openingDue:0,closingDue:0,activity:false};customerMap.set(e.partyId,row);}
      row.closingDue+=change;
      if(!inside) row.openingDue+=change;
      else {
        row.activity=true;
        if(e.kind==='sale') {row.sales+=e.amountPoisha;row.salePaid+=e.paidPoisha;row.invoiceCount++;}
        else row.collections+=e.amountPoisha;
      }
    }
    if(!inside) continue;
    let day=days.get(e.day);if(!day){day={day:e.day,invoiceCount:0,sales:0,received:0,expenses:0};days.set(e.day,day);}
    if(e.kind==='sale') {sums.sales+=e.amountPoisha;sums.salePaid+=e.paidPoisha;sums.invoiceCount++;buyers.add(e.partyId);salesIds.add(e.id);day.sales+=e.amountPoisha;day.received+=e.paidPoisha;day.invoiceCount++;}
    if(e.kind==='collection') {sums.collections+=e.amountPoisha;day.received+=e.paidPoisha;}
    if(e.kind==='purchase') {sums.purchases+=e.amountPoisha;sums.purchasePaid+=e.paidPoisha;}
    if(e.kind==='supplier_payment') sums.supplierPayments+=e.amountPoisha;
    if(e.kind==='expense') {sums.expenses+=e.amountPoisha;day.expenses+=e.amountPoisha;}
  }
  for(const item of source.items) {
    if(!salesIds.has(item.entryId)) continue;
    const key=`${item.productId}-${item.unit}`;let row=productMap.get(key);
    if(!row) {row={id:item.productId,name:products.get(item.productId)?.name||'পণ্য',unit:item.unit,quantity:0,sales:0,bills:new Set()};productMap.set(key,row);}
    row.quantity+=item.quantityScaled;row.sales+=item.amountPoisha;row.bills.add(item.entryId);
  }
  const totals={...Object.fromEntries(['sales','salePaid','collections','purchases','purchasePaid','supplierPayments','expenses','openingDue'].map(key=>[key,sums[key]/100])),
    invoiceCount:sums.invoiceCount,customerCount:buyers.size,received:(sums.salePaid+sums.collections)/100,
    newDue:(sums.sales-sums.salePaid)/100,closingDue:(sums.openingDue+sums.sales-sums.salePaid-sums.collections)/100,
    cashOut:(sums.purchasePaid+sums.supplierPayments+sums.expenses)/100,
    cashMovement:(sums.salePaid+sums.collections-sums.purchasePaid-sums.supplierPayments-sums.expenses)/100};
  return {range,generatedAt:data.generatedAt,totals,
    products:[...productMap.values()].map(({bills,...row})=>({...row,quantity:row.quantity/1000,sales:row.sales/100,averageRate:row.sales*10/row.quantity,invoiceCount:bills.size})).sort((a,b)=>b.sales-a.sales||a.name.localeCompare(b.name)),
    customers:[...customerMap.values()].filter(row=>row.activity).map(({activity,...row})=>({...row,
      ...Object.fromEntries(['sales','salePaid','collections','openingDue','closingDue'].map(key=>[key,row[key]/100])),newDue:(row.sales-row.salePaid)/100,received:(row.salePaid+row.collections)/100,
    })).sort((a,b)=>b.sales-a.sales||a.name.localeCompare(b.name)),
    days:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(row=>({...row,sales:row.sales/100,received:row.received/100,expenses:row.expenses/100}))};
}
export function validateOwnerSnapshot(data) {
  if(!data||typeof data.shop?.name!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.day)||!Number.isFinite(Date.parse(data.generatedAt))||data.readonly!==true||!data.totals||!['products','recent','customers','suppliers','customerRecords'].every(key=>Array.isArray(data[key]))) throw new Error('এটি রডখাতার হিসাবের ফাইল নয়।');
  if(!['sales','received','expenses','supplierPaid','saleCount','customerDue','supplierDue'].every(key=>Number.isFinite(data.totals[key])&&data.totals[key]>=0)) throw new Error('ফাইলের মোট হিসাব সঠিক নয়।');
  const source=data.reportData;
  if(source?.version!==1||!['entries','items','customers','products'].every(key=>Array.isArray(source[key]))) throw new Error('PC থেকে রিপোর্টসহ নতুন হিসাবের ফাইল নিন।');
  const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
  for(const row of [...source.customers,...source.products])if(!integer(row.id,1)||typeof row.name!=='string'||!row.name.trim())throw new Error('ফাইলের পণ্য বা ক্রেতার পরিচয় সঠিক নয়।');
  const customers=new Set(source.customers.map(row=>row.id)),products=new Set(source.products.map(row=>row.id)),entries=new Set(source.entries.map(row=>row.id));
  for(const row of source.entries)if(['sale','collection'].includes(row.kind)&&!customers.has(row.partyId))throw new Error('ফাইলে ক্রেতার পরিচয় পাওয়া যায়নি।');
  for(const row of source.entries) if(!integer(row.id,1)||!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!['sale','collection','purchase','supplier_payment','expense'].includes(row.kind)||!integer(row.amountPoisha,1)||!integer(row.paidPoisha)||row.paidPoisha>row.amountPoisha) throw new Error('ফাইলের লেনদেন সঠিক নয়।');
  for(const row of source.items) if(!entries.has(row.entryId)||!products.has(row.productId)||!['kg','pcs'].includes(row.unit)||!integer(row.quantityScaled,1)||!integer(row.amountPoisha,1)||(row.unit==='pcs'&&row.quantityScaled%1000!==0)) throw new Error('ফাইলের পণ্যের হিসাব সঠিক নয়।');
  return data;
}
