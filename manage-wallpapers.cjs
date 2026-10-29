/* Usage: node manage-wallpapers.cjs install|restore */
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const archive=path.join(process.env.LOCALAPPDATA,'Programs','antigravity','resources','app.asar');
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
function replace(bytes){const temp=archive+'.ascii-wallpapers.tmp';fs.writeFileSync(temp,bytes);fs.renameSync(temp,archive);}
function main(){
 const action=process.argv[2];
 if(!['install','restore','verify'].includes(action))throw Error('Use install, restore, or verify');
 let original=fs.readFileSync(archive);const digest=sha(original);
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
 if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
 const r={version:'2.28.2',original:sha(original),patched:sha(patched),installedAt:new Date().toISOString(),backup};
 fs.writeFileSync(receipt,JSON.stringify(r,null,2));
 replace(patched);
 console.log('Installed ASCII wallpapers. Original archive backed up at '+backup);
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
