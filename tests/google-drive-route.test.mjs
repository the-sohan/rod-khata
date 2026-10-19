import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Drive setup accepts Next localhost normalization but rejects foreign origins and Hosts',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rod-drive-route-'));
  process.env.ROD_SHOP_DATA_DIR=folder;
  const {GET,POST}=await import('../apps/pc/app/api/drive/[action]/route.js');
  const context=action=>({params:Promise.resolve({action})});
  const request=(origin,host='127.0.0.1:3000',body='{}')=>new Request('http://localhost:3000/api/drive/configure',{
    method:'POST',headers:{Host:host,...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},body,
  });
  try {
    for(const origin of [undefined,'https://example.com','http://127.0.0.1:3001','http://localhost:3000']) {
      assert.equal((await POST(request(origin),context('configure'))).status,403);
    }
    assert.equal((await POST(request('http://evil.example','evil.example'),context('configure'))).status,403);
    assert.equal((await POST(request('http://127.0.0.1:3000','127.0.0.1:3000',' '.repeat(17000)),context('configure'))).status,413);
    const response=await POST(request('http://127.0.0.1:3000','127.0.0.1:3000',JSON.stringify({
      ownerEmail:'owner@example.com',credentials:{installed:{client_id:'test.apps.googleusercontent.com',client_secret:'private-test-value'}},
    })),context('configure'));
    assert.equal(response.status,200);
    assert.equal((await response.json()).drive.configured,true);
    const status=await GET(new Request('http://localhost:3000/api/drive/status',{headers:{Host:'127.0.0.1:3000'}}),context('status'));
    assert.equal(status.status,200);
    assert.doesNotMatch(await status.text(),/private-test-value|client_secret/);
    assert.equal((await GET(new Request('http://localhost:3000/api/drive/status',{headers:{Host:'evil.example'}}),context('status'))).status,403);
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});
