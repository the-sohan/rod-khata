import { notFound } from 'next/navigation';
import { openStore } from '../../../../../lib/store.mjs';
import { kinds,money,number,unitLabel } from '../../../../../lib/ui';
import ReceiptActions from './receipt-actions';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata={title:'রসিদ · রডখাতা'};
export default async function Receipt({params}) {
  const {id}=await params;
  if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1) notFound();
  const store=openStore();let receipt;
  try {receipt=store.receipt(id);} finally {store.close();}
  if(!receipt) notFound();
  const isTrade=['sale','purchase'].includes(receipt.kind);
  const rows=receipt.items.length?receipt.items:[{name:receipt.note||kinds[receipt.kind],quantity:null,rate:null,amount:receipt.amount}];
  const title={sale:'বিক্রির রসিদ',purchase:'ক্রয়ের রসিদ',collection:'টাকা আদায়ের রসিদ',supplier_payment:'দেনা পরিশোধের রসিদ',expense:'খরচের ভাউচার'}[receipt.kind];
  const timestamp=new Intl.DateTimeFormat('bn-BD',{timeZone:'Asia/Dhaka',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(receipt.createdAt));
  return <main className="receipt-page"><ReceiptActions/><article className="receipt-sheet">
    <header className="receipt-heading"><div className="receipt-brand">{receipt.shop.logo&&<img className="receipt-logo" src={receipt.shop.logo} alt="দোকানের লোগো"/>}<div><h1>{receipt.shop.name}</h1>{receipt.shop.address&&<p>{receipt.shop.address}</p>}{receipt.shop.mobile&&<p>মোবাইল: {receipt.shop.mobile}</p>}</div></div><span className="memo-label">{title}</span><div className="receipt-meta"><strong>রসিদ নং: {receipt.number}</strong><span>তারিখ: {timestamp}</span></div></header>
    <section className="receipt-customer"><div><strong>{receipt.kind==='expense'?'খাত':receipt.kind==='purchase'||receipt.kind==='supplier_payment'?'সাপ্লায়ারের নাম':'ক্রেতার নাম'}</strong><span>{receipt.party||receipt.note||'দোকানের খরচ'}</span></div>{receipt.kind!=='expense'&&<><div><strong>ঠিকানা</strong><span>{receipt.address||'—'}</span></div><div><strong>মোবাইল</strong><span>{receipt.mobile||'—'}</span></div></>}</section>
    <table className="receipt-table"><thead><tr><th>নং</th><th>পণ্যের বিবরণ / খাত</th><th className="numeric">পরিমাণ</th><th className="numeric">দর</th><th className="numeric">টাকা</th></tr></thead><tbody>{rows.map((item,index)=><tr key={index}><td>{number(index+1)}</td><td>{item.name}</td><td className="numeric">{item.quantity===null?'—':`${number(item.quantity)} ${unitLabel(item.unit)}`}</td><td className="numeric">{item.rate===null?'—':money(item.rate)}</td><td className="numeric">{money(item.amount)}</td></tr>)}{Array.from({length:Math.max(0,10-rows.length)},(_,index)=><tr className="receipt-blank" key={`blank-${index}`} aria-hidden="true"><td>&nbsp;</td><td/><td/><td/><td/></tr>)}</tbody></table>
    <div className="receipt-summary"><div><span>সর্বমোট</span><strong>{money(receipt.amount)}</strong></div><div><span>{receipt.kind==='sale'||receipt.kind==='collection'?'জমা / আদায়':'পরিশোধ'}</span><strong>{money(receipt.paid)}</strong></div>{isTrade&&<div className="receipt-due"><span>এই বিলের বাকি</span><strong>{money(receipt.due)}</strong></div>}</div>
    {receipt.note&&isTrade&&<p className="receipt-note"><strong>বিবরণ:</strong> {receipt.note}</p>}
    <div className="receipt-signatures"><span>গ্রহীতা / ক্রেতার স্বাক্ষর</span><span>বিক্রেতা / আদায়কারীর স্বাক্ষর</span></div><footer className="receipt-footer">ধন্যবাদ। রসিদটি সংরক্ষণ করুন।</footer>
  </article></main>;
}
