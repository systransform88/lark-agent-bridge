const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const os=require('node:os');
const {spawn}=require('node:child_process');

function validateSettings(input,previous={}){
  if(!input||typeof input!=='object')throw new Error('Settings are required.');
  const agent=input.agent||previous.agent||'codex';
  const access=input.access||previous.access||'read-only';
  if(!['codex','claude'].includes(agent)||!['read-only','full'].includes(access))throw new Error('Choose a supported agent and access mode.');
  const workspace=String(input.workspace??previous.workspace??'').trim();
  if(!workspace||!path.isAbsolute(workspace))throw new Error('Choose an absolute workspace folder.');
  const allowedUserId=String(input.allowedUserId??previous.allowedUserId??'').trim();
  if(allowedUserId&&!/^ou_[\w-]+$/.test(allowedUserId))throw new Error('The allowed Lark user ID must start with ou_.');
  const executable=String(input.agentExecutable??previous.agentExecutable??'').trim();
  if(executable&&!path.isAbsolute(executable))throw new Error('Select an absolute agent executable path.');
  return {...previous,agent,access,workspace,allowedUserId,agentExecutable:executable};
}
function trustedURL(value){
  let url;try{url=new URL(value);}catch{return false;}
  if(url.protocol!=='https:'||url.username||url.password)return false;
  return ['openai.com','chatgpt.com','claude.ai','claude.com','anthropic.com','larksuite.com','feishu.cn','github.com','learn.chatgpt.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
}
function decodeJSON(value){const text=value.replace(/^\uFEFF/,'').trim();return JSON.parse(text);}
function isAlive(pid){try{process.kill(Number(pid),0);return true;}catch{return false;}}
function redact(text){return String(text).replace(/\b(?:sk-ant-|sk-proj-|ghp_)[A-Za-z0-9_-]+/g,'[redacted]').replace(/((?:app_secret|appSecret|access_token|refresh_token|device_code)\s*[":=]+\s*)[^\s",}]+/gi,'$1[redacted]');}

class DesktopController extends EventEmitter{
  constructor({runtimeRoot,dataDirectory,defaultWorkspace,execute,spawnWorker}={}){
    super();this.root=runtimeRoot;this.dir=dataDirectory;
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
    this.configPath=path.join(this.dir,'config.json');
    let saved={};if(fs.existsSync(this.configPath))saved=decodeJSON(fs.readFileSync(this.configPath,'utf8'));
    this.settings={agent:'codex',access:'read-only',workspace:defaultWorkspace||path.join(os.homedir(),'Lark Agent Workspace'),allowedUserId:'',larkProfile:'',...saved};
    this.execute=execute;this.spawnWorker=spawnWorker;this.worker=null;this.pendingLark=null;this.authAbort=null;
    this.snapshot={version:'0.2.0-alpha.1',settings:this.publicSettings(),bridge:{status:'stopped',taskBusy:false},connections:{lark:{status:'unchecked'},agent:{status:'unchecked'}},activity:[],auth:null,memories:[],skills:[],dataDirectory:this.dir};
  }
  async runtime(){if(!this.modules)this.modules=await Promise.all([import(pathToFileURL(path.join(this.root,'config.mjs')).href),import(pathToFileURL(path.join(this.root,'runner.mjs')).href)]);return this.modules;}
  environment(){return {...process.env,ELECTRON_RUN_AS_NODE:'1',LARK_BRIDGE_CONFIG:this.configPath};}
  publicSettings(){const {agent,access,workspace,allowedUserId,agentExecutable,larkProfile,userName}=this.settings;return {agent,access,workspace,allowedUserId,agentExecutable:agentExecutable||'',larkProfile:larkProfile||'',userName:userName||''};}
  state(){return structuredClone(this.snapshot);}
  publish(){this.snapshot.settings=this.publicSettings();this.emit('state',this.state());}
  log(message,level='info'){const item={time:new Date().toISOString(),level,message:redact(message).slice(0,1500)};this.snapshot.activity.push(item);this.snapshot.activity=this.snapshot.activity.slice(-150);this.publish();}
  assertStopped(){if(this.worker)throw new Error('Stop the bridge before changing its connection or settings.');}
  persist(){
    const config={...this.settings,stateDirectory:path.join(this.dir,'state'),skillDirectory:path.join(this.dir,'skills'),taskTimeoutMs:600000};
    delete config.agentExecutable;
    if(this.settings.agentExecutable){config.commands={...config.commands,[this.settings.agent]:/\.(?:mjs|cjs|js)$/i.test(this.settings.agentExecutable)?{command:process.execPath,args:[this.settings.agentExecutable]}:{command:this.settings.agentExecutable,args:[]}};}
    fs.writeFileSync(this.configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
    this.publish();
  }
  async saveSettings(input){this.assertStopped();this.settings=validateSettings(input,this.settings);this.persist();this.snapshot.connections.agent={status:'unchecked'};this.log('Workspace and agent settings saved.');return this.state();}
  async cliSpec({unprofiled=false}={}){const [config]=await this.runtime();const raw=this.settings.larkScript||config.resolveCommand('lark-cli');const spec=typeof raw==='string'?{command:process.execPath,args:[raw]}:raw;if(unprofiled||!this.settings.larkProfile)return spec;return {...spec,args:[...(spec.args||[]),'--profile',this.settings.larkProfile]};}
  async agentSpec(){const [config]=await this.runtime();if(this.settings.agent==='codex'&&this.settings.codexScript)return this.settings.codexScript;if(this.settings.agent==='claude'&&this.settings.claudeCommand)return this.settings.claudeCommand;const executable=this.settings.agentExecutable;return config.resolveCommand(this.settings.agent,executable?(/\.(mjs|cjs|js)$/i.test(executable)?{command:process.execPath,args:[executable]}:{command:executable,args:[]}):undefined);}
  async run(spec,args,options={}){
    if(this.execute)return this.execute(spec,args,options);
    const [,runner]=await this.runtime();
    return runner.run(spec,args,{cwd:this.dir,timeout:30000,...options,env:this.environment()});
  }
  async checkConnections(){
    this.snapshot.connections={lark:{status:'checking'},agent:{status:'checking'}};this.publish();
    await Promise.all([
      (async()=>{try{const r=await this.run(await this.cliSpec(),['auth','status','--json','--verify']);if(r.code!==0)throw new Error('Lark is not configured or the selected profile is unavailable.');const data=decodeJSON(r.stdout);const bot=data.identities?.bot,user=data.identities?.user;this.lastLark=data;this.snapshot.connections.lark={status:bot?.verified&&user?.verified?'ready':bot?.verified?'needs-login':'not-connected',appName:bot?.appName||'Lark bot',userName:user?.userName||'',userId:user?.openId||'',appId:data.appId||'',botId:bot?.openId||'',message:bot?.verified?(user?.verified?'Bot and user authorization verified.':'Bot configured. Sign in to Lark to authorize your user.'):'Connect a Lark app to continue.'};}catch(error){this.snapshot.connections.lark={status:'not-connected',message:redact(error.message)};}this.publish();})(),
      (async()=>{try{const spec=await this.agentSpec();const r=await this.run(spec,this.settings.agent==='codex'?['login','status']:['auth','status']);const data=this.settings.agent==='claude'&&r.stdout?decodeJSON(r.stdout):null;this.snapshot.connections.agent={status:r.code===0&&data?.loggedIn!==false?'ready':'needs-login',name:this.settings.agent==='codex'?'Codex':'Claude Code',message:r.code===0&&data?.loggedIn!==false?'Local sign-in detected. The first task verifies session freshness.':'Installed. Sign in to continue.'};}catch(error){this.snapshot.connections.agent={status:'not-installed',name:this.settings.agent==='codex'?'Codex':'Claude Code',message:redact(error.message)};}this.publish();})()
    ]);return this.state();
  }
  async useExistingLark(){this.assertStopped();const r=await this.run(await this.cliSpec({unprofiled:true}),['auth','status','--json','--verify']);if(r.code!==0)throw new Error('No existing Lark CLI connection was found. Connect an app below.');const data=decodeJSON(r.stdout);if(!data.identities?.bot?.verified||!data.identities?.user?.openId)throw new Error('The existing connection needs bot configuration and user sign-in first.');this.settings={...this.settings,larkProfile:'',botAppId:data.appId,botOpenId:data.identities.bot.openId,allowedUserId:data.identities.user.openId,userName:data.identities.user.userName||'User'};this.persist();this.log('Existing Lark CLI connection selected. No CLI credentials were changed.');return this.checkConnections();}
  async connectLark({appId,appSecret,brand='lark'}={}){
    this.assertStopped();if(!/^cli_[\w-]+$/.test(appId||'')||typeof appSecret!=='string'||appSecret.trim().length<4)throw new Error('Enter the App ID and App Secret from your own Lark custom app.');
    if(!['lark','feishu'].includes(brand))throw new Error('Unsupported Lark region.');
    const profile='lark-agent-desktop';
    const r=await this.run(await this.cliSpec({unprofiled:true}),['config','init','--name',profile,'--app-id',appId,'--app-secret-stdin','--brand',brand],{input:appSecret.trim()+'\n',timeout:60000});
    if(r.code!==0)throw new Error('Could not configure the app. Check its App ID, App Secret and region. No secret was saved by the desktop app.');
    this.settings={...this.settings,larkProfile:profile,botAppId:appId,botOpenId:'',allowedUserId:'',userName:''};this.persist();this.log('A separate desktop Lark profile was configured.');return this.checkConnections();
  }
  async beginLarkLogin(){
    this.assertStopped();if(this.pendingLark)throw new Error('A Lark sign-in is already waiting. Complete it or cancel it first.');
    const r=await this.run(await this.cliSpec(),['auth','login','--domain','im','--domain','docs','--domain','drive','--no-wait','--json'],{timeout:60000});
    if(r.code!==0)throw new Error('Could not start Lark authorization. Check the app configuration and permissions.');
    const data=decodeJSON(r.stdout);const body=data.data||data;
    const url=body.verification_url||body.verification_uri_complete;const code=body.device_code;
    if(!trustedURL(url)||!code)throw new Error('The CLI did not return a trusted Lark authorization link.');
    const file=path.join(this.dir,'lark-login.png');
    const qr=await this.run(await this.cliSpec(),['auth','qrcode',url,'--output','./lark-login.png']);
    if(qr.code!==0||!fs.existsSync(file))throw new Error('Could not create the authorization QR code. Please retry.');
    this.pendingLark={code,url};
    this.snapshot.auth={provider:'lark',url,qr:'data:image/png;base64,'+fs.readFileSync(file).toString('base64'),message:'Open the link or scan the QR code, approve access, then select Finish sign-in.'};
    this.publish();return this.state();
  }
  async finishLarkLogin(){
    this.assertStopped();if(!this.pendingLark)throw new Error('Start a new Lark sign-in first.');
    const r=await this.run(await this.cliSpec(),['auth','login','--device-code',this.pendingLark.code],{timeout:90000});
    if(r.code!==0)throw new Error('Authorization is not complete or has expired. Approve it in your browser, or cancel and start again.');
    this.pendingLark=null;this.snapshot.auth=null;
    await this.checkConnections();const lark=this.snapshot.connections.lark;
    if(lark.userId){this.settings={...this.settings,allowedUserId:lark.userId,userName:lark.userName,botAppId:lark.appId,botOpenId:lark.botId};this.persist();}
    this.log('Lark user authorization completed.');return this.state();
  }
  async cancelLogin(){this.authAbort?.abort();this.authAbort=null;this.pendingLark=null;this.snapshot.auth=null;this.publish();return this.state();}
  async beginAgentLogin(){
    this.assertStopped();if(this.authAbort||this.pendingLark)throw new Error('Finish or cancel the current sign-in first.');
    fs.mkdirSync(this.settings.workspace,{recursive:true});
    const spec=await this.agentSpec();const [,runner]=await this.runtime();const abort=new AbortController();this.authAbort=abort;
    this.snapshot.auth={provider:this.settings.agent,message:'Starting secure browser sign-in…',output:''};this.publish();
    const child=runner.spawnCommand(spec,this.settings.agent==='codex'?['login','--device-auth']:['auth','login'],{cwd:this.settings.workspace,env:this.environment(),detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    child.stdin.end();
    const collect=chunk=>{if(!this.snapshot.auth)return;const text=(this.snapshot.auth.output+chunk.toString()).slice(-6000).replace(/\u001b\[[0-9;]*m/g,'');this.snapshot.auth={...this.snapshot.auth,output:text,message:'Complete sign-in in your browser. Keep this window open.'};const urls=text.match(/https:\/\/[^\s<>"']+/g)||[];const url=urls.find(trustedURL);if(url)this.snapshot.auth.url=url;this.publish();};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    const cancel=()=>runner.terminateTree(child);abort.signal.addEventListener('abort',cancel,{once:true});
    const timeout=setTimeout(()=>abort.abort(),300000);
    await new Promise(resolve=>{child.once('error',error=>{this.log('Agent sign-in could not start: '+error.message,'error');resolve();});child.once('close',()=>resolve());});
    clearTimeout(timeout);abort.signal.removeEventListener('abort',cancel);this.authAbort=null;this.snapshot.auth=null;
    this.log('Agent sign-in window closed.');return this.checkConnections();
  }
  async startBridge(){
    if(this.starting)return this.starting;
    this.cancelStart=false;
    this.starting=this.startWorker().catch(error=>{if(!this.worker){this.snapshot.bridge={status:'stopped',taskBusy:false};this.publish();}throw error;}).finally(()=>{this.starting=null;});
    return this.starting;
  }
  async startWorker(){
    if(this.worker)return this.state();
    if(!this.settings.allowedUserId)throw new Error('Connect your Lark user before starting the bridge.');
    this.persist();const [config]=await this.runtime();
    // Validate this exact private configuration without changing process-wide config selection.
    const previous=process.env.LARK_BRIDGE_CONFIG;let cfg;
    try{process.env.LARK_BRIDGE_CONFIG=this.configPath;cfg=config.loadConfig(this.root);}finally{if(previous===undefined)delete process.env.LARK_BRIDGE_CONFIG;else process.env.LARK_BRIDGE_CONFIG=previous;}
    const status=await this.run(cfg.larkScript,['event','status','--json']);
    if(status.code===0){const data=decodeJSON(status.stdout);if(data.apps?.some(a=>a.running&&(!this.settings.botAppId||a.app_id===this.settings.botAppId)&&a.active_consumers>0))throw new Error('Another bridge is already listening to this Lark app. Stop that bridge first, or connect a separate Lark app.');}
    if(this.cancelStart)throw new Error('Bridge start was cancelled.');
    this.snapshot.bridge={status:'starting',taskBusy:false};this.publish();
    const options={cwd:this.root,env:this.environment(),windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']};
    const worker=this.spawnWorker?this.spawnWorker(process.execPath,[path.join(this.root,'bridge.mjs')],options):spawn(process.execPath,[path.join(this.root,'bridge.mjs')],options);
    this.worker=worker;this.stopped=new Promise(resolve=>{this.resolveStopped=resolve;});
    const consume=chunk=>{for(const line of chunk.toString().split(/\r?\n/).filter(Boolean)){
      if(line.includes('READY:')||line.includes('[source] feishu-websocket: connected'))this.snapshot.bridge.status='running';
      if(/\bcontext om_/.test(line))this.snapshot.bridge.taskBusy=true;
      if(/\btask om_.*(?:exit=|cancelled)/.test(line))this.snapshot.bridge.taskBusy=false;
      this.log(line,line.includes('Error')?'error':'info');
    }};
    worker.stdout.on('data',consume);worker.stderr.on('data',consume);
    worker.once('error',error=>{this.log('Bridge could not start: '+error.message,'error');});
    worker.once('close',code=>{this.worker=null;this.snapshot.bridge={status:code===0?'stopped':'error',taskBusy:false,exitCode:code};this.log(code===0?'Bridge stopped.':`Bridge exited (${code}). Check the activity log.`,code===0?'info':'error');this.resolveStopped?.();});
    this.log('Starting the local bridge.');return this.state();
  }
  async cancelTask(){if(!this.worker)throw new Error('The bridge is not running.');const state=path.join(this.dir,'state');fs.mkdirSync(state,{recursive:true});fs.writeFileSync(path.join(state,'cancel.request'),'cancel');this.log('Task cancellation requested. Completed changes are kept.');return this.state();}
  async stopBridge(){
    if(this.starting){this.cancelStart=true;await this.starting.catch(()=>{});}
    if(!this.worker)return this.state();
    this.snapshot.bridge.status='stopping';this.publish();
    await this.cancelTask();fs.writeFileSync(path.join(this.dir,'state','stop.request'),'stop');
    const child=this.worker;let timer;
    await Promise.race([this.stopped,new Promise(resolve=>{timer=setTimeout(async()=>{const [,runner]=await this.runtime();runner.terminateTree(child);resolve();},10000);})]);clearTimeout(timer);
    return this.state();
  }
  async readMemories(){
    const file=path.join(this.dir,'state','permanent-memory.json');
    this.snapshot.memories=fs.existsSync(file)?decodeJSON(fs.readFileSync(file,'utf8')).records.map(({key,value,updatedAt})=>({key,value,updatedAt})):[];
    const {localSkillCatalog}=await import(pathToFileURL(path.join(this.root,'skills.mjs')).href);
    this.snapshot.skills=localSkillCatalog(path.join(this.dir,'skills')).filter(s=>s.name!=='lark-workflow-memory').map(({name,metadata})=>({name,metadata}));
    this.publish();return this.state();
  }
  async dispose(){await this.cancelLogin();await this.stopBridge();}
}
module.exports={DesktopController,validateSettings,trustedURL,redact};
