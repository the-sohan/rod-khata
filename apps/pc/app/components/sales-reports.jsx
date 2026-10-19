import { useEffect,useState } from 'react';
import { Empty,Icon,money,number,unitLabel } from '../../../../lib/ui';

const periods=[['daily','দৈনিক'],['weekly','সাপ্তাহিক'],['monthly','মাসিক'],['yearly','বার্ষিক'],['custom','নিজের তারিখ']];
const dateLabel=value=>new Intl.DateTimeFormat('bn-BD',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
const normalize=value=>String(value).toLowerCase().replace(/[০-৯]/g,digit=>'০১২৩৪৫৬৭৮৯'.indexOf(digit));
function queryFor(form) {
  const {period}=form;
  return period==='custom'?{period,from:form.from,to:form.to}:period==='monthly'?{period,month:form.month}:period==='yearly'?{period,year:form.year}:{period,date:form.date};
}
export default function SalesReports({today}) {
  const [form,setForm]=useState(()=>({period:'daily',date:today,month:today.slice(0,7),year:today.slice(0,4),from:`${today.slice(0,7)}-01`,to:today}));
  const [applied,setApplied]=useState(()=>({period:'daily',date:today})),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [detail,setDetail]=useState('products'),[search,setSearch]=useState(''),[sort,setSort]=useState('sales-desc');
  const field=(key,value)=>setForm(current=>({...current,[key]:value}));
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    fetch(`/api/reports?${new URLSearchParams(applied)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok) throw new Error(result.error);return result.report;})
      .then(setReport).catch(err=>{if(err.name!=='AbortError') setError(err.message||'রিপোর্ট পড়া যায়নি।');})
      .finally(()=>{if(!controller.signal.aborted) setLoading(false);});
    return()=>controller.abort();
  },[applied]);
  const changed=JSON.stringify(queryFor(form))!==JSON.stringify(applied);
  const rows=(detail==='customers'?report?.customers:report?.products)||[];
  const filtered=rows.filter(row=>normalize(`${row.name} ${row.mobile||''}`).includes(normalize(search))).sort((a,b)=>{
    if(sort==='name') return a.name.localeCompare(b.name,'bn');
    return sort==='sales-asc'?a.sales-b.sales:b.sales-a.sales;
  });
  const total=report?.totals;
  return <div className="report-page"><section className="panel report-filters"><div className="panel-head"><div><h2>রিপোর্টের সময়সীমা</h2><p>বাংলাদেশের তারিখ অনুযায়ী; শুরুর ও শেষের দিন দুটিই অন্তর্ভুক্ত।</p></div><Icon name="report"/></div>
    <form onSubmit={event=>{event.preventDefault();setApplied(queryFor(form));}}><div className="report-periods" aria-label="রিপোর্টের ধরন">{periods.map(([key,label])=><button type="button" key={key} aria-pressed={form.period===key} className={form.period===key?'selected':''} onClick={()=>field('period',key)}>{label}</button>)}</div>
      <div className="report-date-fields">{['daily','weekly'].includes(form.period)&&<label>{form.period==='weekly'?'এই তারিখের সপ্তাহ':'রিপোর্টের তারিখ'}<input type="date" required min="1000-01-01" max="9999-12-31" value={form.date} onChange={event=>field('date',event.target.value)}/></label>}
      {form.period==='monthly'&&<label>রিপোর্টের মাস<input type="month" required min="1000-01" max="9999-12" value={form.month} onChange={event=>field('month',event.target.value)}/></label>}
      {form.period==='yearly'&&<label>রিপোর্টের বছর<input type="number" required min="1000" max="9999" step="1" value={form.year} onChange={event=>field('year',event.target.value)}/></label>}
      {form.period==='custom'&&<><label>শুরুর তারিখ<input type="date" required min="1000-01-01" max="9999-12-31" value={form.from} onChange={event=>field('from',event.target.value)}/></label><label>শেষের তারিখ<input type="date" required min={form.from||'1000-01-01'} max="9999-12-31" value={form.to} onChange={event=>field('to',event.target.value)}/></label></>}
      <button className="button" disabled={loading}><Icon name="report" size={17}/>{loading?'হিসাব পড়ছি…':'রিপোর্ট দেখুন'}</button><span className="report-filter-note">{form.period==='weekly'?'সপ্তাহ: শনিবার–শুক্রবার':changed?'নির্বাচন বদলেছে। রিপোর্ট দেখুন চাপুন।':'সময় বেছে রিপোর্ট দেখুন চাপুন।'}</span></div>
    </form></section>
    {error&&<div className="notice error" role="alert"><Icon name="clock"/>{error}</div>}
    {loading?<section className="panel report-loading" role="status">নির্বাচিত সময়ের সব এন্ট্রি থেকে রিপোর্ট তৈরি হচ্ছে…</section>:!error&&report&&<>
      <div className="report-range"><div><span className="eyebrow">দেখানো সময়সীমা · {periods.find(row=>row[0]===report.range.period)?.[1]}</span><h2>{dateLabel(report.range.from)}{report.range.from!==report.range.to&&<> — {dateLabel(report.range.to)}</>}</h2></div><span className="report-count">{number(total.invoiceCount)}টি বিক্রির বিল · {number(total.customerCount)} জন ক্রেতা</span></div>
      <div className="stats-grid report-stats">{[['মোট বিক্রি',total.sales,'বিলের সব পণ্যের বিক্রয়মূল্য','receipt'],['মোট টাকা আদায়',total.received,'বিক্রির জমা + আলাদা বাকি আদায়','wallet'],['বিক্রির সময়ের বাকি',total.newDue,'নির্বাচিত বিলের মোট − বিলের জমা','users'],['শেষের তারিখে মোট পাওনা',total.closingDue,'আগের পাওনা + নতুন বাকি − বাকি আদায়','clock']].map(([title,value,hint,icon])=><section className="stat-card" key={title}><div className="stat-top"><span>{title}</span><span className="stat-icon"><Icon name={icon}/></span></div><strong>{money(value)}</strong><small>{hint}</small></section>)}</div>
      <section className="panel report-money"><div className="report-money-section"><h3>জমা ও পাওনার হিসাব</h3><dl><div><dt>সময়সীমার আগের পাওনা</dt><dd>{money(total.openingDue)}</dd></div><div><dt>এই সময়ের বিক্রির জমা</dt><dd>{money(total.salePaid)}</dd></div><div><dt>এই সময়ে আলাদা বাকি আদায়</dt><dd>{money(total.collections)}</dd></div></dl></div><div className="report-money-section"><h3>কেনা, পরিশোধ ও খরচ</h3><dl><div><dt>মাল কেনার মোট</dt><dd>{money(total.purchases)}</dd></div><div><dt>মাল কেনার সময় পরিশোধ</dt><dd>{money(total.purchasePaid)}</dd></div><div><dt>আলাদা দেনা পরিশোধ</dt><dd>{money(total.supplierPayments)}</dd></div><div><dt>দোকানের খরচ</dt><dd>{money(total.expenses)}</dd></div></dl></div></section>
      <section className="panel report-details"><div className="report-detail-tabs" aria-label="রিপোর্টের বিস্তারিত">{[['products','পণ্যভিত্তিক বিক্রি'],['customers','ক্রেতাভিত্তিক বিক্রি'],['days','দিনভিত্তিক হিসাব']].map(([key,label])=><button key={key} aria-pressed={detail===key} className={detail===key?'selected':''} onClick={()=>{setDetail(key);setSearch('');}}>{label}</button>)}</div>
        {detail!=='days'&&<div className="report-table-tools"><label>{detail==='customers'?'ক্রেতা খুঁজুন':'পণ্য খুঁজুন'}<input type="search" maxLength={160} value={search} placeholder={detail==='customers'?'নাম বা মোবাইল লিখুন':'পণ্যের নাম লিখুন'} onChange={event=>setSearch(event.target.value)}/></label><label>সাজানোর ক্রম<select value={sort} onChange={event=>setSort(event.target.value)}><option value="sales-desc">বিক্রি: বেশি থেকে কম</option><option value="sales-asc">বিক্রি: কম থেকে বেশি</option><option value="name">নাম অনুযায়ী</option></select></label><span>{number(filtered.length)}টি ফলাফল</span></div>}
        {detail==='products'&&(filtered.length?<div className="table-scroll"><table aria-label="পণ্যভিত্তিক বিক্রি"><thead><tr><th>পণ্য</th><th className="numeric">বিল সংখ্যা</th><th className="numeric">বিক্রির পরিমাণ</th><th className="numeric">গড় বিক্রির দর / একক</th><th className="numeric">মোট বিক্রি</th></tr></thead><tbody>{filtered.map(row=><tr key={`${row.id}-${row.unit}`}><td><strong>{row.name}</strong><small>{unitLabel(row.unit)}</small></td><td className="numeric">{number(row.invoiceCount)}</td><td className="numeric">{number(row.quantity)} {unitLabel(row.unit)}</td><td className="numeric">{money(row.averageRate)}</td><td className="numeric"><strong>{money(row.sales)}</strong></td></tr>)}</tbody></table></div>:<Empty>এই সময়সীমা বা খোঁজে পণ্যের বিক্রি পাওয়া যায়নি।</Empty>)}
        {detail==='customers'&&(filtered.length?<div className="table-scroll"><table aria-label="ক্রেতাভিত্তিক বিক্রি"><thead><tr><th>ক্রেতা</th><th className="numeric">বিল</th><th className="numeric">মোট বিক্রি</th><th className="numeric">বিক্রির জমা</th><th className="numeric">বিক্রির সময়ের বাকি</th><th className="numeric">আলাদা বাকি আদায়</th><th className="numeric">শেষের তারিখে পাওনা</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.mobile||'মোবাইল দেওয়া হয়নি'}{row.archived?' · মুছে রাখা ক্রেতা':''}</small></td><td className="numeric">{number(row.invoiceCount)}</td><td className="numeric"><strong>{money(row.sales)}</strong></td><td className="numeric">{money(row.salePaid)}</td><td className="numeric">{money(row.newDue)}</td><td className="numeric">{money(row.collections)}</td><td className="numeric">{money(row.closingDue)}</td></tr>)}</tbody></table></div>:<Empty icon="users">এই সময়সীমা বা খোঁজে ক্রেতার লেনদেন পাওয়া যায়নি।</Empty>)}
        {detail==='days'&&(report.days.length?<div className="table-scroll"><table aria-label="দিনভিত্তিক হিসাব"><thead><tr><th>তারিখ</th><th className="numeric">বিক্রির বিল</th><th className="numeric">মোট বিক্রি</th><th className="numeric">টাকা আদায়</th><th className="numeric">খরচ</th></tr></thead><tbody>{report.days.map(row=><tr key={row.day}><td>{dateLabel(row.day)}</td><td className="numeric">{number(row.invoiceCount)}</td><td className="numeric">{money(row.sales)}</td><td className="numeric">{money(row.received)}</td><td className="numeric">{money(row.expenses)}</td></tr>)}</tbody></table></div>:<Empty>এই সময়সীমায় কোনো লেনদেন নেই।</Empty>)}
        <div className="list-footer">{detail==='products'?'কেজি ও পিস আলাদা এককে দেখানো হয়েছে। একই বিল একাধিক পণ্যের সারিতে আসতে পারে।':detail==='customers'?'শেষের তারিখের পাওনায় আগের সময়ের বকেয়াও অন্তর্ভুক্ত। আলাদা বাকি আদায় নির্বাচিত বিলের সঙ্গে ভাগ করে সমন্বয় করা হয়নি।':'যেসব দিনে লেনদেন আছে, সেই দিনগুলো দেখানো হচ্ছে।'}</div>
      </section>
      <div className="report-explanation"><Icon name="shield" size={18}/><p>রিপোর্টে সব সেভ করা এন্ট্রি গণনা হয়। বিক্রির সময়ের বাকি হলো বিল সেভের সময়ের বাকি; পরের আদায় আলাদা হিসাবে দেখানো হয়। লাভের রিপোর্ট যোগ করতে পণ্যের ক্রয়মূল্য ও বিক্রি হওয়া মালের খরচ নির্ধারণের ব্যবস্থা লাগবে।</p></div>
    </>}
  </div>;
}
