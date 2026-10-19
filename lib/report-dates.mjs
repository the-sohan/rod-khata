const iso=date=>date.toISOString().slice(0,10);
function calendar(value,label) {
  const key=String(value??'');
  if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(key)) throw new RangeError(`${label} সঠিক তারিখ দিন।`);
  const date=new Date(`${key}T00:00:00Z`);
  if(Number.isNaN(date.getTime())||iso(date)!==key) throw new RangeError(`${label} সঠিক তারিখ দিন।`);
  return date;
}
export function reportRange(input={},today) {
  calendar(today,'আজকের');
  const period=input.period||'daily';let from,to;
  if(period==='daily'||period==='weekly') {
    const date=calendar(input.date||today,'নির্বাচিত');
    if(period==='daily') from=to=iso(date);
    else {
      // Bangladesh calendar week: Saturday through Friday, without host timezone conversion.
      date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+1)%7);from=iso(date);
      date.setUTCDate(date.getUTCDate()+6);to=iso(date);
    }
  } else if(period==='monthly') {
    const month=String(input.month||today.slice(0,7));
    if(!/^[1-9]\d{3}-\d{2}$/.test(month)) throw new RangeError('মাস সঠিকভাবে বেছে নিন।');
    const date=calendar(`${month}-01`,'মাসের');from=iso(date);
    date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);to=iso(date);
  } else if(period==='yearly') {
    const year=String(input.year||today.slice(0,4));
    if(!/^[1-9]\d{3}$/.test(year)) throw new RangeError('চার অঙ্কের বছর দিন।');
    from=`${year}-01-01`;to=`${year}-12-31`;
  } else if(period==='custom') {
    from=iso(calendar(input.from,'শুরুর'));to=iso(calendar(input.to,'শেষের'));
  } else throw new RangeError('রিপোর্টের সময়সীমা সঠিক নয়।');
  if(from>to) throw new RangeError('শেষের তারিখ শুরুর তারিখের আগে হতে পারে না।');
  return {period,from,to,timeZone:'Asia/Dhaka',weekStartsOn:'Saturday'};
}
