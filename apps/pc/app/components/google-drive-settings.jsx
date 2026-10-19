'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Icon,moment} from '../../../../lib/ui';

async function api(action,payload) {
  const response=await fetch(`/api/drive/${action}`,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{cache:'no-store'});
  const result=await response.json();if(!response.ok) throw new Error(result.error||'Drive-এর কাজ সম্পন্ন হয়নি।');return result;
}
export default function GoogleDriveSettings() {
  const [status,setStatus]=useState(null),[email,setEmail]=useState(''),[credentials,setCredentials]=useState(''),[fileName,setFileName]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[confirmDisconnect,setConfirmDisconnect]=useState(false);
  const initialized=useRef(false),upload=useRef(null);
  const refresh=useCallback(async()=>{try{const result=await api('status');setStatus(result.drive);if(!initialized.current){setEmail(result.drive.ownerEmail||'');initialized.current=true;}}catch(error){setNotice({error:true,text:error.message});}},[]);
  useEffect(()=>{refresh();const timer=setInterval(refresh,5000);return()=>clearInterval(timer);},[refresh]);
  async function perform(action,payload,message) {
    setBusy(true);setNotice(null);
    try {const result=await api(action,payload);await refresh();if(message)setNotice({text:message});return result;}
    catch(error){setNotice({error:true,text:error.message});return null;}finally{setBusy(false);}
  }
  async function configure(event) {
    event.preventDefault();
    if(await perform('configure',{ownerEmail:email,...(credentials?{credentials}:{})},'Google OAuth সেটআপ সেভ হয়েছে। এখন Google Drive সংযুক্ত করুন।')) {
      setCredentials('');setFileName('');if(upload.current)upload.current.value='';
    }
  }
  return <section className="panel settings-card" aria-label="Google Drive সংযোগ"><span className="soft-icon"><Icon name="sync" size={28}/></span><h2>Google Drive সংযোগ</h2><p>হিসাব বদলালে ৩০ সেকেন্ডের মধ্যে আপলোডের চেষ্টা হবে; পরিবর্তন না হলেও প্রতি ৩০ মিনিটে রিপোর্ট এবং প্রতি ঘণ্টায় ডেটাবেস ব্যাকআপ পাঠানো হবে। অ্যাপ ও ইন্টারনেট চালু থাকতে হবে। Drive for desktop লাগবে না।</p>
    {notice&&<div className={`notice ${notice.error?'error':'success'}`} role={notice.error?'alert':'status'} style={{marginTop:16}}>{notice.text}</div>}
    {!status?<p>সংযোগের অবস্থা পড়ছি…</p>:<>
      <dl><div><dt>অবস্থা</dt><dd>{status.connected?'Google Drive সংযুক্ত':status.configured?'Google-এ লগইন বাকি':'Google OAuth সেটআপ বাকি'}</dd></div><div><dt>মালিকের Google account</dt><dd>{status.ownerEmail||'এখনও দেওয়া হয়নি'}</dd></div><div><dt>শেষ সফল রিপোর্ট আপলোড</dt><dd>{moment(status.snapshotAt)}</dd></div><div><dt>শেষ সফল ব্যাকআপ আপলোড</dt><dd>{moment(status.backupAt)}</dd></div></dl>
      {status.error&&<p role="alert" style={{color:'#ad5e42',marginBottom:14}}>{status.error}</p>}
      {!status.connected&&<form onSubmit={configure} style={{marginTop:16}}><fieldset className="plain-fieldset" disabled={busy}><label>মালিকের Gmail<input type="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} placeholder="মালিকের Google account"/></label><label>Google Cloud-এর Desktop OAuth JSON<input ref={upload} type="file" accept=".json,application/json" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>12_000){setNotice({error:true,text:'Google-এর ছোট OAuth JSON ফাইলটি বেছে নিন।'});event.target.value='';return;}try{const value=await file.text();JSON.parse(value);setCredentials(value);setFileName(file.name);setNotice(null);}catch{setNotice({error:true,text:'OAuth JSON ফাইলটি পড়া যায়নি।'});}}}/></label>{fileName&&<small>{fileName}</small>}<button className="button secondary" disabled={busy||(!status.configured&&!credentials)}>OAuth সেটআপ সেভ করুন</button></fieldset></form>}
      <div className="form-actions" style={{marginTop:18}}>{!status.connected?<button className="button" disabled={busy||!status.configured} onClick={async()=>{const result=await perform('connect',{});if(result){window.location.assign(result.url);}}}><Icon name="external" size={17}/>Google Drive সংযুক্ত করুন</button>:<><button className="button" disabled={busy} onClick={()=>perform('sync',{},'রিপোর্ট ও ডেটাবেসের ব্যাকআপ Drive-এ আপলোড ও যাচাই হয়েছে।')}><Icon name="sync" size={17}/>{busy?'আপলোড হচ্ছে…':'এখন Drive-এ আপলোড করুন'}</button>{status.folderId&&<a className="button secondary" href={`https://drive.google.com/drive/folders/${encodeURIComponent(status.folderId)}`} target="_blank" rel="noreferrer">Drive ফোল্ডার খুলুন</a>}<button type="button" className="text-button delete-link" onClick={()=>setConfirmDisconnect(true)}>সংযোগ বিচ্ছিন্ন করুন</button></>}</div>
      {confirmDisconnect&&<div className="delete-confirm" style={{margin:'18px 0 0'}}><p>Google-এর এই অ্যাপের অনুমতি সরাবেন? Drive-এর আগের ব্যাকআপ থাকবে; মোবাইলের Google সংযোগেও আবার লগইন লাগতে পারে।</p><button className="button danger" disabled={busy} onClick={async()=>{if(await perform('disconnect',{},'Google Drive সংযোগ বিচ্ছিন্ন হয়েছে।'))setConfirmDisconnect(false);}}>হ্যাঁ, বিচ্ছিন্ন করুন</button><button className="button secondary" onClick={()=>setConfirmDisconnect(false)}>বাতিল</button></div>}
      {status.mobileConnection&&<div className="owner-import-options" style={{marginTop:20}}><h3>মোবাইলের Google Drive সংযোগ</h3><p>APK-তে “Google Drive সংযোগ” অংশে এই কোড দিন। একই Google account দিয়ে অনুমতি দিন। কোডে কোনো Google password বা token নেই; Google-এর অনুমতি ছাড়া ফাইল পড়া যাবে না।</p><label>Drive সংযোগ কোড<textarea readOnly rows={3} value={status.mobileConnection}/></label><button className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(status.mobileConnection);setNotice({text:'মোবাইলের Drive কোড কপি হয়েছে।'});}catch{setNotice({error:true,text:'কোডটি সিলেক্ট করে কপি করুন।'});}}}>মোবাইলের কোড কপি করুন</button></div>}
      <details open={!status.configured} style={{marginTop:20,fontSize:13,lineHeight:1.9}}><summary>Google Cloud-এর প্রথম সেটআপ</summary><ol><li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud-এ project তৈরি করুন</a> — নাম দিন RodKhata।</li><li>APIs &amp; Services → Library থেকে Google Drive API চালু করুন।</li><li>Google Auth Platform → Branding-এ অ্যাপের নাম, support email ও contact email দিন। Audience হবে External।</li><li>পরীক্ষার সময় Audience → Test users-এ মালিকের Gmail যোগ করুন। Data Access-এ https://www.googleapis.com/auth/drive.file যোগ করুন।</li><li>Clients → Create client → Desktop app → JSON ডাউনলোড করে এই ফর্মে দিন।</li><li>একই project-এ Android client তৈরি করুন। Package name: <code>com.rodshop.owner</code>। Certificate SHA-1 ও ধাপে ধাপে নির্দেশনা নিচের ফাইলে আছে।</li></ol><a className="button secondary" href="/downloads/google-drive-setup.txt" download>বাংলা সেটআপ নির্দেশনা ডাউনলোড</a><p>Testing অবস্থায় Drive-এর অনুমতি সাধারণত ৭ দিন পর নবায়ন করতে হয়। নিয়মিত ব্যবহারের আগে Google-এর publishing/verification শর্ত পূরণ করতে হবে। Gmail পাসওয়ার্ড বা refresh token চ্যাটে দেবেন না।</p></details>
      <p className="footnote" style={{marginTop:16}}>প্রথম সফল আপলোডের পর মোবাইলের কোড দেখা যাবে। PC ও Android client একই Cloud project-এর হতে হবে।</p>
    </>}
  </section>;
}
