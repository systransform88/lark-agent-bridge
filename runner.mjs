import {spawn} from 'node:child_process';
export function spawnCommand(spec,args,options={}) {
  const command=typeof spec==='string'?{command:process.execPath,args:[spec]}:spec;
  return spawn(command.command,[...(command.args||[]),...args],{windowsHide:true,shell:false,...options});
}
export function terminateTree(child) {
  if(!child.pid)return;
  if(process.platform==='win32') {
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});
    killer.on('error',()=>child.kill());
   }else {try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1000).unref();}
}
export function run(script,args,{cwd,input,timeout=60000,signal}={}) {
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child=spawnCommand(script,args,{cwd,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',expired=false,aborted=false;
    child.stdout.on('data',d=>{stdout=(stdout+d).slice(-2000000);});
    child.stderr.on('data',d=>{stderr=(stderr+d).slice(-12000);});
    const cancel=()=>{aborted=true;terminateTree(child);};
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>{expired=true;terminateTree(child);},timeout);
    function cleanup(){clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    child.once('error',error=>{cleanup();reject(error);});
    child.once('close',code=>{cleanup();if(aborted)reject(new DOMException('Task stopped by user.','AbortError'));else resolve({code,stdout,stderr,expired});});
    child.stdin.on('error',()=>{});child.stdin.end(input||'');
    if(signal?.aborted)cancel();
  });
}
