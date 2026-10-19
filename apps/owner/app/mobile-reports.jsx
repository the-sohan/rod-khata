import {useMemo,useRef,useState} from 'react';
import {snapshotReport} from '../../../lib/snapshot-reports.mjs';
import {Empty,Icon,money,number,unitLabel} from '../../../lib/ui';

const periods=[['daily','দিন'],['weekly','সপ্তাহ'],['monthly','মাস'],['yearly','বছর'],['custom','নিজের তারিখ']];
const months=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const dateText=value=>new Intl.DateTimeFormat('bn-BD',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T00:00:00Z`));
const normalized=value=>String(value).toLowerCase().replace(/[০-৯]/g,digit=>'০১২৩৪৫৬৭৮৯'.indexOf(digit));
export default function MobileReports({data}) {
  const [selection,setSelection]=useState(()=>({period:'daily',date:data.day,month:data.day.slice(0,7),year:data.day.slice(0,4),from:`${data.day.slice(0,7)}-01`,to:data.day}));
  const [draft,setDraft]=useState(selection),[error,setError]=useState(''),[view,setView]=useState('products'),[search,setSearch]=useState(''),[sort,setSort]=useState('desc');
  const sheet=useRef(null);
  const computed=useMemo(()=>{try{return {report:snapshotReport(data,selection)};}catch(err){return {error:err.message};}},[data,selection]);
  const report=computed.report;
  const years=[...new Set([...Array.from({length:22},(_,index)=>Number(data.day.slice(0,4))+1-index),...(data.reportData?.entries||[]).map(row=>Number(row.day.slice(0,4)))])].sort((a,b)=>b-a);
  function openFilters(){setDraft({...selection});setError('');sheet.current.showModal();}
  function field(key,value){setDraft(current=>({...current,[key]:value}));}
  function apply(event){event.preventDefault();try{snapshotReport(data,draft);setSelection({...draft});sheet.current.close();setError('');}catch(err){setError(err.message);}}
  const rows=(view==='products'?report?.products:report?.customers)||[];
  const filtered=rows.filter(row=>normalized(`${row.name} ${row.mobile||''}`).includes(normalized(search))).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'bn'):sort==='asc'?a.sales-b.sales:b.sales-a.sales);
  const total=report?.totals;
  return <section className="mobile-reports" aria-label="মোবাইল রিপোর্ট"><div className="mobile-report-title"><div><span className="eyebrow">ব্যবসার রিপোর্ট</span><h2>{periods.find(row=>row[0]===selection.period)?.[1]} অনুযায়ী হিসাব</h2></div><button className="button" onClick={openFilters}><Icon name="settings" size={17}/>ফিল্টার</button></div>
    {computed.error?<div className="notice error" role="alert">{computed.error}</div>:<>
      <div className="mobile-range"><Icon name="clock" size={16}/><span>{dateText(report.range.from)}{report.range.from!==report.range.to&&<> – {dateText(report.range.to)}</>}</span></div>
      <div className="mobile-report-hero"><span>মোট বিক্রি</span><strong>{money(total.sales)}</strong><small>{number(total.invoiceCount)}টি বিল · {number(total.customerCount)} জন ক্রেতা</small></div>
      <div className="mobile-report-metrics">{[['টাকা আদায়',total.received],['বিক্রির সময়ের বাকি',total.newDue],['শেষের তারিখে পাওনা',total.closingDue],['দোকানের খরচ',total.expenses]].map(([title,value])=><div className="panel" key={title}><span>{title}</span><strong>{money(value)}</strong></div>)}</div>
      <details className="panel mobile-money-details"><summary>জমা, পাওনা ও খরচের বিস্তারিত</summary><dl>{[['আগের পাওনা',total.openingDue],['বিক্রির জমা',total.salePaid],['আলাদা বাকি আদায়',total.collections],['মাল কেনার মোট',total.purchases],['কেনার সময় পরিশোধ',total.purchasePaid],['আলাদা দেনা পরিশোধ',total.supplierPayments]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl></details>
      <div className="mobile-report-sections" aria-label="রিপোর্টের বিস্তারিত">{[['products','পণ্য'],['customers','ক্রেতা'],['days','দিনভিত্তিক']].map(([key,label])=><button key={key} aria-pressed={view===key} className={view===key?'selected':''} onClick={()=>{setView(key);setSearch('');}}>{label}</button>)}</div>
      {view!=='days'&&<div className="mobile-report-tools"><input type="search" aria-label={view==='products'?'রিপোর্টে পণ্য খুঁজুন':'রিপোর্টে ক্রেতা খুঁজুন'} placeholder={view==='products'?'পণ্যের নাম দিয়ে খুঁজুন':'নাম বা মোবাইল দিয়ে খুঁজুন'} value={search} maxLength={160} onChange={e=>setSearch(e.target.value)}/><select aria-label="রিপোর্ট সাজানোর ক্রম" value={sort} onChange={e=>setSort(e.target.value)}><option value="desc">বিক্রি: বেশি আগে</option><option value="asc">বিক্রি: কম আগে</option><option value="name">নাম অনুযায়ী</option></select></div>}
      {view!=='days'&&(filtered.length?<div className="mobile-report-cards">{filtered.map(row=><article className="panel mobile-report-card" key={`${row.id}-${row.unit||'customer'}`}><div className="mobile-report-row"><div><h3>{row.name}</h3><small>{view==='products'?`${number(row.quantity)} ${unitLabel(row.unit)} · ${number(row.invoiceCount)}টি বিল`:`${number(row.invoiceCount)}টি বিল${row.archived?' · মুছে রাখা ক্রেতা':''}`}</small></div><strong>{money(row.sales)}</strong></div><details><summary>বিস্তারিত দেখুন</summary><dl>{(view==='products'?[['গড় দর / '+unitLabel(row.unit),row.averageRate]]:[['বিক্রির জমা',row.salePaid],['বিক্রির সময়ের বাকি',row.newDue],['আলাদা বাকি আদায়',row.collections],['শেষের তারিখে পাওনা',row.closingDue]]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl></details></article>)}</div>:<Empty>এই সময়ে বা এই খোঁজে বিক্রি পাওয়া যায়নি।</Empty>)}
      {view==='days'&&(report.days.length?<div className="mobile-report-cards">{report.days.map(row=><article className="panel mobile-report-card" key={row.day}><div className="mobile-report-row"><div><h3>{dateText(row.day)}</h3><small>{number(row.invoiceCount)}টি বিক্রির বিল</small></div><strong>{money(row.sales)}</strong></div><dl><div><dt>টাকা আদায়</dt><dd>{money(row.received)}</dd></div><div><dt>খরচ</dt><dd>{money(row.expenses)}</dd></div></dl></article>)}</div>:<Empty>এই সময়ে কোনো লেনদেন নেই।</Empty>)}
      <p className="mobile-report-help">সর্বশেষ পাওয়া হিসাব থেকে এই রিপোর্ট তৈরি। বিক্রির সময়ের বাকি ও পরের আদায় আলাদা। শেষের তারিখের পাওনায় আগের সময়ের বকেয়াও আছে।</p>
    </>}
    <dialog className="mobile-filter-sheet" ref={sheet} onClick={event=>{if(event.target===event.currentTarget)sheet.current.close();}}><form onSubmit={apply}><div className="sheet-handle"/><div className="sheet-heading"><h2>রিপোর্টের ফিল্টার</h2><button type="button" aria-label="ফিল্টার বন্ধ করুন" onClick={()=>sheet.current.close()}>×</button></div><p>সময়সীমা বেছে রিপোর্ট দেখুন।</p><div className="mobile-periods">{periods.map(([key,label])=><button type="button" key={key} aria-pressed={draft.period===key} className={draft.period===key?'selected':''} onClick={()=>field('period',key)}>{label}</button>)}</div>
      {['daily','weekly'].includes(draft.period)&&<label>{draft.period==='weekly'?'এই তারিখের সপ্তাহ':'রিপোর্টের তারিখ'}<input required type="date" value={draft.date} onChange={e=>field('date',e.target.value)}/></label>}
      {draft.period==='monthly'&&<div className="mobile-month-fields"><label>মাস<select value={draft.month.slice(5,7)} onChange={e=>field('month',`${draft.month.slice(0,4)}-${e.target.value}`)}>{months.map((label,index)=><option key={label} value={String(index+1).padStart(2,'0')}>{label}</option>)}</select></label><label>বছর<select value={draft.month.slice(0,4)} onChange={e=>field('month',`${e.target.value}-${draft.month.slice(-2)}`)}>{years.map(year=><option key={year} value={String(year)}>{number(year)}</option>)}</select></label></div>}
      {draft.period==='yearly'&&<label>বছর<input required type="number" min="1000" max="9999" value={draft.year} onChange={e=>field('year',e.target.value)}/></label>}
      {draft.period==='custom'&&<><label>শুরুর তারিখ<input required type="date" value={draft.from} onChange={e=>field('from',e.target.value)}/></label><label>শেষের তারিখ<input required type="date" min={draft.from} value={draft.to} onChange={e=>field('to',e.target.value)}/></label></>}
      {draft.period==='weekly'&&<p className="field-help">সপ্তাহ: শনিবার থেকে শুক্রবার।</p>}{error&&<p className="field-error" role="alert">{error}</p>}<div className="sheet-footer"><button className="button full" type="submit">রিপোর্ট দেখুন</button></div>
    </form></dialog>
  </section>;
}
