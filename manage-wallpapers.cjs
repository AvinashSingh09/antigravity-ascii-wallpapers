/* Usage: node manage-wallpapers.cjs install|verify|status|restore [app-or-asar-path] */
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto'), vm=require('vm'), os=require('os');
function resolveArchive(){
 const custom=process.argv[3]||process.env.ANTIGRAVITY_ASAR||process.env.ANTIGRAVITY_APP_PATH;
 if(custom){
  const p=path.resolve(custom);
  if(fs.existsSync(p)&&fs.statSync(p).isFile())return p;
  return [path.join(p,'Contents','Resources','app.asar'),path.join(p,'resources','app.asar'),path.join(p,'app.asar')].find(fs.existsSync)||p;
 }
 const candidates=process.platform==='darwin'
  ? ['/Applications/Antigravity.app/Contents/Resources/app.asar',path.join(os.homedir(),'Applications','Antigravity.app','Contents','Resources','app.asar')]
  : process.platform==='win32'&&process.env.LOCALAPPDATA?[path.join(process.env.LOCALAPPDATA,'Programs','antigravity','resources','app.asar')]:[];
 return candidates.find(fs.existsSync)||candidates[0]||'';
}
const archive=resolveArchive();
const appDir=path.dirname(path.dirname(archive));
const backup=archive+'.ascii-wallpapers.backup';
const receipt=archive+'.ascii-wallpapers.json';
const MARKER='// BEGIN LOCAL ASCII WALLPAPERS';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Builds that were inspected by hand. Any other build must pass inspect() before it is patched.
const VERIFIED={'046fa2ba9abe96bc915eb7ed12887c067396a8a12148842ab4f4e2cd05a68feb':'2.28.2'};
function parse(bytes){
 if(bytes.readUInt32LE(0)!==4)throw Error('Unexpected ASAR format');
 const dataStart=8+bytes.readUInt32LE(4);
 const header=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)).toString('utf8'));
 return {header,dataStart};
}
function entries(header){
 const map=new Map();
 (function walk(tree,prefix){for(const [name,item] of Object.entries(tree.files||{})){const p=prefix?prefix+'/'+name:name;if(item.files)walk(item,p);else map.set(p,item);}})(header,'');
 return map;
}
function packedText(bytes,p){
 const {header,dataStart}=parse(bytes),item=entries(header).get(p);
 if(!item||item.unpacked||item.link)return null;
 return bytes.subarray(dataStart+Number(item.offset),dataStart+Number(item.offset)+item.size).toString('utf8');
}
// Electron fuses live after a fixed sentinel in the executable. Fuse 4 is EnableEmbeddedAsarIntegrityValidation:
// if a build turns it on, any edited archive would stop the app from launching, so refuse instead.
function asarIntegrityFuse(){
 const exe=process.platform==='darwin'
  ? path.join(appDir,'Frameworks','Electron Framework.framework','Electron Framework')
  : path.join(appDir,'Antigravity.exe');
 if(!fs.existsSync(exe))return 'unknown';
 const bytes=fs.readFileSync(exe),sentinel=Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),i=bytes.indexOf(sentinel);
 if(i<0)return 'unknown';
 const length=bytes[i+sentinel.length+1],wire=bytes.subarray(i+sentinel.length+2,i+sentinel.length+2+length).toString('latin1');
 return wire.length>4?(wire[4]==='1'?'on':wire[4]==='0'?'off':'unknown'):'unknown';
}
// Compile the patched file the way Electron loads CommonJS, without running it.
function compiles(source,name){
 try{new vm.Script('(function (exports, require, module, __filename, __dirname) {'+source+'\n})',{filename:name});return true;}catch{return false;}
}
function inspect(original,script,mainScript){
 const errors=[],warnings=[];
 let pkg={};try{pkg=JSON.parse(packedText(original,'package.json')||'{}');}catch{}
 const preload=packedText(original,'dist/preload.js'),main=packedText(original,'dist/main.js');
 if(pkg.productName!=='Antigravity')errors.push('package.json does not describe Antigravity');
 if(pkg.main!=='dist/main.js')errors.push('the app entry point is no longer dist/main.js');
 if(preload===null)errors.push('dist/preload.js is missing or not packed in the archive');
 if(main===null)errors.push('dist/main.js is missing or not packed in the archive');
 if(preload?.includes(MARKER)||main?.includes(MARKER))errors.push('this archive already contains wallpapers but has no matching backup; reinstall Antigravity to get a clean copy');
 if(preload!==null&&/\bdrawAsciiScene\b/.test(preload))errors.push('dist/preload.js already declares drawAsciiScene');
 if(preload!==null&&!compiles(preload+'\n\n'+MARKER+'\n'+script,'dist/preload.js'))errors.push('the patched dist/preload.js would not compile');
 if(main!==null&&!compiles(main+'\n\n'+MARKER+'\n'+mainScript,'dist/main.js'))errors.push('the patched dist/main.js would not compile');
 const fuse=asarIntegrityFuse();
 if(fuse==='on')errors.push('Electron ASAR integrity validation is enabled for this build');
 if(fuse==='unknown'&&process.platform==='darwin')errors.push('could not verify the macOS Electron ASAR integrity fuse; refusing to modify the application');
 else if(fuse==='unknown')warnings.push('could not read Electron fuses from Antigravity.exe');
 if(preload!==null){
  if(!preload.includes('const electron_1 = require("electron")'))warnings.push('preload has no electron_1; preferences fall back to page storage');
  if(!preload.includes('electronNativeAPI'))warnings.push('preload has no electronNativeAPI; the title bar will not be recolored');
  if(!preload.includes("'agent:update-active-count'"))warnings.push('preload no longer reports running agents; "React to agents" will have no effect');
 }
 return {version:pkg.version||'unknown',verified:VERIFIED[sha(original)]===pkg.version,errors,warnings};
}
function repack(original,script,mainScript){
 const {header,dataStart}=parse(original);
 const chunks=[];let offset=0;
 function walk(tree,prefix=''){
  for(const [name,item] of Object.entries(tree.files||{})){
   const p=prefix?prefix+'/'+name:name;
   if(item.files){walk(item,p);continue;}
   if(item.unpacked||item.link)continue;
   let content=original.subarray(dataStart+Number(item.offset),dataStart+Number(item.offset)+item.size);
   if(p==='dist/preload.js'||p==='dist/main.js'){
    content=Buffer.concat([content,Buffer.from('\n\n'+MARKER+'\n'),Buffer.from(p==='dist/preload.js'?script:mainScript)]);
    const blockSize=item.integrity?.blockSize||4194304,blocks=[];
    for(let i=0;i<content.length;i+=blockSize)blocks.push(sha(content.subarray(i,i+blockSize)));
    item.integrity={algorithm:'SHA256',hash:sha(content),blockSize,blocks};
   }
   item.offset=String(offset);item.size=content.length;offset+=content.length;chunks.push(content);
  }
 }
 walk(header);
 const json=Buffer.from(JSON.stringify(header));
 const padded=Math.ceil((4+json.length)/4)*4;
 const head=Buffer.alloc(8+padded);
 head.writeUInt32LE(4+padded,0);head.writeUInt32LE(json.length,4);json.copy(head,8);
 const size=Buffer.alloc(8);size.writeUInt32LE(4,0);size.writeUInt32LE(head.length,4);
 const output=Buffer.concat([size,head,...chunks]);
 // Verify every packed file after rebuilding offsets, including the edited preload.
 const decoded=parse(output);
 function verify(tree){for(const item of Object.values(tree.files||{})){
  if(item.files){verify(item);continue;}if(item.unpacked||item.link)continue;
  const data=output.subarray(decoded.dataStart+Number(item.offset),decoded.dataStart+Number(item.offset)+item.size);
  if(data.length!==item.size||item.integrity&&sha(data)!==item.integrity.hash)throw Error('Repacked archive verification failed');
 }}verify(decoded.header);
 return output;
}
function replace(bytes){
 const temp=archive+'.ascii-wallpapers.tmp';
 try{fs.writeFileSync(temp,bytes);fs.renameSync(temp,archive);}
 catch(e){try{fs.unlinkSync(temp);}catch{}if(['EBUSY','EPERM','EACCES'].includes(e.code))throw Error('The app archive is in use. Close Antigravity completely (including the tray icon) and try again.');throw e;}
}
function main(){
 const action=process.argv[2];
 if(!['install','restore','verify','status'].includes(action))throw Error('Use install, verify, status, or restore');
 if(!fs.existsSync(archive))throw Error('Antigravity was not found at '+archive);
 const current=fs.readFileSync(archive),digest=sha(current);
 const r=fs.existsSync(receipt)?JSON.parse(fs.readFileSync(receipt,'utf8')):null;
 if(action==='restore'){
  if(!r||!fs.existsSync(backup))throw Error('No wallpaper backup found');
  if(digest===r.original){console.log('Original app is already restored.');return;}
  if(digest!==r.patched)throw Error('The app has changed since installation (probably an update, which already removed the wallpapers). Nothing to restore.');
  const b=fs.readFileSync(backup);if(sha(b)!==r.original)throw Error('Backup checksum does not match');
  replace(b);console.log('Original Antigravity '+(r.version||'')+' restored. Reload its window to remove wallpapers.');return;
 }
 // Find the clean archive: the backup when our patch is installed, otherwise the archive itself.
 let original=current,state='not installed';
 if(r&&digest===r.patched){
  if(!fs.existsSync(backup))throw Error('Wallpapers are installed but the backup is missing');
  original=fs.readFileSync(backup);
  if(sha(original)!==r.original)throw Error('Original backup checksum does not match');
  state='installed';
 }else if(r&&digest!==r.original)state='removed by an app update';
 const script=fs.readFileSync(path.join(__dirname,'wallpaper-scenes.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'ascii-wallpapers.js'),'utf8');
 const mainScript=fs.readFileSync(path.join(__dirname,'wallpapers-main.js'),'utf8');
 const report=inspect(original,script,mainScript);
 const label='Antigravity '+report.version+(report.verified?' (hand-verified build)':' (checked automatically)');
 for(const w of report.warnings)console.warn('Note: '+w+'.');
 if(action==='status'){
  console.log(label+': wallpapers '+state+(r?' (last installed for '+r.version+' at '+r.installedAt+')':'')+'.');
  console.log(report.errors.length?'Cannot be patched:\n - '+report.errors.join('\n - '):'Ready to patch.');
  return;
 }
 if(report.errors.length)throw Error('Cannot patch '+label+':\n - '+report.errors.join('\n - '));
 const patched=repack(original,script,mainScript);
 if(action==='verify'){console.log(label+': archive rebuild verified, with all packed file integrity hashes intact. No files changed.');return;}
 if(digest===sha(patched)){console.log('Latest ASCII wallpapers are installed for '+label+'; checksum verified.');return;}
 // A backup from an older app build is kept beside the new one rather than overwritten.
 if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==sha(original)){
  const old=backup+'.'+(r?.version||'previous')+'-'+Date.now();
  fs.renameSync(backup,old);console.log('Kept the backup from the previous app build at '+old);
 }
 if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
 const next={version:report.version,verified:report.verified,original:sha(original),patched:sha(patched),installedAt:new Date().toISOString(),backup};
 replace(patched);
 // Written only after a successful swap, so a failed swap leaves the previous receipt describing the archive on disk.
 fs.writeFileSync(receipt,JSON.stringify(next,null,2));
 console.log('Installed ASCII wallpapers for '+label+'. Original archive backed up at '+backup);
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
