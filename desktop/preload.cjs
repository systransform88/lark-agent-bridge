const {contextBridge,ipcRenderer}=require('electron');
const methods=['saveSettings','chooseWorkspace','chooseAgent','checkConnections','useExistingLark','connectLark','beginLarkLogin','finishLarkLogin','cancelLogin','beginAgentLogin','startBridge','stopBridge','cancelTask','readMemories','openLink','openDataFolder'];
const api={state:()=>ipcRenderer.invoke('desktop:action',{method:'state'}),subscribe:callback=>{const handler=(event,state)=>callback(state);ipcRenderer.on('desktop:state',handler);return()=>ipcRenderer.removeListener('desktop:state',handler);}};
for(const method of methods)api[method]=payload=>ipcRenderer.invoke('desktop:action',{method,payload});
contextBridge.exposeInMainWorld('bridge',api);
