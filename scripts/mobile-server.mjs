import path from 'node:path';
import {openStore,projectRoot} from '../lib/store.mjs';
import {mobileConfiguration,createMobileServer} from '../lib/mobile-access.mjs';

const store=openStore();let server=null,busy=false,stopping=false;
const apkPath=path.join(projectRoot,'apps/pc/public/downloads/rod-khata-owner.apk');
async function tick() {
  if(busy||stopping) return;busy=true;
  try {
    const config=mobileConfiguration(store.db);
    if(config.enabled&&!server) {
      const next=createMobileServer({getConfiguration:()=>mobileConfiguration(store.db),readSnapshot:store.readSnapshot,apkPath});
      await new Promise((resolve,reject)=>{next.once('error',reject);next.listen(3002,'0.0.0.0',resolve);});
      next.on('error',error=>console.error('Mobile connection:',error.message));server=next;
      console.log('Read-only mobile Wi-Fi connection is enabled on port 3002.');
    } else if(!config.enabled&&server) {const previous=server;server=null;await new Promise(resolve=>previous.close(resolve));console.log('Mobile Wi-Fi connection disabled.');}
  } catch(error) {console.error('Mobile connection:',error.message);}
  finally {busy=false;}
}
await tick();const timer=setInterval(tick,2000);
async function stop() {stopping=true;clearInterval(timer);if(server)server.close();store.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
