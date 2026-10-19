export const number = value => new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 3 }).format(value || 0);
export const money = value => `৳ ${new Intl.NumberFormat('bn-BD', {maximumFractionDigits:2}).format(value || 0)}`;
export const unitLabel = unit => unit === 'pcs' ? 'পিস' : 'কেজি';
export const moment = value => value ? new Intl.DateTimeFormat('bn-BD', {
  timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
}).format(new Date(value)) : 'এখনও হয়নি';
export const kinds = {
  sale: 'বিক্রি', collection: 'বাকি আদায়', purchase: 'মাল কেনা', supplier_payment: 'দেনা পরিশোধ', expense: 'খরচ',
};
const paths = {
  report: 'M4 3h16v18H4z M8 16v-4 M12 16V8 M16 16v-6',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  print: 'M6 9V3h12v6 M6 18H3V9h18v9h-3 M6 14h12v8H6z M17 12h1',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  plus: 'M12 5v14 M5 12h14',
  box: 'M21 8l-9 5-9-5 M12 13v9 M3 7l9-5 9 5v10l-9 5-9-5z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  sync: 'M20 7h-6 M20 7V1 M4 17h6 M4 17v6 M20 7a9 9 0 0 0-15-2 M4 17a9 9 0 0 0 15 2',
  arrow: 'M7 17L17 7 M7 7h10v10',
  down: 'M12 3v12 M7 10l5 5 5-5 M5 17v4h14v-4',
  check: 'M20 6L9 17l-5-5',
  clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M10 18h4',
  shield: 'M12 2l8 3v6c0 5-8 11-8 11S4 16 4 11V5z M8 11l3 3 5-5',
  wallet: 'M21 8H5a2 2 0 0 1 0-4h14v4 M3 6v13a2 2 0 0 0 2 2h16V8 M21 12h-5v5h5',
  receipt: 'M5 3l3 2 4-2 4 2 3-2v19l-3-2-4 2-4-2-3 2z M9 9h6 M9 13h6',
  external: 'M14 3h7v7 M21 3l-9 9 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
};
export function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.grid}/></svg>;
}
export function Brand({ small = false }) {
  return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-mark">র</span><div><strong>রডখাতা<span className="brand-dot">.</span></strong><small>দোকানের হিসাব, সহজে</small></div></div>;
}
export function Empty({ children = 'এখনও কোনো এন্ট্রি নেই।', icon = 'receipt' }) {
  return <div className="empty"><span><Icon name={icon} size={28}/></span><p>{children}</p></div>;
}
