import {validateOwnerSnapshot} from '../../../lib/snapshot-reports.mjs';

let pending=false;
export function readNativeResult(value) {
  const result=typeof value==='string'?JSON.parse(value):value;
  if(result.error)throw new Error(result.error);
  if(result.data)validateOwnerSnapshot(result.data);
  return result;
}
export function requestDrive({code,interactive=false}={}) {
  if(!window.RodShopAndroid?.connectDrive)return Promise.reject(new Error('Google Drive সংযোগের জন্য নতুন APK ইনস্টল করুন।'));
  if(pending)return Promise.reject(new Error('Drive-এর আপডেট চলছে। একটু অপেক্ষা করুন।'));
  pending=true;
  return new Promise((resolve,reject)=>{
    let timer;
    function cleanup(){pending=false;clearTimeout(timer);window.removeEventListener('rodshop-drive-result',receive);}
    function receive(event){cleanup();try{resolve(readNativeResult(event.detail));}catch(error){reject(error);}}
    window.addEventListener('rodshop-drive-result',receive);
    timer=setTimeout(()=>{cleanup();reject(new Error('Google সংযোগে সময় লাগছে। অনুমতির পর্দা শেষ করে আবার আপডেট করুন।'));},120_000);
    try{if(code)window.RodShopAndroid.connectDrive(code);else window.RodShopAndroid.refreshDrive(interactive);}
    catch(error){cleanup();reject(error);}
  });
}
