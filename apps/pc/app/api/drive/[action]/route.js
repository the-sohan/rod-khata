import {openStore,defaultDataDir} from '../../../../../../lib/store.mjs';
import {createGoogleDrive} from '../../../../../../lib/google-drive.mjs';
import {isHostedDemo,demoUnavailable} from '../../../../../../lib/demo-mode.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function reply(value,status=200) {return Response.json(value,{status,headers});}
function allowed(request,write=false) {
  const url=new URL(request.url),ports=process.env.ROD_SHOP_DRIVE_PREVIEW==='1'?['3000','3012']:['3000'];
  if(!['127.0.0.1','localhost'].includes(url.hostname)||!ports.includes(url.port)) return false;
  const host=request.headers.get('host');
  if(![`127.0.0.1:${url.port}`,`localhost:${url.port}`].includes(host)) return false;
  const origin=request.headers.get('origin');
  // Next can normalize request.url to localhost even when Chrome uses 127.0.0.1.
  const browserOrigin=`http://${host}`;
  return write?origin===browserOrigin:!origin||origin===browserOrigin;
}
export async function GET(request,{params}) {
  if(isHostedDemo()) return demoUnavailable();
  if(!allowed(request)) return reply({error:'Drive সেটআপ শুধু দোকানের PC থেকে করা যাবে।'},403);
  const {action}=await params,drive=createGoogleDrive({dataDir:defaultDataDir});
  if(action==='status') return reply({drive:drive.status()});
  if(action==='callback') {
    let message,success=false;
    try {await drive.completeAuthorization(Object.fromEntries(new URL(request.url).searchParams));message='Google Drive সংযুক্ত হয়েছে। PC অ্যাপে ফিরে আপলোডের অবস্থা দেখুন।';success=true;}
    catch {message='Google Drive সংযুক্ত হয়নি। PC অ্যাপে ফিরে সঠিক Gmail দিয়ে আবার চেষ্টা করুন।';}
    return new Response(`<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Google Drive · রডখাতা</title><body style="font-family:Arial,sans-serif;max-width:600px;margin:70px auto;padding:24px;line-height:1.8"><h1>${success?'সংযোগ সম্পন্ন':'সংযোগ সম্পন্ন হয়নি'}</h1><p>${message}</p><a href="/drive">Drive-এর অবস্থা দেখুন</a></body></html>`,{status:success?200:400,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  return reply({error:'ঠিকানা পাওয়া যায়নি।'},404);
}
export async function POST(request,{params}) {
  if(isHostedDemo()) return demoUnavailable();
  if(!allowed(request,true)) return reply({error:'Drive সেটআপ শুধু দোকানের PC থেকে করা যাবে।'},403);
  const {action}=await params;
  if(!['configure','connect','sync','disconnect'].includes(action)) return reply({error:'ঠিকানা পাওয়া যায়নি।'},404);
  let size=0;const chunks=[];
  for await(const chunk of request.body||[]) {
    size+=chunk.length;if(size>16_384) return reply({error:'OAuth ফাইল অত্যধিক বড়।'},413);chunks.push(chunk);
  }
  try {
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'),drive=createGoogleDrive({dataDir:defaultDataDir});
    if(action==='configure') return reply({drive:drive.configure(input)});
    if(action==='connect') {
      const url=new URL(request.url);
      return reply(drive.startAuthorization(`http://127.0.0.1:${url.port}/api/drive/callback`));
    }
    if(action==='disconnect') return reply({drive:await drive.disconnect()});
    const store=openStore();
    try {return reply({drive:await drive.sync(store,{force:true})});} finally {store.close();}
  } catch(error) {return reply({error:error instanceof SyntaxError?'OAuth JSON ফাইলটি সঠিক নয়।':error.message||'Drive-এর কাজটি সম্পন্ন হয়নি।'},400);}
}
