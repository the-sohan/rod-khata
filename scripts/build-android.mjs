import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {projectRoot} from '../lib/store.mjs';

const tools=path.join(projectRoot,'work/android-toolchain'),build=path.join(projectRoot,'work/android-build');
const javaHome=process.env.ROD_ANDROID_JAVA_HOME||path.join(tools,'jdk-21.0.12.1+1/Contents/Home');
const java=path.join(javaHome,'bin/java'),javac=path.join(javaHome,'bin/javac');
for(const file of [java,javac,...['aapt2','android-all.jar','r8.jar','apksig.jar'].map(file=>path.join(tools,file))])if(!fs.existsSync(file))throw new Error(`Android build dependency missing: ${file}. See android/README.md.`);
if(!fs.existsSync(path.join(projectRoot,'apps/owner/out/index.html')))throw new Error('Run npm run build first.');
fs.rmSync(build,{recursive:true,force:true});fs.mkdirSync(build,{recursive:true});
const assets=path.join(build,'assets'),classes=path.join(build,'classes'),dex=path.join(build,'dex'),resources=path.join(build,'resources');
for(const dir of [assets,classes,dex,resources])fs.mkdirSync(dir,{recursive:true});
fs.cpSync(path.join(projectRoot,'apps/owner/out'),path.join(assets,'owner'),{recursive:true});
function run(command,args,env={}){const result=spawnSync(command,args,{cwd:projectRoot,stdio:'inherit',env:{...process.env,...env}});if(result.status!==0)throw new Error(`${path.basename(command)} failed (${result.status}).`);}
const androidJar=path.join(tools,'android-all.jar'),aapt=path.join(tools,'aapt2');
const authLock=JSON.parse(fs.readFileSync(path.join(projectRoot,'android/google-auth.lock.json')));
const authJars=[],extraPackages=[],libraryResources=[];
for(const artifact of authLock) {
  const file=path.join(tools,'google-auth',artifact.name);
  if(!fs.existsSync(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==artifact.sha256)throw new Error('Run npm run android:prepare: Google auth dependency missing or changed.');
  if(file.endsWith('.jar'))authJars.push(file);
  else {
    const folder=file.slice(0,-4),classesJar=path.join(folder,'classes.jar');
    if(fs.existsSync(classesJar))authJars.push(classesJar);
    const manifest=fs.readFileSync(path.join(folder,'AndroidManifest.xml'),'utf8');
    const packageName=manifest.match(/package="([\w.]+)"/)?.[1];if(packageName)extraPackages.push(packageName);
    if(fs.existsSync(path.join(folder,'res'))) {
      const compiled=path.join(build,`${path.basename(folder)}.zip`);
      run(aapt,['compile','--dir',path.join(folder,'res'),'-o',compiled]);libraryResources.push('-R',compiled);
    }
  }
}
run(aapt,['compile','--dir',path.join(projectRoot,'android/res'),'-o',resources]);
const resourceApk=path.join(build,'resources.apk');
const generated=path.join(build,'generated');fs.mkdirSync(generated,{recursive:true});
run(aapt,['link','-o',resourceApk,'--manifest',path.join(projectRoot,'android/AndroidManifest.xml'),'-I',androidJar,'-A',assets,'--min-sdk-version','26','--target-sdk-version','35','-0','arsc','--auto-add-overlay','--java',generated,'--extra-packages',[...new Set(extraPackages)].join(':'),...libraryResources,...fs.readdirSync(resources).map(name=>path.join(resources,name))]);
run(javac,['--release','8','-encoding','UTF-8','-classpath',[androidJar,...authJars].join(path.delimiter),'-d',classes,...files(path.join(projectRoot,'android/src')).filter(file=>file.endsWith('.java')),...files(generated).filter(file=>file.endsWith('.java'))]);
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
run(java,['-cp',path.join(tools,'r8.jar'),'com.android.tools.r8.D8','--release','--lib',androidJar,'--lib',javaHome,'--min-api','26','--output',dex,...files(classes).filter(file=>file.endsWith('.class')),...authJars]);
const unsigned=path.join(build,'owner-unsigned.apk');
const jarList=path.join(build,'libraries.json');fs.writeFileSync(jarList,JSON.stringify(authJars));
const zipCode=`import zipfile,struct,os,sys
import json
source,dex_dir,out,jar_list=sys.argv[1:]
with zipfile.ZipFile(source) as old,zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
 entries=[(i.filename,old.read(i.filename)) for i in old.infolist()]+[(n,open(os.path.join(dex_dir,n),'rb').read()) for n in os.listdir(dex_dir) if n.endswith('.dex')]
 extras={}
 for jar in json.load(open(jar_list)):
  with zipfile.ZipFile(jar) as library:
   for item in library.infolist():
    name=item.filename
    if item.is_dir() or name.endswith('.class') or (name.startswith('META-INF/') and not name.startswith('META-INF/services/')):continue
    content=library.read(name)
    if name.startswith('META-INF/services/') and name in extras:content=extras[name]+b'\\n'+content
    extras[name]=content
 entries+=list(extras.items())
 for name,data in entries:
  info=zipfile.ZipInfo(name);info.compress_type=zipfile.ZIP_STORED if name=='resources.arsc' else zipfile.ZIP_DEFLATED
  pad=(-(archive.fp.tell()+30+len(name.encode('utf8'))+4))%4
  info.extra=struct.pack('<HH',0xd935,pad)+bytes(pad)
  archive.writestr(info,data)
`;
run('python3',['-c',zipCode,resourceApk,dex,unsigned,jarList]);
const signing=path.join(projectRoot,'data/android-signing');fs.mkdirSync(signing,{recursive:true,mode:0o700});
const passwordFile=path.join(signing,'owner-key-password.txt'),key=path.join(signing,'owner-release.p12');
if(!fs.existsSync(passwordFile))fs.writeFileSync(passwordFile,randomBytes(32).toString('hex'),{mode:0o600});
const password=fs.readFileSync(passwordFile,'utf8').trim(),env={ROD_ANDROID_KEY_PASSWORD:password};
if(!fs.existsSync(key)){run(path.join(javaHome,'bin/keytool'),['-genkeypair','-noprompt','-alias','owner','-keystore',key,'-storetype','PKCS12','-storepass:env','ROD_ANDROID_KEY_PASSWORD','-keypass:env','ROD_ANDROID_KEY_PASSWORD','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=RodKhata Owner, O=Local Build, C=BD'],env);fs.chmodSync(key,0o600);}
run(javac,['-encoding','UTF-8','-cp',path.join(tools,'apksig.jar'),'-d',build,path.join(projectRoot,'android/SignApk.java')]);
const releases=path.join(projectRoot,'releases');fs.mkdirSync(releases,{recursive:true});
const destination=path.join(releases,'rod-khata-owner-v0.6.0.apk');
run(java,['-cp',`${build}${path.delimiter}${path.join(tools,'apksig.jar')}`,'SignApk',unsigned,destination,key],env);
run('python3',['-c',`import zipfile,struct,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert 'classes.dex' in z.namelist() and 'AndroidManifest.xml' in z.namelist() and 'assets/owner/index.html' in z.namelist()
 i=z.getinfo('resources.arsc');z.fp.seek(i.header_offset);h=z.fp.read(30);n,e=struct.unpack('<HH',h[26:30]);assert (i.header_offset+30+n+e)%4==0;assert i.compress_type==zipfile.ZIP_STORED
 print('APK assets, ZIP integrity and resources alignment verified.')
`,destination]);
const download=path.join(projectRoot,'apps/pc/public/downloads');fs.mkdirSync(download,{recursive:true});const downloadFile=path.join(download,'rod-khata-owner.apk');fs.copyFileSync(destination,downloadFile+'.tmp');fs.renameSync(downloadFile+'.tmp',downloadFile);
const checksum=createHash('sha256').update(fs.readFileSync(destination)).digest('hex');fs.writeFileSync(`${destination}.sha256`,`${checksum}  ${path.basename(destination)}\n`);
console.log(`Android APK ready: ${destination} (${fs.statSync(destination).size} bytes)`);
