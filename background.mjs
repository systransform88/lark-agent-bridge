import {spawn} from 'node:child_process';
import {openSync,closeSync,existsSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.mjs';
const base=dirname(fileURLToPath(import.meta.url)),cfg=loadConfig(base);
const lock=join(cfg.stateDirectory,'bridge.lock');
if(existsSync(lock)){const pid=Number(readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)throw new Error(`Bridge already running (PID ${pid}).`);}
const out=openSync(join(cfg.stateDirectory,'bridge.log'),'a'),err=openSync(join(cfg.stateDirectory,'bridge-error.log'),'a');
const child=spawn(process.execPath,[join(base,'bridge.mjs')],{cwd:base,windowsHide:true,detached:true,stdio:['ignore',out,err]});
child.on('error',error=>console.error(error));child.unref();closeSync(out);closeSync(err);
console.log(`Bridge launched (PID ${child.pid}). Logs are in ${cfg.stateDirectory}.`);
