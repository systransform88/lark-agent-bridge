const {app,BrowserWindow,ipcMain,dialog,shell,protocol,net,Tray,Menu,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {DesktopController,trustedURL}=require('./controller.cjs');
if(process.env.LARK_DESKTOP_DATA_DIR){const directory=path.resolve(process.env.LARK_DESKTOP_DATA_DIR);fs.mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);}
protocol.registerSchemesAsPrivileged([{scheme:'bridge',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window,controller,tray,quitting=false;
const UI_URL='bridge://app/index.html';
const links={console:'https://open.larksuite.com/app',guide:'https://github.com/systransform88/lark-agent-bridge/blob/main/docs/DESKTOP.md',codex:'https://learn.chatgpt.com/docs/cli/reference',claude:'https://code.claude.com/docs/en/setup',github:'https://github.com/systransform88/lark-agent-bridge'};
function trayImage(){
  const bytes=Buffer.alloc(16*16*4);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=(y*16+x)*4,on=(x>=3&&x<=5&&y>=3&&y<=12)||(y>=10&&y<=12&&x>=3&&x<=12);bytes[i]=36;bytes[i+1]=164;bytes[i+2]=135;bytes[i+3]=on?255:0;}
  return nativeImage.createFromBitmap(bytes,{width:16,height:16,scaleFactor:1});
}
function show(){window.show();window.focus();}
function refreshTray(){if(!tray)return;tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Lark Agent Bridge',click:show},{label:'Start bridge',enabled:!controller.worker,click:()=>controller.startBridge().catch(error=>dialog.showErrorBox('Cannot start bridge',error.message))},{label:'Stop bridge',enabled:Boolean(controller.worker),click:()=>controller.stopBridge().catch(console.error)},{type:'separator'},{label:'Quit',click:()=>app.quit()}]));tray.setToolTip(`Lark Agent Bridge · ${controller.state().bridge.status}`);}
async function createWindow(){
  window=new BrowserWindow({width:1180,height:820,minWidth:940,minHeight:680,title:'Lark Agent Bridge',backgroundColor:'#f5f6f8',autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==UI_URL)event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
  window.on('close',event=>{if(tray&&!quitting){event.preventDefault();window.hide();}});
  window.once('ready-to-show',()=>window.show());
  await window.loadURL(UI_URL);
}
const actions=new Set(['state','saveSettings','chooseWorkspace','chooseAgent','checkConnections','useExistingLark','connectLark','beginLarkLogin','finishLarkLogin','cancelLogin','beginAgentLogin','startBridge','stopBridge','cancelTask','readMemories','openLink','openDataFolder']);
app.whenReady().then(async()=>{
  if(!app.requestSingleInstanceLock()){app.quit();return;}
  app.on('second-instance',()=>window&&show());
  const additions=[path.join(os.homedir(),'.local','bin'),path.join(os.homedir(),'.npm-global','bin'),'/opt/homebrew/bin','/usr/local/bin'];
  if(process.env.APPDATA)additions.push(path.join(process.env.APPDATA,'npm'));
  process.env.PATH=[...additions,process.env.PATH||''].join(path.delimiter);
  protocol.handle('bridge',request=>{
    const url=new URL(request.url);const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(url.hostname!=='app'||!['index.html','style.css','app.js'].includes(file))return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(path.join(__dirname,'ui',file)).href);
  });
  const runtimeRoot=app.isPackaged?path.join(process.resourcesPath,'bridge'):path.resolve(__dirname,'..');
  const dataDirectory=process.env.LARK_DESKTOP_DATA_DIR||app.getPath('userData');
  controller=new DesktopController({runtimeRoot,dataDirectory,defaultWorkspace:path.join(app.getPath('documents'),'Lark Agent Workspace')});
  controller.on('state',state=>{if(window&&!window.isDestroyed())window.webContents.send('desktop:state',state);refreshTray();});
  ipcMain.handle('desktop:action',async(event,{method,payload}={})=>{
    if(!window||event.sender.id!==window.webContents.id||event.senderFrame?.url!==UI_URL||!actions.has(method))throw new Error('Request not permitted.');
    if(method==='state')return controller.state();
    if(method==='chooseWorkspace'){const result=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];}
    if(method==='chooseAgent'){const result=await dialog.showOpenDialog(window,{title:'Choose the agent executable or Node entrypoint',properties:['openFile']});return result.canceled?null:result.filePaths[0];}
    if(method==='openLink'){
      const url=payload?.key==='auth'?controller.state().auth?.url:links[payload?.key];
      if(!trustedURL(url))throw new Error('This external link is not permitted.');
      await shell.openExternal(url);return true;
    }
    if(method==='openDataFolder'){const error=await shell.openPath(dataDirectory);if(error)throw new Error(error);return true;}
    return controller[method](payload);
  });
  await createWindow();
  if(process.env.LARK_DESKTOP_TEST!=='1'){
    try{tray=new Tray(trayImage());tray.on('click',show);refreshTray();}catch(error){controller.log('System tray is unavailable; use the main window.');}
  }
});
app.on('window-all-closed',()=>{if(!tray)app.quit();});
app.on('activate',()=>{if(window)show();});
app.on('before-quit',event=>{if(!quitting&&controller){event.preventDefault();quitting=true;controller.dispose().catch(console.error).finally(()=>{tray?.destroy();app.quit();});}});
app.on('web-contents-created',(event,contents)=>{contents.on('will-attach-webview',event=>event.preventDefault());});
