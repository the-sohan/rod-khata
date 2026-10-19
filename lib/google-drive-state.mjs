import fs from 'node:fs';
import path from 'node:path';

export function drivePaths(dataDir) {
  const folder=path.join(dataDir,'google-drive');
  return {folder,config:path.join(folder,'client.json'),state:path.join(folder,'status.json'),
    tokens:path.join(folder,'tokens.enc'),key:path.join(folder,'token-key.bin'),pending:path.join(folder,'oauth-pending.json'),lock:path.join(folder,'sync.lock')};
}
export function readPrivateJson(file,fallback={}) {
  try {return JSON.parse(fs.readFileSync(file,'utf8'));} catch(error) {if(error.code==='ENOENT') return fallback;throw error;}
}
export function writePrivateJson(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temporary,file);fs.chmodSync(file,0o600);
}
export function readDriveStatus(dataDir) {
  try {
    const files=drivePaths(dataDir),config=readPrivateJson(files.config),state=readPrivateJson(files.state);
    // Private runtime files are supplied by the local PC, never build assets.
    const connected=!!state.connected&&fs.existsSync(/*turbopackIgnore: true*/ files.tokens);
    const mobileConnection=connected&&state.snapshotAt&&state.snapshotFileId&&state.shopId?
      'RD1.'+Buffer.from(JSON.stringify({version:1,shopId:state.shopId,fileId:state.snapshotFileId,ownerEmail:config.ownerEmail})).toString('base64url'):null;
    return {configured:!!config.client_id,ownerEmail:config.ownerEmail||'',connected,mobileConnection,
      folderId:state.folderId||null,snapshotAt:state.snapshotAt||null,backupAt:state.backupAt||null,
      lastAttemptAt:state.lastAttemptAt||null,error:state.error||'',snapshotIntervalMinutes:30,backupIntervalMinutes:60,changeCheckSeconds:30};
  } catch {return {configured:false,ownerEmail:'',connected:false,error:'Drive-এর লোকাল কনফিগারেশন পড়া যায়নি।'};}
}
