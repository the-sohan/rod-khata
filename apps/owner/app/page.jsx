'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Brand, Empty, Icon, kinds, moment, money, number, unitLabel } from '../../../lib/ui';
import MobileReports from './mobile-reports';
import OwnerConnection from './owner-connection';
import {requestDrive,readNativeResult} from './native-drive.mjs';

export default function OwnerDashboard() {
  const [state,setState] = useState(null);
  const [tab,setTab] = useState('overview');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [checkedAt,setCheckedAt] = useState(null);
  const [isLocal,setIsLocal] = useState(true);
  const [native,setNative]=useState(false),[showConnection,setShowConnection]=useState(false);
  const inFlight=useRef(false),lastAttempt=useRef(0),source=useRef('');
  source.current=state?.source||'';
  function acceptConnection(result){setState(result);setError('');setCheckedAt(result.downloadedAt||new Date().toISOString());lastAttempt.current=Date.now();}
  const load = useCallback(async (interactive=false) => {
    if(inFlight.current)return;
    inFlight.current=true;lastAttempt.current=Date.now();
    if(window.RodShopAndroid) {
      setNative(true);setLoading(true);
      try {await new Promise(resolve=>setTimeout(resolve,30));let result=readNativeResult(window.RodShopAndroid.loadSnapshot());if(result.data)setState(result);
        if(result.source==='drive')result=await requestDrive({interactive});
        if(result.data)setState(result);setError(result.warning||'');setCheckedAt(new Date().toISOString());}
      catch(err){setError(err.message||'হিসাব পড়া যায়নি।');}finally{setLoading(false);inFlight.current=false;}return;
    }
    if (!['127.0.0.1','localhost'].includes(window.location.hostname)) {
      setIsLocal(false);setLoading(false);inFlight.current=false;return;
    }
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:3000/api/owner-snapshot',{cache:'no-store'});
      if (!response.ok) throw new Error('হিসাবের সঙ্গে সংযোগ করা যায়নি।');
      setState(await response.json());setError('');setCheckedAt(new Date().toISOString());
    } catch {setError('PC অ্যাপের সংযোগ পাওয়া যাচ্ছে না। আগে পাওয়া হিসাব থাকলে সেটি দেখানো হচ্ছে।');}
    finally {setLoading(false);inFlight.current=false;}
  },[]);
  useEffect(() => {
    load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible'&&(source.current!=='drive'||Date.now()-lastAttempt.current>=30*60_000)) load();},30_000);
    const resume=()=>{if(document.visibilityState==='visible') load();};
    document.addEventListener('visibilitychange',resume);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[load]);
  const data=state?.data;
  const age=data?Math.max(0,Math.floor((Date.now()-Date.parse(data.generatedAt))/60_000)):0;
  return <div className="owner-page"><div className="owner-container">
    <header className="owner-header"><Brand small/><button className="owner-avatar" aria-label="দোকানের সংযোগ" onClick={()=>setShowConnection(!showConnection)}><Icon name="settings" size={20}/></button></header>
    <div className="preview-banner"><span className="preview-dot"/>{state?.demo?'ডেমো · সব তথ্য পরীক্ষার জন্য':state?.source==='drive'?'মালিকের অ্যাপ · Google Drive':native?'মালিকের অ্যাপ · Wi-Fi / সেভ করা হিসাব':'লোকাল প্রিভিউ'}</div>
    {showConnection&&<OwnerConnection native={native} onData={acceptConnection} onClose={()=>setShowConnection(false)}/>}
    <div className="owner-welcome"><span className="eyebrow">মালিকের ড্যাশবোর্ড</span><h1>{data?.shop.name || 'আপনার দোকানের হিসাব'}</h1><span className="readonly-badge"><Icon name="shield" size={14}/> শুধু দেখার অনুমতি</span></div>
    {!isLocal?<section className="panel setup-message"><Icon name="shield" size={32}/><h2>ব্যক্তিগত সংযোগ এখনও সেটআপ হয়নি</h2><p>এই প্রথম সংস্করণে হিসাব শুধু নিজের কম্পিউটারে preview করা যায়। Google login ও Drive সংযোগের পর বাইরে থেকে হিসাব দেখা যাবে।</p></section>:<>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {!data?<>{loading?<section className="panel setup-message">হিসাব পড়ছি…</section>:!showConnection&&<OwnerConnection native={native} onData={acceptConnection}/>}</>:<>
    <div className={`owner-sync ${age>=35||state.offline?'stale':''}`}><Icon name="clock" size={16}/><div><strong>হিসাবের সময়: {moment(data.generatedAt)}</strong><span>{state.offline?'সেভ করা হিসাব · নতুন ডাউনলোড হয়নি':age>=35?'পুরোনো তথ্য · PC থেকে নতুন আপলোড বাকি':state.source==='drive'?'Google Drive থেকে পাওয়া সর্বশেষ হিসাব':'PC থেকে পাওয়া সর্বশেষ হিসাব'}</span>{state.downloadedAt&&<span>ডাউনলোড: {moment(state.downloadedAt)}</span>}</div><button onClick={()=>load(true)} disabled={loading} aria-label="এখন আপডেট"><Icon name="sync" size={18}/><span>{loading?'আপডেট হচ্ছে…':'এখন আপডেট'}</span></button></div>
    <nav className="owner-tabs" aria-label="হিসাবের বিভাগ">{[['overview','আজকের হিসাব'],['reports','রিপোর্ট'],['stock','স্টক'],['dues','পাওনা–দেনা'],['entries','লেনদেন']].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?'selected':''}>{label}</button>)}</nav>
    {tab==='reports'&&<MobileReports data={data}/>}
    {tab==='overview'&&<><section className="owner-hero"><div><span>আজকের মোট বিক্রি</span><span className="hero-icon"><Icon name="receipt" size={24}/></span></div><strong>{money(data.totals.sales)}</strong><p>{number(data.totals.saleCount)}টি বিক্রির এন্ট্রি <span>·</span> {new Intl.DateTimeFormat('bn-BD',{timeZone:'Asia/Dhaka',day:'numeric',month:'long'}).format(new Date(data.generatedAt))}</p><div className="hero-bottom"><span><Icon name="check" size={16}/> জমা ও বাকি মিলিয়ে মোট বিক্রি</span></div></section>
    <div className="owner-metrics"><section className="panel"><span className="metric-icon"><Icon name="wallet"/></span><small>আজকের টাকা আদায়</small><strong>{money(data.totals.received)}</strong><p>বিক্রির জমা + বাকি আদায়</p></section><section className="panel"><span className="metric-icon orange"><Icon name="down"/></span><small>আজকের দোকান খরচ</small><strong>{money(data.totals.expenses)}</strong><p>সাপ্লায়ার পরিশোধ বাদে</p></section></div>
    <section className="panel owner-dues"><div className="owner-section-head"><h2>পাওনা ও দেনা</h2><button className="text-button" onClick={()=>setTab('dues')}>বিস্তারিত <Icon name="arrow" size={14}/></button></div><div className="due-row"><span className="metric-icon"><Icon name="users"/></span><div><span>ক্রেতার কাছে পাওনা</span><small>{number(data.customers.length)} জনের বাকি</small></div><strong>{money(data.totals.customerDue)}</strong></div><div className="due-row"><span className="metric-icon orange"><Icon name="box"/></span><div><span>সাপ্লায়ারকে দেনা</span><small>{number(data.suppliers.length)} জনকে পরিশোধ বাকি</small></div><strong>{money(data.totals.supplierDue)}</strong></div></section>
    <section className="panel owner-recent"><div className="owner-section-head"><h2>সাম্প্রতিক লেনদেন</h2><button className="text-button" onClick={()=>setTab('entries')}>সব দেখুন</button></div><EntryList entries={data.recent.slice(0,4)}/></section></>}
    {tab==='stock'&&<section className="panel owner-recent"><div className="owner-section-head"><h2>বর্তমান স্টক</h2><span className="count">{number(data.products.length)} পণ্য</span></div>{data.products.length?<div className="mobile-list">{data.products.map(product=><div key={product.id}><span className="metric-icon"><Icon name="box"/></span><div><strong>{product.name}</strong><small>দর {money(product.rate)} / {unitLabel(product.unit)}</small></div><b>{number(product.quantity??product.quantityKg)}<small>{unitLabel(product.unit)}</small></b></div>)}</div>:<Empty icon="box">এখনও পণ্য যোগ হয়নি।</Empty>}</section>}
    {tab==='dues'&&<><BalanceList title="ক্রেতার কাছে পাওনা" entries={data.customers}/><BalanceList title="সাপ্লায়ারকে দেনা" entries={data.suppliers}/></>}
    {tab==='entries'&&<section className="panel owner-recent"><div className="owner-section-head"><h2>সর্বশেষ ২০টি লেনদেন</h2></div><EntryList entries={data.recent}/></section>}
    <div className="owner-bottom-note"><Icon name="shield" size={16}/><span>এখান থেকে কোনো হিসাব পরিবর্তন করা যায় না।</span></div>
    <footer className="owner-footer"><span>আপডেট পরীক্ষা: {moment(checkedAt)}</span><span>{state.source==='drive'?'অ্যাপ খোলা থাকলে ৩০ মিনিট পরপর Drive পরীক্ষা হবে':'লোকাল snapshot: ৩০ মিনিট পরপর'}</span></footer>
    </>}
    </>}
  </div></div>;
}
function EntryList({entries}) {
  if(!entries.length) return <Empty>এখনও কোনো লেনদেন নেই।</Empty>;
  return <div className="mobile-list">{entries.map(row=><div key={row.id}><span className={`metric-icon ${['expense','purchase','supplier_payment'].includes(row.kind)?'orange':''}`}><Icon name={row.kind==='sale'?'receipt':'wallet'}/></span><div><strong>{row.party || row.note || kinds[row.kind]}</strong><small>{kinds[row.kind]} · {row.number}</small>{row.items?.map((item,index)=><small key={index}>{item.name} · {number(item.quantity)} {unitLabel(item.unit)}</small>)}<small>{moment(row.createdAt)}</small></div><b>{money(row.amount)}{row.due>0&&<small>বাকি {money(row.due)}</small>}</b></div>)}</div>;
}
function BalanceList({title,entries}) {
  return <section className="panel owner-recent"><div className="owner-section-head"><h2>{title}</h2></div>{entries.length?<div className="mobile-list">{entries.map(row=><div key={row.name}><span className="avatar">{row.name.slice(0,1)}</span><strong>{row.name}</strong><b>{money(row.due)}</b></div>)}</div>:<Empty icon="users">কোনো বাকি নেই।</Empty>}</section>;
}
