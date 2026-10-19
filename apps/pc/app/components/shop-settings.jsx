import { useRef,useState } from 'react';
import { Icon } from '../../../../lib/ui';

export default function ShopSettings({shop,onSave,busy}) {
  const [draft,setDraft]=useState(()=>({...shop})),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const upload=useRef(null),uploadId=useRef(0);
  async function chooseLogo(event) {
    const file=event.target.files?.[0],id=++uploadId.current;
    if(!file) return;
    setError('');setLoading(true);
    let url;
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5_000_000) throw new Error('PNG, JPG বা WebP বেছে নিন; মূল ফাইল সর্বোচ্চ ৫ MB।');
      url=URL.createObjectURL(file);
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,512/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const logo=canvas.toDataURL('image/png');
      if(logo.length>660_000) throw new Error('লোগোটি বড় হচ্ছে। ছোট বা সরল ছবি বেছে নিন।');
      if(id===uploadId.current) setDraft(value=>({...value,logo}));
    } catch(err) {if(id===uploadId.current) setError(err.message||'ছবিটি খোলা যায়নি।');}
    finally {if(url) URL.revokeObjectURL(url);if(id===uploadId.current) setLoading(false);event.target.value='';}
  }
  return <div className="shop-settings-layout"><section className="panel"><div className="panel-head"><div><h2>দোকানের তথ্য</h2><p>সেভ করলে নতুন ও পুরোনো রসিদ প্রিন্টে এই তথ্য দেখাবে।</p></div><Icon name="settings"/></div><form className="form-body" onSubmit={e=>{e.preventDefault();setError('');onSave(draft);}}><fieldset disabled={busy||loading} className="plain-fieldset"><label>দোকানের নাম<input required maxLength={160} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>দোকানের ঠিকানা<textarea rows={3} maxLength={500} value={draft.address} onChange={e=>setDraft({...draft,address:e.target.value})}/></label><label>দোকানের মোবাইল নম্বর<input type="tel" maxLength={25} value={draft.mobile} placeholder="01712345678" onChange={e=>setDraft({...draft,mobile:e.target.value})}/></label><div className="logo-editor"><strong>দোকানের লোগো</strong><p>PNG, JPG বা WebP; ছবিটি সর্বোচ্চ ৫১২ পিক্সেলে ছোট করে রাখা হবে।</p><input ref={upload} aria-label="দোকানের লোগো আপলোড" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo}/>{draft.logo&&<button type="button" className="text-button delete-link" onClick={()=>{uploadId.current++;setDraft({...draft,logo:''});if(upload.current) upload.current.value='';}}>লোগো সরান</button>}</div>{error&&<p className="field-error" role="alert">{error}</p>}<button className="button" disabled={busy||loading}>{loading?'লোগো তৈরি হচ্ছে…':busy?'সেভ হচ্ছে…':<><Icon name="check"/>দোকানের তথ্য সেভ করুন</>}</button></fieldset></form></section><aside className="panel shop-preview"><span className="eyebrow">রসিদের উপরের অংশের প্রিভিউ</span><div className="receipt-brand">{draft.logo&&<img className="receipt-logo" src={draft.logo} alt="দোকানের লোগোর প্রিভিউ"/>}<div><h2>{draft.name||'দোকানের নাম'}</h2><p>{draft.address||'দোকানের ঠিকানা'}</p><p>মোবাইল: {draft.mobile||'—'}</p></div></div><div className="preview-memo">ক্যাশ মেমো / রসিদ</div><p className="field-help">লোগো ও তথ্য লোকাল ডেটাবেসের সঙ্গে ব্যাকআপেও থাকবে। পুরোনো রসিদে ক্রেতার সেভের সময়কার তথ্য অপরিবর্তিত থাকে।</p></aside></div>;
}
