import {openStore,defaultDataDir} from '../lib/store.mjs';
import {createGoogleDrive} from '../lib/google-drive.mjs';

const store=openStore(),drive=createGoogleDrive({dataDir:defaultDataDir});
let busy=false,stopping=false,retryAt=0,failures=0;
async function tick() {
  if(busy||stopping||Date.now()<retryAt||!drive.status().connected)return;
  busy=true;
  try {await drive.sync(store);failures=0;retryAt=0;}
  catch(error){failures++;retryAt=Date.now()+Math.min(30*60_000,30_000*2**Math.min(failures,6));console.error('Drive upload:',error.message);}
  finally{busy=false;}
}
await tick();const timer=setInterval(tick,30_000);
async function stop(){stopping=true;clearInterval(timer);while(busy)await new Promise(resolve=>setTimeout(resolve,50));store.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
