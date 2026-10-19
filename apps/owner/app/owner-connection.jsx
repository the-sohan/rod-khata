import {useRef,useState} from 'react';
import {Icon} from '../../../lib/ui';
import {validateOwnerSnapshot} from '../../../lib/snapshot-reports.mjs';
import {requestDrive,readNativeResult} from './native-drive.mjs';

export default function OwnerConnection({onData,onClose,native}) {
  const [code,setCode]=useState(''),[driveCode,setDriveCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const snapshotFile=useRef(null),connectionFile=useRef(null);
  async function connectGoogle(event) {
    event.preventDefault();setBusy(true);setError('');
    try{const result=await requestDrive({code:driveCode.trim(),interactive:true});if(result.offline)throw new Error(result.warning||'Drive-এর নতুন হিসাব পাওয়া যায়নি।');onData(result);onClose?.();}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  function forgetGoogle() {
    try{const result=readNativeResult(window.RodShopAndroid.forgetDrive());onData(result);setError('এই ফোনের Drive সংযোগ সরানো হয়েছে। শেষ হিসাব ফোনে আছে; PC-র সংযোগ অপরিবর্তিত আছে।');}
    catch(error){setError(error.message);}
  }
  async function connect(value) {
    setBusy(true);setError('');
    try {
      if(!native) throw new Error('Wi-Fi সংযোগ Android অ্যাপ থেকে চালু করুন। এই ব্রাউজারে লোকাল প্রিভিউ চলছে।');
      await new Promise(resolve=>setTimeout(resolve,30));
      const result=JSON.parse(window.RodShopAndroid.connect(value));if(result.error)throw new Error(result.error);
      onData(result);onClose?.();
    }catch(err){setError(err.message);}finally{setBusy(false);}
  }
  async function demo() {
    setBusy(true);setError('');
    try {const data=validateOwnerSnapshot(await (await fetch('/demo-owner.json',{cache:'no-store'})).json());
      if(native){const result=JSON.parse(window.RodShopAndroid.importSnapshot(JSON.stringify(data),'demo'));if(result.error)throw new Error(result.error);}
      onData({data,source:'demo',demo:true});onClose?.();
    }catch(err){setError(err.message||'ডেমো খোলা যায়নি।');}finally{setBusy(false);}
  }
  async function importFile(event,connection=false) {
    const file=event.target.files?.[0];if(!file)return;
    try {
      if(file.size>20_000_000)throw new Error('হিসাবের ফাইল ২০ MB-এর কম হতে হবে।');
      const text=await file.text();
      if(connection){setCode(text.trim());await connect(text.trim());}
      else {
        const data=validateOwnerSnapshot(JSON.parse(text));
        if(native){const result=JSON.parse(window.RodShopAndroid.importSnapshot(JSON.stringify(data),'import'));if(result.error)throw new Error(result.error);}
        onData({data,source:'import',offline:true});onClose?.();
      }
    }catch(err){setError(err.message||'ফাইলটি খোলা যায়নি।');}
    finally{event.target.value='';}
  }
  return <section className="panel owner-connection"><div className="sheet-heading"><h2>দোকানের সংযোগ</h2>{onClose&&<button aria-label="সংযোগ প্যানেল বন্ধ করুন" onClick={onClose}>×</button>}</div>
    <h3>Google Drive সংযোগ</h3><p>PC-তে প্রথম আপলোডের পর পাওয়া Drive কোড দিন। একবার Google-এর অনুমতি দিলে বাইরে থেকেও হিসাব আপডেট হবে।</p>
    <form onSubmit={connectGoogle}><label>মোবাইলের Drive কোড<textarea required rows={3} value={driveCode} onChange={e=>setDriveCode(e.target.value)} placeholder="PC থেকে পাওয়া RD1. কোড পেস্ট করুন"/></label><button className="button full" disabled={busy||!native}>{busy?'Google-এর সংযোগ চলছে…':'Google দিয়ে যুক্ত করুন'}</button></form>
    {native&&window.RodShopAndroid?.forgetDrive&&<button className="text-button" disabled={busy} onClick={forgetGoogle}>এই ফোনের Drive সংযোগ সরান</button>}
    {!native&&<p>Google সংযোগ Android APK থেকে চালু করুন। এখানে PC-র লোকাল প্রিভিউ চলছে।</p>}
    <details className="owner-import-options"><summary>একই Wi-Fi-তে PC-র সঙ্গে যুক্ত করুন</summary><p>PC-তে “ব্যাকআপ ও আপডেট” থেকে মোবাইলের Wi-Fi সংযোগ চালু করুন। দুই ডিভাইস একই Wi-Fi-তে রাখুন।</p><form onSubmit={event=>{event.preventDefault();connect(code);}}><label>দোকানের Wi-Fi কোড<textarea required rows={3} value={code} onChange={e=>setCode(e.target.value)} placeholder="PC থেকে পাওয়া RS1. কোড পেস্ট করুন"/></label><button className="button full" disabled={busy||!native}>এই PC-র হিসাব দেখুন</button></form><input hidden type="file" ref={connectionFile} accept=".rodshop,text/plain" onChange={e=>importFile(e,true)}/><button className="button secondary full" disabled={busy||!native} onClick={()=>connectionFile.current.click()}>সংযোগ ফাইল বেছে নিন</button></details><div className="owner-import-options"><strong>সংযোগ ছাড়াও পরীক্ষা করুন</strong><p>ডেমোতে কেবল বানানো তথ্য আছে। PC থেকে নেওয়া হিসাবের JSON ফাইলও খুলতে পারবেন।</p><button className="button secondary full" disabled={busy} onClick={demo}>তিন মাসের ডেমো দেখুন</button><input hidden type="file" ref={snapshotFile} accept=".json,application/json" onChange={e=>importFile(e)}/><button className="text-button" disabled={busy} onClick={()=>snapshotFile.current.click()}><Icon name="down" size={16}/>হিসাবের ফাইল খুলুন</button></div>{error&&<p className="field-error" role="alert">{error}</p>}</section>;
}
