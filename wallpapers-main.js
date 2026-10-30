/* Isolated wallpaper preferences; never writes Antigravity's settings file. */
(() => {
  const {app,ipcMain}=require('electron');
  const fs=require('fs'), path=require('path');
  const file=()=>path.join(app.getPath('userData'),'ascii-wallpapers-preferences.json');
  ipcMain.handle('ascii-wallpapers:get',()=>{
    try{return JSON.parse(fs.readFileSync(file(),'utf8'));}catch{return {};}
  });
  ipcMain.handle('ascii-wallpapers:save',(event,changes)=>{
    const url=event.senderFrame?.url||'';
    if(!/^https:\/\/127\.0\.0\.1:\d+\//.test(url))throw Error('Unsupported wallpaper origin');
    const key='asciiWallpaperPreferences.v1',raw=changes?.[key];
    if(typeof raw!=='string'||raw.length>1024)throw Error('Invalid wallpaper preferences');
    const p=JSON.parse(raw);
    if(!['off','clouds','aurora','lagoon','koi','jelly','boats','sakura','fireflies','moon','dunes','rain','snow','lanterns','meadow','galaxy','bamboo','code','tide','autumn','alpine','retro','lava','catnap'].includes(p.theme)||!Number.isFinite(p.intensity)||p.intensity<15||p.intensity>100||typeof p.paused!=='boolean'||(p.reactive!==undefined&&typeof p.reactive!=='boolean'))throw Error('Invalid wallpaper preferences');
    const data=JSON.stringify({[key]:JSON.stringify({theme:p.theme,intensity:p.intensity,paused:p.paused,reactive:p.reactive!==false})});
    fs.writeFileSync(file()+'.tmp',data,'utf8');fs.renameSync(file()+'.tmp',file());
  });
})();
