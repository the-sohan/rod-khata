import {randomBytes,timingSafeEqual} from 'node:crypto';
import os from 'node:os';
import http from 'node:http';
import fs from 'node:fs';

export function mobileConfiguration(db) {
  const values=Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key IN ('mobile_enabled','mobile_token')").all().map(row=>[row.key,row.value]));
  const enabled=values.mobile_enabled==='1';
  const addresses=Object.values(os.networkInterfaces()).flat().filter(row=>row&&row.family==='IPv4'&&!row.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address)).map(row=>`http://${row.address}:3002`);
  return {enabled,token:enabled?values.mobile_token||'':'',addresses:[...new Set(addresses)]};
}
export function setMobileConfiguration(db,enabled) {
  if(typeof enabled!=='boolean') throw new Error('সংযোগ চালু বা বন্ধ বেছে নিন।');
  const token=enabled?randomBytes(32).toString('base64url'):'';
  db.exec('BEGIN IMMEDIATE');
  try {
    const put=db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    put.run('mobile_enabled',enabled?'1':'0');put.run('mobile_token',token);db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  return publicMobileConfiguration(db);
}
export function publicMobileConfiguration(db) {
  const config=mobileConfiguration(db);
  return {enabled:config.enabled,addresses:config.addresses,
    connections:config.enabled?config.addresses.map(url=>({url,code:'RS1.'+Buffer.from(JSON.stringify({version:1,url,token:config.token})).toString('base64url')})):[],
  };
}
export function createMobileServer({getConfiguration,readSnapshot,apkPath}) {
  const failed=new Map();
  return http.createServer((request,response)=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    const json=(value,status=200)=>{response.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(value));};
    const config=getConfiguration();
    if(!config.enabled) return json({error:'মোবাইল সংযোগ বন্ধ আছে।'},403);
    if(request.method!=='GET') return json({error:'শুধু হিসাব দেখা যায়।'},405);
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/download/owner.apk') {
      if(!fs.existsSync(apkPath)) return json({error:'APK এখনও তৈরি হয়নি।'},404);
      response.writeHead(200,{...headers,'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="rod-khata-owner.apk"','Content-Length':fs.statSync(apkPath).size});fs.createReadStream(apkPath).pipe(response);return;
    }
    if(pathname!=='/snapshot') return json({error:'ঠিকানা পাওয়া যায়নি।'},404);
    const supplied=Buffer.from(String(request.headers.authorization||'').replace(/^Bearer /,'')),wanted=Buffer.from(config.token||'');
    if(!wanted.length||supplied.length!==wanted.length||!timingSafeEqual(supplied,wanted)) {
      const ip=request.socket.remoteAddress||'',now=Date.now(),previous=failed.get(ip);
      const attempt=previous&&previous.until>now?previous:{n:0,until:now+300_000};attempt.n++;failed.set(ip,attempt);
      if(failed.size>1000) for(const [key,value] of failed) if(value.until<now) failed.delete(key);
      return json({error:'সংযোগ কোড সঠিক নয়।'},attempt.n>10?429:401);
    }
    try {const data=readSnapshot();if(!data) return json({error:'PC থেকে হিসাব আপডেট করুন।'},503);json({data,readonly:true});}
    catch {json({error:'হিসাব পড়া যায়নি।'},500);}
  });
}
