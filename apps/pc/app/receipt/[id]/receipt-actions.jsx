'use client';
import { Icon } from '../../../../../lib/ui';
export default function ReceiptActions() {
  return <div className="receipt-actions"><a className="button secondary" href="/">PC অ্যাপে ফিরুন</a><button className="button" onClick={()=>window.print()}><Icon name="print"/>রসিদ প্রিন্ট করুন</button><span>প্রিন্টারে ছাপাতে বা PDF হিসেবে রাখতে পারবেন।</span></div>;
}
