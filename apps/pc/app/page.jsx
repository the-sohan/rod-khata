'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Brand,Empty,Icon,kinds,moment,money,number,unitLabel } from '../../../lib/ui';
import EntryForm,{newEntry} from './components/entry-form';
import CustomerManager from './components/customer-manager';
import ShopSettings from './components/shop-settings';
import CustomerHistory from './components/customer-history';
import SalesReports from './components/sales-reports';
import MobileConnection from './components/mobile-connection';
import GoogleDriveSettings from './components/google-drive-settings';

const navigation=[['overview','grid','হিসাবের সারাংশ'],['entry','plus','নতুন এন্ট্রি'],['stock','box','পণ্য ও স্টক'],['dues','users','পাওনা ও দেনা'],['customers','users','ক্রেতার তালিকা'],['reports','report','রিপোর্ট'],['settings','settings','দোকানের সেটিংস'],['setup','sync','ব্যাকআপ ও আপডেট']];
const blankProduct=()=>({name:'',unit:'kg',openingQuantity:'0',rate:''});
async function api(action,payload) {
  const response=await fetch(`/api/${action}`,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{cache:'no-store'});
  const result=await response.json();if(!response.ok) throw new Error(result.error||'কাজটি সম্পন্ন হয়নি।');return result;
}
function PrintLink({id,label='প্রিন্ট'}) {
  return <a className="print-link" href={`/receipt/${id}`} target="_blank" rel="noreferrer"><Icon name="print" size={16}/>{label}</a>;
}
function Ledger({entries}) {
  if(!entries.length) return <Empty>প্রথম এন্ট্রি দিলে এখানে হিসাব দেখা যাবে।</Empty>;
  return <div className="table-scroll"><table><thead><tr><th>রসিদ / সময়</th><th>ধরন</th><th>নাম ও বিবরণ</th><th className="numeric">মোট টাকা</th><th className="numeric">জমা / পরিশোধ</th><th className="numeric">বাকি</th><th>রসিদ</th></tr></thead><tbody>{entries.map(row=><tr key={row.id}><td><strong className="receipt-no">{row.number}</strong><small>{moment(row.createdAt)}</small></td><td><span className={`tag ${row.kind}`}>{kinds[row.kind]}</span></td><td><strong>{row.party||row.note||'দোকানের খরচ'}</strong>{row.items?.length?row.items.map((item,index)=><small key={index}>{item.name} · {number(item.quantity)} {unitLabel(item.unit)}</small>):<small>{row.note}</small>}</td><td className="numeric">{money(row.amount)}</td><td className="numeric">{money(row.paid)}</td><td className="numeric">{row.due?money(row.due):'—'}</td><td><PrintLink id={row.id}/></td></tr>)}</tbody></table></div>;
}
function PartyList({title,entries}) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2><span className="count">{number(entries.length)} জন</span></div>{entries.length?<div className="party-list">{entries.map(row=><div key={row.id}><span className="avatar">{row.name.slice(0,1)}</span><strong>{row.name}</strong><b>{money(row.due)}</b></div>)}</div>:<Empty icon="users">কোনো বাকি নেই।</Empty>}</section>;
}
export default function Page() {
  const [tab,setTab]=useState('overview'),[state,setState]=useState(null),[form,setForm]=useState(()=>newEntry());
  const [product,setProduct]=useState(blankProduct),[showProduct,setShowProduct]=useState(false);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[lastReceipt,setLastReceipt]=useState(null);
  const [customerEdit,setCustomerEdit]=useState(undefined),[returnToEntry,setReturnToEntry]=useState(false);
  const [historyId,setHistoryId]=useState(null);
  const requestKey=useRef(null);
  const refresh=useCallback(async()=>{try {setState(await api('dashboard'));} catch(error) {setNotice({error:true,text:error.message});}},[]);
  useEffect(()=>{refresh();const timer=setInterval(refresh,30_000);return()=>clearInterval(timer);},[refresh]);
  const data=state?.data,status=state?.status,isDemo=!!state?.status?.demo;
  const visibleNavigation=isDemo?navigation.filter(([id])=>id!=='setup'):navigation;
  function changeForm(next) {requestKey.current=null;setForm(next);}
  function navigate(id) {
    if(id==='customers') setHistoryId(null);
    setTab(id);setNotice(null);
  }
  async function perform(action,payload,message) {
    setBusy(true);setNotice(null);
    try {const result=await api(action,payload);await refresh();if(message) setNotice({text:message});return result;}
    catch(error) {setNotice({error:true,text:error.message});return null;}
    finally {setBusy(false);}
  }
  async function submit(event) {
    event.preventDefault();requestKey.current ||= crypto.randomUUID();
    const result=await perform('entry',{...form,requestKey:requestKey.current});
    if(result) {const id=result.result.id;setLastReceipt(id);setNotice({text:`হিসাব সেভ হয়েছে · RK-${String(id).padStart(5,'0')}`,receiptId:id});requestKey.current=null;setForm(newEntry(form.kind));}
  }
  async function addProduct(event) {
    event.preventDefault();
    if(await perform('product',product,'নতুন পণ্য যোগ হয়েছে।')) {setProduct(blankProduct());setShowProduct(false);}
  }
  async function saveCustomer(draft) {
    const result=await perform('customer',draft,'ক্রেতার তথ্য সেভ হয়েছে।');
    if(result) {
      setCustomerEdit(undefined);
      if(returnToEntry) {changeForm({...form,customerId:String(result.customer.id)});setReturnToEntry(false);setTab('entry');}
    }
  }
  async function archiveCustomer(id,restore) {
    const result=await perform('customer-archive',{id,restore},restore?'ক্রেতা পুনরায় সক্রিয় হয়েছে।':'ক্রেতা তালিকা থেকে সরানো হয়েছে। আগের হিসাব অক্ষত আছে।');
    if(result&&String(form.customerId)===String(id)&&!restore) changeForm({...form,customerId:''});
    return !!result;
  }
  const run=action=>perform(action,{},action==='snapshot'?'মোবাইলের লোকাল প্রিভিউ আপডেট হয়েছে। Drive-এ আপলোডের অবস্থা ব্যাকআপ ও আপডেট মেনুতে দেখুন।':'লোকাল ব্যাকআপ তৈরি ও যাচাই হয়েছে।');
  return <div className="pc-shell"><aside className="sidebar"><Brand/><span className="nav-caption">আপনার কর্মক্ষেত্র</span><nav>{visibleNavigation.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>navigate(id)}><Icon name={icon}/>{label}{id==='entry'&&<span className="nav-plus">+</span>}</button>)}</nav><div className="sidebar-note"><Icon name="shield"/><strong>{isDemo?'নমুনা অনলাইন ডেমো':'হিসাব এই PC-তেই থাকে'}</strong><p>{isDemo?'সবাই একই নমুনা হিসাব দেখবেন। আসল তথ্য দেবেন না।':'ইন্টারনেট ছাড়াও লোকাল এন্ট্রি করা যাবে।'}</p></div><div className="sidebar-footer"><span className="live-dot"/> {isDemo?'অনলাইন ডেমো':'লোকাল পরীক্ষার সংস্করণ'} <span>v0.6</span></div></aside>
    <div className="workspace"><header className="topbar"><div><span className="breadcrumb">{isDemo?'নমুনা দোকান':'দোকানের PC'}</span><span className="separator">/</span><strong>{navigation.find(row=>row[0]===tab)?.[2]}</strong></div><div className="topbar-right"><span className="local-badge"><span className="live-dot"/> {isDemo?'ডেমো মোড':'লোকাল মোড'}</span><span className="user-badge">ম</span></div></header><main className="main">
    <div className="page-heading"><div><span className="eyebrow">{data?.shop.name||'আমার রডের দোকান'}</span><h1>{tab==='overview'?'আজকের হিসাব, এক নজরে':navigation.find(row=>row[0]===tab)?.[2]}</h1><p>{tab==='overview'?'বিক্রি, আদায় আর বাকি—সব হিসাব একই জায়গায়।':'পণ্য, ক্রেতা ও রসিদের হিসাব একই জায়গায়।'}</p></div><div className="heading-actions"><a className="button secondary" href={isDemo?'/demo-owner':'http://127.0.0.1:3001'} target="_blank" rel="noreferrer"><Icon name="phone"/>মালিকের প্রিভিউ</a><button className="button" onClick={()=>navigate('entry')}><Icon name="plus"/>নতুন এন্ট্রি</button></div></div>
    {isDemo&&<div className="notice demo-notice" role="status"><Icon name="shield"/><span><strong>শুধু দেখানো ও পরীক্ষার জন্য।</strong> সব তথ্য কাল্পনিক এবং সবার জন্য একই। আসল নাম, মোবাইল বা দোকানের তথ্য দেবেন না। Server restart হলে নতুন পরীক্ষার entry মুছে যাবে।</span></div>}
    {notice&&<div className={`notice ${notice.error?'error':'success'}`} role={notice.error?'alert':'status'}><Icon name={notice.error?'clock':'check'}/><span>{notice.text}</span>{notice.receiptId&&<PrintLink id={notice.receiptId} label="রসিদ দেখুন / প্রিন্ট"/>}<button onClick={()=>setNotice(null)} aria-label="বার্তা বন্ধ করুন">×</button></div>}
    {!state?<div className="panel loading">লোকাল ডেটাবেস থেকে হিসাব পড়ছি…</div>:<>
    {tab==='overview'&&<><div className="stats-grid">{[['আজকের বিক্রি',data.totals.sales,'receipt',`${number(data.totals.saleCount)}টি বিক্রির বিল`],['আজকের টাকা আদায়',data.totals.received,'wallet','বিক্রির জমা ও পুরোনো বাকি আদায়'],['ক্রেতার কাছে পাওনা',data.totals.customerDue,'users',`${number(data.customers.length)} জনের বাকি আছে`],['সাপ্লায়ারকে দেনা',data.totals.supplierDue,'box',`${number(data.suppliers.length)} জনকে পরিশোধ বাকি`]].map(([label,value,icon,caption],index)=><section className={`stat-card stat-${index}`} key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon}/></span></div><strong>{money(value)}</strong><small>{caption}</small></section>)}</div><div className="overview-columns"><section className="panel"><div className="panel-head"><div><h2>সাম্প্রতিক লেনদেন</h2><p>সর্বশেষ ২০টি এন্ট্রি; পুরোনো রসিদও প্রিন্ট করুন</p></div><button className="text-button" onClick={()=>setTab('entry')}>এন্ট্রি দিন <Icon name="arrow" size={16}/></button></div><Ledger entries={data.recent}/></section><section className="panel sync-card">{isDemo?<><span className="soft-icon"><Icon name="phone" size={26}/></span><h2>মালিকের মোবাইল ডেমো</h2><p>এই নমুনা দোকানের হিসাব ফোনের উপযোগী dashboard-এ দেখুন। এখানে দেওয়া পরীক্ষার entry-ও দেখাবে।</p><a className="button secondary full" href="/demo-owner" target="_blank" rel="noreferrer">মোবাইল dashboard খুলুন</a><small>ব্যক্তিগত Google Drive ও backup সংযোগ এই ডেমোতে বন্ধ।</small></>:<><span className="soft-icon"><Icon name="phone" size={26}/></span><h2>মালিকের মোবাইল হিসাব</h2><p>প্রতি ৩০ মিনিটে দেখার জন্য লোকাল snapshot তৈরি হবে।</p><dl><div><dt>শেষ লোকাল আপডেট</dt><dd>{moment(status.snapshotAt)}</dd></div><div><dt>Google Drive</dt><dd className={status.driveConnected?"":"pending"}>{status.driveConnected?"সংযুক্ত":"সংযোগ বাকি"}</dd></div></dl><button className="button secondary full" disabled={busy} onClick={()=>run('snapshot')}><Icon name="sync"/>প্রিভিউ এখন আপডেট করুন</button><small>এখন শুধু এই কম্পিউটারে প্রিভিউ দেখা যায়।</small></>}</section></div><div className="bottom-strip"><span><Icon name="shield" size={17}/> SQLite ডেটাবেসে সেভ হচ্ছে</span><span>আজকের খরচ <strong>{money(data.totals.expenses)}</strong></span><span>সাপ্লায়ারকে পরিশোধ <strong>{money(data.totals.supplierPaid)}</strong></span></div></>}
    {tab==='entry'&&<div className="entry-layout"><EntryForm data={data} form={form} onChange={changeForm} onSubmit={submit} busy={busy} onAddCustomer={()=>{setHistoryId(null);setCustomerEdit(null);setReturnToEntry(true);setTab('customers');}}/><aside className="entry-help"><span className="soft-icon"><Icon name="shield" size={26}/></span><h2>এক বিলে সব পণ্য</h2><p>রড কেজিতে, সিমেন্ট বা অন্য পণ্য পিসে—একই বিলে যোগ করুন। জমা ও বাকি পুরো বিলের জন্য একবার হিসাব হবে।</p><p>সব পণ্যের স্টক ও বিল একসঙ্গে সেভ হবে। কোনো পণ্যের স্টক কম থাকলে পুরো বিল সেভ হবে না।</p>{lastReceipt&&<div className="last-receipt"><strong>সর্বশেষ সেভ করা রসিদ</strong><PrintLink id={lastReceipt} label={`RK-${String(lastReceipt).padStart(5,'0')} · প্রিন্ট`}/></div>}<div className="help-note"><strong>পরীক্ষার সংস্করণ</strong><p>ছাড়, ফেরত ও পুরোনো পাওনা যোগ করার সুবিধা এখনও বাকি।</p></div></aside></div>}
    {tab==='stock'&&<><section className="panel"><div className="panel-head"><div><h2>পণ্যের তালিকা</h2><p>প্রতিটি পণ্যের নিজস্ব একক: কেজি বা পিস</p></div><button className="button secondary" onClick={()=>setShowProduct(!showProduct)}><Icon name="plus"/>পণ্য যোগ করুন</button></div>{showProduct&&<form className="product-form mixed-product-form" onSubmit={addProduct}><label>ব্র্যান্ড ও সাইজসহ নাম<input required maxLength={160} value={product.name} onChange={e=>setProduct({...product,name:e.target.value})} placeholder="যেমন: BSRM রড ১৬ মিমি বা সিমেন্ট"/></label><label>পণ্যের একক<select value={product.unit} onChange={e=>setProduct({...product,unit:e.target.value,openingQuantity:'0'})}><option value="kg">কেজি (KG)</option><option value="pcs">পিস (Pcs)</option></select></label><label>শুরুর স্টক ({unitLabel(product.unit)})<input required type="number" min="0" step={product.unit==='pcs'?'1':'0.001'} value={product.openingQuantity} onChange={e=>setProduct({...product,openingQuantity:e.target.value})}/></label><label>বিক্রির দর / {unitLabel(product.unit)}<input required type="number" min="0.01" step="0.01" value={product.rate} onChange={e=>setProduct({...product,rate:e.target.value})}/></label><button className="button" disabled={busy}>পণ্য সেভ করুন</button></form>}{data.products.length?<div className="table-scroll"><table><thead><tr><th>পণ্য</th><th>একক</th><th className="numeric">অবশিষ্ট স্টক</th><th className="numeric">বিক্রির দর / একক</th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td><span className="tag">{unitLabel(p.unit)}</span></td><td className="numeric"><span className={p.quantity===0?'zero-stock':''}>{number(p.quantity)} {unitLabel(p.unit)}</span></td><td className="numeric">{money(p.rate)} / {unitLabel(p.unit)}</td></tr>)}</tbody></table></div>:<Empty icon="box">পণ্য যোগ করে শুরু করুন।</Empty>}</section><p className="footnote">শুরুর স্টক শুধু মজুত নির্ধারণ করে; এতে আগের সাপ্লায়ারের দেনা বা ক্রয়মূল্য যোগ হয় না।</p></>}
    {tab==='customers'&&(historyId?<CustomerHistory key={historyId} id={historyId} onClose={()=>setHistoryId(null)}/>:<CustomerManager records={data.customerRecords} edit={customerEdit} onEdit={value=>{setCustomerEdit(value);if(value===undefined) setReturnToEntry(false);}} onSave={saveCustomer} onArchive={archiveCustomer} onHistory={setHistoryId} busy={busy}/>)}
    {tab==='settings'&&<ShopSettings shop={data.shop} busy={busy} onSave={draft=>perform('shop-settings',draft,'দোকানের তথ্য সেভ হয়েছে। এখন রসিদে এই তথ্য দেখাবে।')}/>}
    {tab==='reports'&&<SalesReports today={data.day}/>}
    {tab==='setup'&&<MobileConnection/>}
    {tab==='dues'&&<div className="two-columns"><PartyList title="ক্রেতার কাছে পাওনা" entries={data.customers}/><PartyList title="সাপ্লায়ারকে দেনা" entries={data.suppliers}/></div>}
    {tab==='setup'&&<div className="two-columns"><section className="panel settings-card"><span className="soft-icon"><Icon name="sync" size={28}/></span><h2>মোবাইলের হিসাব</h2><p>৩০ মিনিট পরপর লোকাল snapshot তৈরি হচ্ছে, যতক্ষণ অ্যাপের background worker চলছে।</p><dl><div><dt>সর্বশেষ snapshot</dt><dd>{moment(status.snapshotAt)}</dd></div><div><dt>Google Drive-এ আপলোড</dt><dd className={status.driveConnected?"":"pending"}>{status.cloudUploadedAt?moment(status.cloudUploadedAt):status.driveConnected?"প্রথম আপলোড বাকি":"এখনও সেটআপ হয়নি"}</dd></div></dl><button className="button secondary" disabled={busy} onClick={()=>run('snapshot')}>প্রিভিউ এখন আপডেট করুন</button></section><section className="panel settings-card"><span className="soft-icon"><Icon name="shield" size={28}/></span><h2>ডেটাবেসের ব্যাকআপ</h2><p>প্রতি ঘণ্টায় যাচাই করা লোকাল SQLite ব্যাকআপ রাখা হচ্ছে। এই ধাপে স্বয়ংক্রিয়ভাবে পুরোনো ব্যাকআপ মুছবে না।</p><dl><div><dt>সর্বশেষ লোকাল ব্যাকআপ</dt><dd>{moment(status.backupAt)}</dd></div><div><dt>কোথায় রাখা হচ্ছে</dt><dd>data/backups</dd></div></dl><button className="button secondary" disabled={busy} onClick={()=>run('backup')}><Icon name="down"/>এখনই ব্যাকআপ নিন</button></section><div className="span-two"><GoogleDriveSettings/></div></div>}
    </>}
    <footer className="page-footer"><span>রডখাতা · {isDemo?'নমুনা ডেমো':'লোকাল শুরু'}</span><span>দোকানের সময়: বাংলাদেশ</span></footer></main></div>
  </div>;
}
