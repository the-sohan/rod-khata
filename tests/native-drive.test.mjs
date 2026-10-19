import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requestDrive,readNativeResult} from '../apps/owner/app/native-drive.mjs';

test('native Drive callbacks validate data, propagate failures, and allow retry without exposing tokens',async()=>{
  const previous=globalThis.window,events=new EventTarget();globalThis.window=events;
  try {
    await assert.rejects(requestDrive({code:'RD1.fixture'}),/নতুন APK/);
    events.RodShopAndroid={connectDrive(){throw new Error('cancelled');}};
    await assert.rejects(requestDrive({code:'RD1.fixture'}),/cancelled/);
    let receivedCode,interactive;
    events.RodShopAndroid={connectDrive(code){receivedCode=code;},refreshDrive(value){interactive=value;}};
    const data=JSON.parse(fs.readFileSync(new URL('../apps/owner/public/demo-owner.json',import.meta.url)));
    let pending=requestDrive({code:'RD1.fixture'});assert.equal(receivedCode,'RD1.fixture');
    await assert.rejects(requestDrive(),/আপডেট চলছে/);
    events.dispatchEvent(new CustomEvent('rodshop-drive-result',{detail:{data,source:'drive',offline:false,downloadedAt:'2026-10-19T01:00:00Z'}}));
    assert.equal((await pending).source,'drive');
    pending=requestDrive({interactive:true});assert.equal(interactive,true);
    events.dispatchEvent(new CustomEvent('rodshop-drive-result',{detail:{error:'permission denied'}}));
    await assert.rejects(pending,/permission denied/);
    pending=requestDrive();assert.equal(interactive,false);
    events.dispatchEvent(new CustomEvent('rodshop-drive-result',{detail:{data,source:'drive',offline:true,warning:'offline'}}));
    assert.equal((await pending).offline,true);
    assert.throws(()=>readNativeResult({data:{readonly:true}}));
  }finally{globalThis.window=previous;}
});
