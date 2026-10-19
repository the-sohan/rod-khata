import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from '../lib/store.mjs';
import {createGoogleDrive} from '../lib/google-drive.mjs';
import {drivePaths,readPrivateJson} from '../lib/google-drive-state.mjs';

const credentials={installed:{client_id:'123456-test.apps.googleusercontent.com',client_secret:'test-client-secret'}};
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rodshop-drive-')),store=openStore(dir),files=drivePaths(dir);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  let clock=Date.now(),nextId=1,refreshes=0,puts=0,invalidGrant=false,dropBackup=false,wrongEmail=false;
  const uploaded=new Map(),sessions=new Map(),calls=[];
  const json=(value,status=200)=>Response.json(value,{status});
  async function google(url,options={}) {
    calls.push({url,method:options.method||'GET'});const parsed=new URL(url),method=options.method||'GET';
    assert.equal(parsed.protocol,'https:');assert.equal(options.redirect,'error');
    if(parsed.hostname==='oauth2.googleapis.com') {
      if(parsed.pathname==='/revoke')return json({});
      const params=new URLSearchParams(options.body);
      if(params.get('grant_type')==='refresh_token'){refreshes++;return invalidGrant?json({error:'invalid_grant'},400):json({access_token:'refreshed-access',expires_in:3600});}
      assert.ok(params.get('code_verifier'));return json({access_token:'initial-access',refresh_token:'private-refresh-token',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});
    }
    assert.equal(parsed.hostname,'www.googleapis.com');assert.match(options.headers.Authorization,/^Bearer /);
    if(parsed.pathname.endsWith('/about'))return json({user:{emailAddress:wrongEmail?'different@example.test':'owner@example.test'}});
    if(parsed.pathname.endsWith('/generateIds'))return json({ids:[`file-${nextId++}`]});
    if(parsed.searchParams.has('upload_id')) {
      assert.equal(method,'PUT');puts++;
      const session=sessions.get(parsed.searchParams.get('upload_id')),bytes=Buffer.from(options.body);
      const record={id:session.id,md5Checksum:createHash('md5').update(bytes).digest('hex'),size:String(bytes.length),bytes};
      uploaded.set(record.id,record);
      if(dropBackup&&session.name.endsWith('.sqlite')){dropBackup=false;throw new Error('Network lost after server received bytes');}
      return json({id:record.id,md5Checksum:record.md5Checksum,size:record.size});
    }
    if(parsed.pathname.startsWith('/upload/')) {
      const meta=JSON.parse(options.body),id=meta.id||parsed.pathname.split('/').at(-1),sessionId=String(sessions.size+1);
      sessions.set(sessionId,{id,name:meta.name});
      return new Response(null,{status:200,headers:{location:`https://www.googleapis.com/upload/drive/v3/files?upload_id=${sessionId}`}});
    }
    if(parsed.pathname.endsWith('/files')&&method==='GET')return json({files:uploaded.has('folder')?[{id:'folder'}]:[]});
    if(parsed.pathname.endsWith('/files')&&method==='POST'){uploaded.set('folder',{id:'folder',trashed:false});return json({id:'folder'});}
    const id=parsed.pathname.split('/').at(-1),record=uploaded.get(id);
    if(record){const {bytes,...metadata}=record;return json(metadata);}return json({error:'not found'},404);
  }
  const drive=createGoogleDrive({dataDir:dir,fetchImpl:google,now:()=>clock});
  async function connect() {
    drive.configure({credentials,ownerEmail:'owner@example.test'});
    const flow=drive.startAuthorization('http://127.0.0.1:3000/api/drive/callback'),params=new URL(flow.url).searchParams;
    await drive.completeAuthorization({state:params.get('state'),code:'one-time-test-code'});return params;
  }
  return {dir,store,files,drive,connect,uploaded,calls,get puts(){return puts;},get refreshes(){return refreshes;},
    advance:milliseconds=>clock+=milliseconds,dropBackup:()=>dropBackup=true,invalidGrant:()=>invalidGrant=true,wrongEmail:()=>wrongEmail=true};
}
test('Drive does not contact Google before configuration and consent; only Desktop OAuth JSON is accepted',async t=>{
  const f=fixture(t);assert.equal((await f.drive.sync(f.store)).skipped,true);assert.equal(f.calls.length,0);
  assert.throws(()=>f.drive.configure({credentials:{web:credentials.installed},ownerEmail:'owner@example.test'}));
  assert.throws(()=>f.drive.configure({credentials,ownerEmail:'bad'}));
  assert.throws(()=>f.drive.startAuthorization('https://example.com/api/drive/callback'));
});
test('OAuth uses PKCE, validates state and account, and stores tokens encrypted outside the database',async t=>{
  const f=fixture(t);f.drive.configure({credentials,ownerEmail:'owner@example.test'});
  const params=new URL(f.drive.startAuthorization('http://127.0.0.1:3000/api/drive/callback').url).searchParams;
  const pending=readPrivateJson(f.files.pending);
  assert.equal(params.get('code_challenge'),createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.equal(params.get('scope'),'https://www.googleapis.com/auth/drive.file');
  await assert.rejects(()=>f.drive.completeAuthorization({state:'wrong',code:'code'}));assert.equal(f.calls.length,0);
  await f.drive.completeAuthorization({state:params.get('state'),code:'code'});
  assert.equal(f.drive.status().connected,true);assert.ok(!fs.readFileSync(f.files.tokens).includes('private-refresh-token'));
  assert.ok(!JSON.stringify(f.drive.status()).includes('access_token'));assert.ok(!JSON.stringify(f.drive.status()).includes('client_secret'));
  assert.equal(fs.statSync(f.files.tokens).mode&0o777,0o600);
  await assert.rejects(()=>f.drive.completeAuthorization({state:params.get('state'),code:'code'}));
});
test('OAuth rejects a different Gmail and expired callbacks without saving credentials',async t=>{
  const f=fixture(t);f.wrongEmail();await assert.rejects(f.connect);assert.equal(fs.existsSync(f.files.tokens),false);
  const params=new URL(f.drive.startAuthorization('http://127.0.0.1:3000/api/drive/callback').url).searchParams;
  f.advance(11*60_000);await assert.rejects(()=>f.drive.completeAuthorization({state:params.get('state'),code:'code'}));
});
test('Drive sync uploads verified snapshot and SQLite backup on separate intervals and refreshes tokens',async t=>{
  const f=fixture(t);await f.connect();
  const first=await f.drive.sync(f.store);assert.ok(first.snapshotAt&&first.backupAt);assert.equal(f.puts,2);
  assert.equal((await f.drive.sync(f.store)).skipped,true);assert.equal(f.puts,2);
  f.advance(31*60_000);const second=await f.drive.sync(f.store);assert.equal(f.puts,3);assert.equal(first.backupAt,second.backupAt);
  f.advance(31*60_000);await f.drive.sync(f.store);assert.equal(f.puts,5);assert.ok(f.refreshes>0);
  const state=readPrivateJson(f.files.state),snapshot=f.uploaded.get(state.snapshotFileId);
  assert.equal(JSON.parse(snapshot.bytes.toString()).readonly,true);
  assert.equal([...f.uploaded.values()].filter(v=>v.bytes?.subarray(0,15).toString()==='SQLite format 3').length,2);
  assert.ok(!f.calls.some(call=>call.url.includes('/permissions')),'never shares the folder publicly');
});
test('a lost upload response retries the same backup ID without duplicate files or false success',async t=>{
  const f=fixture(t);await f.connect();f.dropBackup();await assert.rejects(()=>f.drive.sync(f.store));
  const pending=readPrivateJson(f.files.state).pendingBackup;assert.ok(pending.id);assert.equal(f.drive.status().backupAt,null);
  const puts=f.puts;await f.drive.sync(f.store);assert.equal(f.puts,puts,'checks server checksum before attempting upload again');
  assert.equal(readPrivateJson(f.files.state).pendingBackup,null);assert.ok(f.drive.status().backupAt);
});
test('business changes publish on the next worker tick using the same private mobile file ID',async t=>{
  const f=fixture(t);await f.connect();await f.drive.sync(f.store);
  const first=readPrivateJson(f.files.state),puts=f.puts;
  const code=f.drive.status().mobileConnection;assert.ok(code.startsWith('RD1.'));
  const pairing=JSON.parse(Buffer.from(code.slice(4),'base64url'));
  assert.deepEqual(Object.keys(pairing).sort(),['fileId','ownerEmail','shopId','version']);
  assert.equal(pairing.fileId,first.snapshotFileId);assert.equal(pairing.shopId,f.store.shop().id);
  const product=f.store.addProduct({name:'পরীক্ষার সিমেন্ট',unit:'pcs',quantity:100,rate:500})[0];
  f.advance(30_000);await f.drive.sync(f.store);
  const second=readPrivateJson(f.files.state);assert.equal(second.snapshotFileId,first.snapshotFileId);
  assert.equal(second.backupAt,first.backupAt);assert.equal(f.puts,puts+1);
  const uploaded=JSON.parse(f.uploaded.get(first.snapshotFileId).bytes);
  assert.ok(uploaded.products.some(row=>row.id===product.id));assert.notEqual(first.snapshotFingerprint,second.snapshotFingerprint);
  assert.equal((await f.drive.sync(f.store)).skipped,true);
});
test('renewing the same Google grant preserves the mobile connection; changing accounts clears it',async t=>{
  const f=fixture(t);await f.connect();await f.drive.sync(f.store);const code=f.drive.status().mobileConnection;
  await f.drive.disconnect();assert.equal(f.drive.status().mobileConnection,null);
  await f.connect();assert.equal(f.drive.status().mobileConnection,code);
  await f.drive.disconnect();f.drive.configure({credentials,ownerEmail:'new-owner@example.test'});
  assert.equal(readPrivateJson(f.files.state).snapshotFileId,undefined);
});
test('expired consent stops automatic uploads and disconnect preserves existing cloud backup files',async t=>{
  const f=fixture(t);await f.connect();await f.drive.sync(f.store);const count=f.uploaded.size;
  f.advance(61*60_000);f.invalidGrant();await assert.rejects(()=>f.drive.sync(f.store));assert.equal(f.drive.status().connected,false);
  const before=f.calls.length;await f.drive.sync(f.store);assert.equal(f.calls.length,before);
  await f.drive.disconnect();assert.equal(fs.existsSync(f.files.tokens),false);assert.equal(f.uploaded.size,count);
});
