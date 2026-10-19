import { Icon,kinds,money,number,unitLabel } from '../../../../lib/ui';
import CustomerPicker from './customer-picker';

export const newEntry = (kind='sale') => ({kind,customerId:'',party:'',items:[{key:'first',productId:'',quantity:'',rate:''}],paid:'0',amount:'',note:''});
export default function EntryForm({data,form,onChange,onSubmit,onAddCustomer,busy}) {
  const trade=['sale','purchase'].includes(form.kind),customer=['sale','collection'].includes(form.kind);
  const records=data.customerRecords.filter(row=>!row.archived);
  const selectedCustomer=records.find(row=>row.id===Number(form.customerId));
  const lineTotal=item=>Math.round(Math.round(Number(item.quantity||0)*1000)*Math.round(Number(item.rate||0)*100)/1000)/100;
  const total=trade?form.items.reduce((sum,item)=>sum+Math.round(lineTotal(item)*100),0)/100:Number(form.amount||0);
  const field=(key,value)=>onChange({...form,[key]:value});
  function itemField(index,key,value) {
    const items=form.items.map((item,i)=>i===index?{...item,[key]:value}:item);
    if(key==='productId') {const product=data.products.find(p=>p.id===Number(value));items[index]={...items[index],quantity:'',rate:product?String(product.rate):''};}
    field('items',items);
  }
  return <section className="panel entry-panel"><div className="panel-head"><div><h2>নতুন হিসাব লিখুন</h2><p>একটি বিলে কেজি ও পিসের একাধিক পণ্য দিন।</p></div><Icon name="receipt"/></div>
    <div className="entry-types">{Object.entries(kinds).map(([key,label])=><button disabled={busy} className={form.kind===key?'selected':''} key={key} onClick={()=>onChange(newEntry(key))}>{label}</button>)}</div>
    <form onSubmit={onSubmit} className="form-body"><fieldset disabled={busy} className="plain-fieldset">
      {customer?<div><div className="label-actions"><label htmlFor="entry-customer">ক্রেতা বেছে নিন</label><button type="button" className="text-button" onClick={onAddCustomer}><Icon name="plus" size={15}/>নতুন ক্রেতা</button></div><CustomerPicker key={form.kind} records={records} value={form.customerId} onChange={id=>field('customerId',id)}/>{selectedCustomer&&<div className="contact-summary"><span>{selectedCustomer.address||'ঠিকানা দেওয়া হয়নি'}{selectedCustomer.mobile?` · ${selectedCustomer.mobile}`:''}</span><strong>বর্তমান বাকি: {money(selectedCustomer.due)}</strong></div>}{!records.length&&<p className="field-help">“নতুন ক্রেতা” থেকে নাম, ঠিকানা ও মোবাইল যোগ করুন।</p>}</div>
      :form.kind!=='expense'&&<label>সাপ্লায়ারের নাম<input required maxLength={160} list="supplier-names" value={form.party} onChange={e=>field('party',e.target.value)} placeholder="নাম লিখুন"/><datalist id="supplier-names">{data.suppliers.map(p=><option key={p.id} value={p.name}/>)}</datalist></label>}
      {trade?<><div className="invoice-lines">{form.items.map((item,index)=>{
        const product=data.products.find(p=>p.id===Number(item.productId)),unit=unitLabel(product?.unit);
        return <div className="invoice-line" key={item.key}><div className="line-heading"><strong>পণ্য {number(index+1)}</strong><button type="button" className="remove-line" disabled={form.items.length===1} aria-label={`পণ্য ${number(index+1)} সরান`} onClick={()=>field('items',form.items.filter((_,i)=>i!==index))}>সরান ×</button></div>
          <label>পণ্য<select aria-label={`পণ্য ${index+1}`} required value={item.productId} onChange={e=>itemField(index,'productId',e.target.value)}><option value="">পণ্য বেছে নিন</option>{data.products.map(p=><option value={p.id} key={p.id}>{p.name} · স্টক {number(p.quantity)} {unitLabel(p.unit)}</option>)}</select></label>
          <div className="line-fields"><label>পরিমাণ ({unit})<input aria-label={`পরিমাণ ${index+1}`} required type="number" inputMode="decimal" min={product?.unit==='pcs'?'1':'0.001'} step={product?.unit==='pcs'?'1':'0.001'} value={item.quantity} onChange={e=>itemField(index,'quantity',e.target.value)} placeholder={product?.unit==='pcs'?'যেমন: 10':'যেমন: 100'}/></label><label>প্রতি {unitLabel(product?.unit)} দর (৳)<input aria-label={`দর ${index+1}`} required type="number" inputMode="decimal" min="0.01" step="0.01" value={item.rate} onChange={e=>itemField(index,'rate',e.target.value)}/></label><div className="line-subtotal"><span>টাকা</span><strong>{money(lineTotal(item))}</strong></div></div>
        </div>;
      })}</div><button className="button secondary add-line" type="button" disabled={form.items.length>=50} onClick={()=>field('items',[...form.items,{key:crypto.randomUUID(),productId:'',quantity:'',rate:''}])}><Icon name="plus" size={17}/>আরও পণ্য যোগ করুন</button>{!data.products.length&&<p className="field-help">আগে “পণ্য ও স্টক” থেকে পণ্য যোগ করুন।</p>}<label>{form.kind==='sale'?'জমা টাকা (৳)':'এখন পরিশোধ (৳)'}<input required type="number" inputMode="decimal" min="0" step="0.01" value={form.paid} onChange={e=>field('paid',e.target.value)}/></label></>
      :<label>টাকার পরিমাণ (৳)<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e=>field('amount',e.target.value)}/></label>}
      <label>বিবরণ <span className="optional">(ইচ্ছা হলে)</span><input maxLength={160} value={form.note} onChange={e=>field('note',e.target.value)} placeholder="অতিরিক্ত কোনো তথ্য"/></label>
      <div className="entry-total"><div><span>মোট টাকা</span><strong>{money(total)}</strong></div>{trade&&<div><span>বাকি থাকবে</span><strong>{money(Math.max(0,Math.round((total-Number(form.paid||0))*100)/100))}</strong></div>}</div><button className="button full" type="submit" disabled={busy}>{busy?'সেভ হচ্ছে…':<><Icon name="check"/>নিশ্চিত করে সেভ করুন</>}</button>
    </fieldset></form>
  </section>;
}
