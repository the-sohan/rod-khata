import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {drivePaths,readPrivateJson,writePrivateJson,readDriveStatus} from './google-drive-state.mjs';

const SCOPE='https://www.googleapis.com/auth/drive.file';
const API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3';
const safeEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<254;
const hash=buffer=>createHash('md5').update(buffer).digest('hex');
export function createGoogleDrive({dataDir,fetchImpl=fetch,now=()=>Date.now()}) {
  const files=drivePaths(dataDir);
  const readState=()=>readPrivateJson(files.state);
  const saveState=patch=>writePrivateJson(files.state,{...readState(),...patch});
  function configure({credentials,ownerEmail}) {
    if(readDriveStatus(dataDir).connected) throw new Error('কনফিগারেশন বদলানোর আগে Drive সংযোগ বিচ্ছিন্ন করুন।');
    const previous=readPrivateJson(files.config),email=String(ownerEmail||previous.ownerEmail||'').trim().toLowerCase();
    if(!safeEmail(email)) throw new Error('মালিকের Gmail ঠিকানাটি দিন।');
    let config={...previous,ownerEmail:email};
    if(credentials) {
      const parsed=typeof credentials==='string'?JSON.parse(credentials):credentials;
      const client=parsed.installed;
      if(!client||!/^[-\w.]+\.apps\.googleusercontent\.com$/.test(client.client_id||'')||typeof client.client_secret!=='string'||client.client_secret.length>300) throw new Error('Google Cloud থেকে Desktop app-এর OAuth JSON ফাইল বেছে নিন।');
      config={ownerEmail:email,client_id:client.client_id,client_secret:client.client_secret};
    }
    if(previous.client_id&&(previous.client_id!==config.client_id||previous.ownerEmail!==email))writePrivateJson(files.state,{connected:false});
    writePrivateJson(files.config,config);return readDriveStatus(dataDir);
  }
  function readTokens() {
    const encoded=fs.readFileSync(files.tokens),key=fs.readFileSync(files.key);
    const decrypt=createDecipheriv('aes-256-gcm',key,encoded.subarray(0,12));decrypt.setAuthTag(encoded.subarray(12,28));
    return JSON.parse(Buffer.concat([decrypt.update(encoded.subarray(28)),decrypt.final()]).toString('utf8'));
  }
  function saveTokens(value) {
    fs.mkdirSync(files.folder,{recursive:true,mode:0o700});
    if(!fs.existsSync(files.key)) fs.writeFileSync(files.key,randomBytes(32),{mode:0o600,flag:'wx'});
    const iv=randomBytes(12),encrypt=createCipheriv('aes-256-gcm',fs.readFileSync(files.key),iv);
    const body=Buffer.concat([encrypt.update(JSON.stringify(value),'utf8'),encrypt.final()]);
    const temporary=`${files.tokens}.${process.pid}.tmp`;
    fs.writeFileSync(temporary,Buffer.concat([iv,encrypt.getAuthTag(),body]),{mode:0o600});fs.renameSync(temporary,files.tokens);
  }
  async function google(url,options={}) {
    try {return await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(60_000)});}
    catch {throw new Error('Google-এর সঙ্গে সংযোগ পাওয়া যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।');}
  }
  function startAuthorization(redirectUri) {
    const config=readPrivateJson(files.config);
    if(!config.client_id) throw new Error('আগে Desktop OAuth JSON ফাইল যোগ করুন।');
    const redirect=new URL(redirectUri);
    if(redirect.protocol!=='http:'||redirect.hostname!=='127.0.0.1'||redirect.pathname!=='/api/drive/callback') throw new Error('OAuth ফেরার ঠিকানা সঠিক নয়।');
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
    writePrivateJson(files.pending,{state,verifier,redirectUri,createdAt:now()});
    const query=new URLSearchParams({client_id:config.client_id,redirect_uri:redirectUri,response_type:'code',scope:SCOPE,
      state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',
      access_type:'offline',prompt:'consent',login_hint:config.ownerEmail});
    return {url:`https://accounts.google.com/o/oauth2/v2/auth?${query}`};
  }
  async function completeAuthorization({state,code,error}) {
    const pending=readPrivateJson(files.pending),a=Buffer.from(String(state||'')),b=Buffer.from(String(pending.state||''));
    if(!a.length||a.length!==b.length||!timingSafeEqual(a,b)||now()-pending.createdAt>10*60_000) throw new Error('লগইনের অনুরোধ শেষ হয়েছে। PC অ্যাপ থেকে আবার সংযুক্ত করুন।');
    fs.unlinkSync(files.pending);
    if(error||!code) throw new Error('Google-এর অনুমতি পাওয়া যায়নি। আবার সংযুক্ত করতে পারেন।');
    const config=readPrivateJson(files.config);
    const response=await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,code,code_verifier:pending.verifier,redirect_uri:pending.redirectUri,grant_type:'authorization_code'})});
    const token=await response.json();
    if(!response.ok||!token.access_token||!token.refresh_token) throw new Error('Google login সম্পন্ন হয়নি। OAuth সেটআপ ও অনুমতি পরীক্ষা করুন।');
    if(!String(token.scope||'').split(' ').includes(SCOPE)) throw new Error('Drive ফাইল ব্যবহারের অনুমতি দেওয়া হয়নি।');
    const identity=await google(`${API}/about?fields=user(emailAddress)`,{headers:{Authorization:`Bearer ${token.access_token}`}});
    const account=await identity.json();
    if(!identity.ok||account.user?.emailAddress?.toLowerCase()!==config.ownerEmail) throw new Error('নির্বাচিত মালিকের Gmail দিয়ে লগইন করুন। অন্য account সংযুক্ত হয়নি।');
    saveTokens({access_token:token.access_token,refresh_token:token.refresh_token,expiresAt:now()+Number(token.expires_in||3600)*1000});
    saveState({connected:true,ownerEmail:config.ownerEmail,error:'',connectedAt:new Date(now()).toISOString()});
    return readDriveStatus(dataDir);
  }
  async function accessToken(force=false) {
    const token=readTokens();
    if(!force&&token.expiresAt>now()+60_000) return token.access_token;
    const config=readPrivateJson(files.config);
    const response=await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:token.refresh_token,grant_type:'refresh_token'})});
    const updated=await response.json();
    if(!response.ok||!updated.access_token) {
      if(updated.error==='invalid_grant') saveState({connected:false,error:'Google-এর অনুমতি শেষ হয়েছে। আবার সংযুক্ত করুন।'});
      throw new Error(updated.error==='invalid_grant'?'Google-এর অনুমতি শেষ হয়েছে। আবার সংযুক্ত করুন।':'Google-এর অনুমতি নবায়ন হয়নি। পরে আবার চেষ্টা করুন।');
    }
    saveTokens({...token,access_token:updated.access_token,refresh_token:updated.refresh_token||token.refresh_token,expiresAt:now()+Number(updated.expires_in||3600)*1000});
    return updated.access_token;
  }
  async function request(url,options={},retry=true) {
    const token=await accessToken();
    const response=await google(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});
    if(response.status===401&&retry) {await accessToken(true);return request(url,options,false);}
    if(response.status===404) return null;
    if(!response.ok) throw new Error(response.status===403?'Drive-এ আপলোডের অনুমতি বা জায়গা পরীক্ষা করুন।':response.status===429?'Google এখন ব্যস্ত। কিছুক্ষণ পর আবার চেষ্টা করুন।':'Google Drive-এ কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।');
    return response;
  }
  async function metadata(id) {
    const response=await request(`${API}/files/${encodeURIComponent(id)}?fields=id,md5Checksum,size,trashed`);
    return response?response.json():null;
  }
  async function generateId() {return (await (await request(`${API}/files/generateIds?count=1&space=drive`)).json()).ids[0];}
  async function upload({id,name,mime,bytes,parent,properties}) {
    const existing=await metadata(id);
    if(existing&&!existing.trashed&&existing.md5Checksum===hash(bytes)) return id;
    if(existing?.trashed) throw new Error('Drive-এর সংশ্লিষ্ট ফাইল Trash-এ আছে। সেটি ফেরত এনে আবার চেষ্টা করুন।');
    const fields='id,md5Checksum,size',method=existing?'PATCH':'POST';
    const endpoint=existing?`${UPLOAD}/files/${encodeURIComponent(id)}`:`${UPLOAD}/files`;
    const body=existing?{name}:{id,name,parents:[parent],appProperties:properties};
    const session=await request(`${endpoint}?uploadType=resumable&fields=${fields}`,{method,headers:{'Content-Type':'application/json','X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(bytes.length)},body:JSON.stringify(body)});
    const location=session?.headers.get('location');
    if(!location||new URL(location).origin!=='https://www.googleapis.com') throw new Error('Google আপলোডের ঠিকানা সঠিক নয়।');
    const uploaded=await request(location,{method:'PUT',headers:{'Content-Type':mime,'Content-Length':String(bytes.length)},body:bytes});
    if(!uploaded) throw new Error('আপলোডের সময় শেষ হয়েছে। আবার চেষ্টা করুন।');
    const result=await uploaded.json();
    if(result.id!==id||result.md5Checksum!==hash(bytes)||Number(result.size)!==bytes.length) throw new Error('Drive-এ পাঠানো ফাইল যাচাই হয়নি। আবার চেষ্টা করুন।');
    return id;
  }
  async function folderFor(shop) {
    const saved=readState().folderId;
    if(saved) {const item=await metadata(saved);if(item&&!item.trashed) return saved;}
    const safeId=String(shop.id).replace(/[^a-zA-Z0-9-]/g,'');
    if(!safeId) throw new Error('দোকানের পরিচয় পাওয়া যায়নি।');
    const query=`trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='rodShopId' and value='${safeId}' }`;
    const listing=await request(`${API}/files?${new URLSearchParams({q:query,fields:'files(id)',pageSize:'100'})}`);
    let id=(await listing.json()).files?.[0]?.id;
    if(!id) {
      const response=await request(`${API}/files?fields=id`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:`RodKhata · ${shop.name}`,mimeType:'application/vnd.google-apps.folder',appProperties:{rodShopId:safeId}})});
      id=(await response.json()).id;
    }
    if(!id) throw new Error('Drive-এ দোকানের ফোল্ডার তৈরি হয়নি।');
    saveState({folderId:id});return id;
  }
  function lock() {
    fs.mkdirSync(files.folder,{recursive:true,mode:0o700});
    try {const fd=fs.openSync(files.lock,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:now()}));fs.closeSync(fd);}
    catch(error) {
      if(error.code!=='EEXIST') throw error;
      const current=readPrivateJson(files.lock);let alive=true;
      try {process.kill(current.pid,0);} catch(error) {alive=error.code==='EPERM';}
      if(alive) throw new Error('Drive-এর আপডেট চলছে। একটু পরে আবার দেখুন।');
      fs.unlinkSync(files.lock);return lock();
    }
    return ()=>{try{fs.unlinkSync(files.lock);}catch{}};
  }
  async function sync(store,{force=false}={}) {
    if(!readDriveStatus(dataDir).connected) return {skipped:true,...readDriveStatus(dataDir)};
    const unlock=lock();
    try {
      const current=readState(),instant=new Date(now()).toISOString();
      // Ignore the generation clock when detecting business changes. Keep one
      // stable private file ID so the owner's saved connection stays valid.
      const preview=store.dashboard(new Date(now()),true),{generatedAt:unused,...content}=preview;
      const fingerprint=createHash('sha256').update(JSON.stringify(content)).digest('hex');
      const snapshotDue=force||current.snapshotFingerprint!==fingerprint||!current.snapshotAt||now()-Date.parse(current.snapshotAt)>=30*60_000;
      const backupDue=force||!!current.pendingBackup||!current.backupAt||now()-Date.parse(current.backupAt)>=60*60_000;
      if(!snapshotDue&&!backupDue) return {skipped:true,...readDriveStatus(dataDir)};
      saveState({lastAttemptAt:instant,error:''});
      const shop=store.shop(),folder=await folderFor(shop);
      saveState({shopId:shop.id});
      if(snapshotDue) {
        const snapshot=store.snapshot(new Date(now())),bytes=Buffer.from(JSON.stringify(snapshot));
        const id=current.snapshotFileId||await generateId();saveState({snapshotFileId:id});
        await upload({id,name:'latest-owner-snapshot.json',mime:'application/json',bytes,parent:folder,properties:{rodKind:'snapshot',rodShopId:shop.id}});
        saveState({snapshotAt:instant,snapshotFingerprint:fingerprint});
      }
      if(backupDue) {
        let pending=readState().pendingBackup;
        if(!pending) {const backup=await store.backupDatabase();pending={filename:backup.filename,id:await generateId()};saveState({pendingBackup:pending});}
        if(path.basename(pending.filename)!==pending.filename) throw new Error('ব্যাকআপের পরিচয় সঠিক নয়।');
        const bytes=fs.readFileSync(path.join(dataDir,'backups',pending.filename));
        await upload({id:pending.id,name:pending.filename,mime:'application/vnd.sqlite3',bytes,parent:folder,properties:{rodKind:'backup',rodShopId:shop.id}});
        saveState({backupAt:instant,pendingBackup:null});
      }
      saveState({error:''});return readDriveStatus(dataDir);
    } catch(error) {saveState({error:error.message});throw error;} finally {unlock();}
  }
  async function disconnect() {
    const unlock=lock();
    try {
      if(fs.existsSync(files.tokens)) {
        const token=readTokens();
        const response=await google('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refresh_token})});
        if(!response.ok&&response.status!==400) throw new Error('Google-এর অনুমতি সরানো যায়নি। ইন্টারনেট সংযোগ দিয়ে আবার চেষ্টা করুন।');
        fs.unlinkSync(files.tokens);
      }
      if(fs.existsSync(files.pending)) fs.unlinkSync(files.pending);
      saveState({connected:false,error:'',disconnectedAt:new Date(now()).toISOString()});return readDriveStatus(dataDir);
    } finally {unlock();}
  }
  return {configure,startAuthorization,completeAuthorization,sync,disconnect,status:()=>readDriveStatus(dataDir)};
}
