import {useEffect,useState} from 'react';
import {Icon} from '../../../../lib/ui';

export default function MobileConnection() {
  const [config,setConfig]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
  useEffect(()=>{fetch('/api/mobile-config',{cache:'no-store'}).then(response=>response.json()).then(value=>setConfig(value.mobile)).catch(()=>setError('সংযোগের অবস্থা পাওয়া যায়নি।'));},[]);
  async function toggle() {
    setBusy(true);setError('');setCopied(false);
    try {const response=await fetch('/api/mobile-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!config.enabled})});const result=await response.json();if(!response.ok)throw new Error(result.error);setConfig(result.mobile);}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  function downloadCode() {
    const blob=new Blob([config.connections[0].code],{type:'text/plain'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='rod-shop-connection.rodshop';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel settings-card mobile-connection"><span className="soft-icon"><Icon name="phone" size={28}/></span><h2>Android অ্যাপ ও মোবাইল সংযোগ</h2><p>নিচের Google Drive সংযোগ দিয়ে বাইরে থেকেও হিসাব দেখুন। একই Wi-Fi-তে পরীক্ষার জন্য নিচের আলাদা সংযোগ চালু করতে পারেন।</p><div className="form-actions"><a className="button" href="/downloads/rod-khata-owner.apk" download><Icon name="down"/>Android APK ডাউনলোড</a><a className="button secondary" href="/api/owner-export" download>মোবাইলের হিসাবের ফাইল নিন</a></div>{config&&<><button className="button secondary" disabled={busy} onClick={toggle}>{busy?'অপেক্ষা করুন…':config.enabled?'Wi-Fi সংযোগ বন্ধ করুন':'মোবাইলের Wi-Fi সংযোগ চালু করুন'}</button>{config.enabled&&<div className="mobile-pairing"><strong>সংযোগ চালু · শুধু হিসাব দেখার অনুমতি</strong>{config.connections.length?<><p>ফোনে APK ইনস্টল করে “PC-র সঙ্গে যুক্ত করুন” খুলুন। নিচের কোড দিন অথবা সংযোগ ফাইল বেছে নিন।</p>{config.connections.map(row=><div key={row.url}><p>একই Wi-Fi-তে ফোনের Chrome-এ APK নিন: <a href={`${row.url}/download/owner.apk`}>{row.url}/download/owner.apk</a></p></div>)}<label>দোকানের সংযোগ কোড<textarea readOnly value={config.connections[0].code} rows={3}/></label><div className="form-actions"><button className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(config.connections[0].code);setCopied(true);}catch{setError('কোডটি বেছে কপি করুন।');}}}>{copied?'কপি হয়েছে':'কোড কপি করুন'}</button><button className="button secondary" onClick={downloadCode}>সংযোগ ফাইল ডাউনলোড</button></div></>:<p>এই PC-তে Wi-Fi/LAN-এর ঠিকানা পাওয়া যায়নি। নেটওয়ার্কে যুক্ত হয়ে আবার এই পেজ খুলুন।</p>}<small>সংযোগ বন্ধ করে আবার চালু করলে নতুন কোড হবে। বাইরে থেকে দেখতে নিচের Google Drive সংযোগ ব্যবহার করুন।</small></div>}</>}{error&&<p className="field-error" role="alert">{error}</p>}</section>;
}
