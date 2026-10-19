import { useEffect,useRef,useState } from 'react';
import { Icon } from '../../../../lib/ui';

const normalize=value=>String(value).toLocaleLowerCase().replace(/[০-৯]/g,digit=>'০১২৩৪৫৬৭৮৯'.indexOf(digit));
const label=row=>row?`${row.name}${row.mobile?` · ${row.mobile}`:''}`:'';
export default function CustomerPicker({records,value,onChange}) {
  const selected=records.find(row=>row.id===Number(value)),selectedLabel=label(selected);
  const [query,setQuery]=useState(selectedLabel),[open,setOpen]=useState(false),[active,setActive]=useState(0);
  const root=useRef(null),input=useRef(null);
  const search=selected&&query===selectedLabel?'':normalize(query);
  const filtered=records.filter(row=>normalize(`${row.name} ${row.mobile} ${row.address}`).includes(search));
  useEffect(()=>{setQuery(selectedLabel);input.current?.setCustomValidity('');},[selectedLabel]);
  useEffect(()=>{
    function outside(event) {if(!root.current?.contains(event.target)) {setOpen(false);setQuery(selectedLabel);input.current?.setCustomValidity('');}}
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[selectedLabel]);
  useEffect(()=>{if(open) document.getElementById(`customer-option-${filtered[active]?.id}`)?.scrollIntoView({block:'nearest'});},[active,open]);
  function choose(row) {onChange(String(row.id));setQuery(label(row));setOpen(false);input.current.setCustomValidity('');input.current.focus();}
  return <div ref={root} className="customer-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)) {setOpen(false);setQuery(selectedLabel);input.current?.setCustomValidity('');}}}>
    <div className="picker-input"><input ref={input} id="entry-customer" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="customer-options" aria-activedescendant={open&&filtered[active]?`customer-option-${filtered[active].id}`:undefined} required autoComplete="off" value={query} placeholder="নাম, মোবাইল বা ঠিকানা লিখে খুঁজুন" onFocus={()=>{setOpen(true);setActive(0);}} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true);event.target.setCustomValidity('তালিকা থেকে একজন ক্রেতা বেছে নিন।');}} onKeyDown={event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp') {event.preventDefault();setOpen(true);if(selected&&query===selectedLabel) setQuery('');setActive(index=>Math.max(0,Math.min(filtered.length-1,index+(event.key==='ArrowDown'?1:-1))));}
      if(event.key==='Enter'&&open) {event.preventDefault();if(filtered[active]) choose(filtered[active]);}
      if(event.key==='Escape') {setOpen(false);setQuery(selectedLabel);input.current.setCustomValidity('');}
    }}/><button type="button" aria-label="ক্রেতার তালিকা খুলুন" aria-expanded={open} onClick={()=>{if(open) {setOpen(false);setQuery(selectedLabel);input.current.setCustomValidity('');} else {input.current.focus();setQuery('');setActive(0);setOpen(true);}}}><Icon name="down" size={17}/></button></div>
    {open&&<div className="picker-popover"><div className="picker-hint">নাম বা মোবাইল লিখুন, তারপর ক্রেতা বেছে নিন</div><div id="customer-options" role="listbox" aria-label="ক্রেতার ফলাফল">{filtered.length?filtered.map((row,index)=><button id={`customer-option-${row.id}`} key={row.id} type="button" role="option" aria-selected={row.id===Number(value)} className={index===active?'highlighted':''} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(row)}><strong>{row.name}</strong><small>{[row.mobile,row.address].filter(Boolean).join(' · ')||'যোগাযোগের তথ্য নেই'}</small></button>):<div className="picker-empty">কোনো ক্রেতা পাওয়া যায়নি। “নতুন ক্রেতা” থেকে যোগ করুন।</div>}</div></div>}
  </div>;
}
