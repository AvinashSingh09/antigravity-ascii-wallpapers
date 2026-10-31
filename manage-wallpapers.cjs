/* Usage: node manage-wallpapers.cjs install|restore|verify [app-or-asar-path] */
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto'), os=require('os');

function resolveArchive(){
 const custom=process.argv[3]||process.env.ANTIGRAVITY_ASAR||process.env.ANTIGRAVITY_APP_PATH;
 if(custom){
  if(fs.existsSync(custom)&&fs.statSync(custom).isFile())return path.resolve(custom);
  const nested=[
   path.join(custom,'Contents','Resources','app.asar'),
   path.join(custom,'resources','app.asar'),
   path.join(custom,'app.asar')
  ];
  for(const c of nested)if(fs.existsSync(c))return path.resolve(c);
  return path.resolve(custom);
 }
 const home=os.homedir(),candidates=[];
 if(process.platform==='darwin'){
  candidates.push(
   '/Applications/Antigravity.app/Contents/Resources/app.asar',
   path.join(home,'Applications','Antigravity.app','Contents','Resources','app.asar')
  );
 }else if(process.platform==='win32'){
  if(process.env.LOCALAPPDATA){
   candidates.push(path.join(process.env.LOCALAPPDATA,'Programs','antigravity','resources','app.asar'));
  }
 }else{
  candidates.push(
   '/opt/Antigravity/resources/app.asar',
   '/usr/lib/antigravity/resources/app.asar',
   path.join(home,'.local','share','antigravity','resources','app.asar')
  );
 }
 for(const c of candidates)if(fs.existsSync(c))return c;
 return candidates[0]||(process.platform==='darwin'
  ?'/Applications/Antigravity.app/Contents/Resources/app.asar'
  :(process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Programs','antigravity','resources','app.asar'):''));
}

const archive=resolveArchive();
const backup=archive+'.ascii-wallpapers.backup';
const receipt=archive+'.ascii-wallpapers.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const SUPPORTED='046fa2ba9abe96bc915eb7ed12887c067396a8a12148842ab4f4e2cd05a68feb';
function parse(bytes){
 if(bytes.readUInt32LE(0)!==4)throw Error('Unexpected ASAR format');
 const dataStart=8+bytes.readUInt32LE(4);
 const header=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)).toString('utf8'));
 return {header,dataStart};
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
    content=Buffer.concat([content,Buffer.from('\n\n// BEGIN LOCAL ASCII WALLPAPERS\n'),Buffer.from(p==='dist/preload.js'?script:mainScript)]);
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
 try{
  fs.writeFileSync(temp,bytes);
  fs.renameSync(temp,archive);
 }catch(err){
  if(fs.existsSync(temp))try{fs.unlinkSync(temp);}catch{}
  if(err.code==='EACCES'||err.code==='EPERM'){
   throw Error(`Permission denied writing to ${archive}.\nOn macOS/Linux, try running with: sudo node manage-wallpapers.cjs ${process.argv[2]||'install'}`);
  }
  throw err;
 }
}
function main(){
 const action=process.argv[2];
 if(!['install','restore','verify'].includes(action))throw Error('Use install, restore, or verify');
 if(!archive||!fs.existsSync(archive)){
  throw Error(`Antigravity app archive not found.\nSearched at: ${archive||'unknown'}\nPlease ensure Antigravity 2.28.2 is installed, or specify its path:\n  node manage-wallpapers.cjs ${action} /path/to/Antigravity.app\nor set ANTIGRAVITY_ASAR=/path/to/app.asar`);
 }
 let original;
 try{
  original=fs.readFileSync(archive);
 }catch(err){
  if(err.code==='EACCES'||err.code==='EPERM'){
   throw Error(`Permission denied reading ${archive}.\nOn macOS/Linux, try running with: sudo node manage-wallpapers.cjs ${action}`);
  }
  throw err;
 }
 const digest=sha(original);
 if(action==='restore'){
  if(!fs.existsSync(receipt)||!fs.existsSync(backup))throw Error('No wallpaper backup found');
  const r=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(digest===r.original){console.log('Original app is already restored.');return;}
  if(digest!==r.patched)throw Error('The app has changed since installation. Refusing to overwrite a newer app.');
  const b=fs.readFileSync(backup);if(sha(b)!==r.original)throw Error('Backup checksum does not match');
  replace(b);console.log('Original Antigravity restored. Reload its window to remove wallpapers.');return;
 }
 if(fs.existsSync(receipt)){
  const r=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(digest===r.patched){
   original=fs.readFileSync(backup);
   if(sha(original)!==SUPPORTED)throw Error('Original backup checksum does not match');
  }
 }
 if(sha(original)!==SUPPORTED)throw Error('This installer supports the inspected Antigravity 2.28.2 build only. App files have changed; inspect the new build before installing.');
 const script=fs.readFileSync(path.join(__dirname,'wallpaper-scenes.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'ascii-wallpapers.js'),'utf8');
 const patched=repack(original,script,fs.readFileSync(path.join(__dirname,'wallpapers-main.js'),'utf8'));
 if(action==='verify'){console.log('Archive rebuild verified, with all packed file integrity hashes intact. No files changed.');return;}
 if(digest===sha(patched)){console.log('Latest ASCII wallpapers are installed; checksum verified.');return;}
 if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==sha(original))throw Error('An existing backup belongs to another app build; it was preserved.');
 try{
  if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
  const r={version:'2.28.2',original:sha(original),patched:sha(patched),installedAt:new Date().toISOString(),backup};
  fs.writeFileSync(receipt,JSON.stringify(r,null,2));
  replace(patched);
 }catch(err){
  if(err.code==='EACCES'||err.code==='EPERM'){
   throw Error(`Permission denied writing to ${archive}.\nOn macOS/Linux, try running with: sudo node manage-wallpapers.cjs ${action}`);
  }
  throw err;
 }
 console.log('Installed ASCII wallpapers. Original archive backed up at '+backup);
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
