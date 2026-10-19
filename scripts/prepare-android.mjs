import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectRoot} from '../lib/store.mjs';

if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('This pinned toolchain is for Apple silicon Mac. The APK itself supports Android devices of any CPU architecture.');
const destination=path.join(projectRoot,'work/android-toolchain');fs.mkdirSync(destination,{recursive:true});
const lock=JSON.parse(fs.readFileSync(path.join(projectRoot,'android/build-tools.lock.json')));
const authLock=JSON.parse(fs.readFileSync(path.join(projectRoot,'android/google-auth.lock.json')));
for(const artifact of [...lock,...authLock.map(item=>({...item,name:'google-auth/'+item.name}))]) {
  const file=path.join(destination,artifact.name);fs.mkdirSync(path.dirname(file),{recursive:true});
  const valid=()=>fs.existsSync(file)&&createHash('sha256').update(fs.readFileSync(file)).digest('hex')===artifact.sha256;
  if(!valid()) {
    console.log('Downloading '+artifact.name);
    await new Promise((resolve,reject)=>{const child=spawn('curl',['-fL','--retry','2','--max-time','600',artifact.url,'-o',file],{stdio:'inherit'});child.on('exit',code=>code?reject(new Error('Download failed.')):resolve());});
    if(!valid())throw new Error('Checksum mismatch: '+artifact.name);
  }
}
for(const artifact of authLock.filter(item=>item.name.endsWith('.aar'))) {
  const folder=path.join(destination,'google-auth',artifact.name.slice(0,-4));fs.mkdirSync(folder,{recursive:true});
  if(spawnSync('unzip',['-oq',path.join(destination,'google-auth',artifact.name),'-d',folder],{stdio:'inherit'}).status!==0)throw new Error('Google auth extraction failed.');
}
for(const [command,args] of [['tar',['-xzf',path.join(destination,'jdk.tar.gz'),'-C',destination]],['unzip',['-oq',path.join(destination,'aapt2.jar'),'aapt2','-d',destination]]]) {
  if(spawnSync(command,args,{stdio:'inherit'}).status!==0)throw new Error('Tool extraction failed.');
}
fs.chmodSync(path.join(destination,'aapt2'),0o755);console.log('Pinned Android build tools verified and ready.');
