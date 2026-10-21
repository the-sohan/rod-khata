import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

if(process.env.ROD_SHOP_DEMO!=='1') throw new Error('Set ROD_SHOP_DEMO=1 to launch the disposable online demo.');
const port=Number(process.env.PORT||3100);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT.');
// Always start from a new temporary folder; ignore the real PC data-directory setting.
process.env.ROD_SHOP_DEMO_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'rod-khata-demo-'));
if(!process.env.RENDER_EXTERNAL_URL&&!process.env.ROD_SHOP_DEMO_ORIGIN) process.env.ROD_SHOP_DEMO_ORIGIN=`http://localhost:${port}`;
const {demoOrigin}=await import('../lib/demo-mode.mjs');
if(!demoOrigin()) throw new Error('Configure a valid ROD_SHOP_DEMO_ORIGIN or Render external URL.');
const {seedDemo}=await import('../lib/demo-seed.mjs');
console.log('Disposable demo ready:',seedDemo(process.env.ROD_SHOP_DEMO_DATA_DIR));
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start',path.join(root,'apps/pc'),'--hostname',process.env.RENDER?'0.0.0.0':'127.0.0.1','--port',String(port)],{cwd:root,stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>child.kill(signal));
