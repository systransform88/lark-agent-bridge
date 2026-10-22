import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=dirname(fileURLToPath(import.meta.url));
const configPath=process.env.LARK_BRIDGE_CONFIG?resolve(process.env.LARK_BRIDGE_CONFIG):join(base,'config.json');
const cfg=JSON.parse(readFileSync(configPath,'utf8'));
const state=resolve(dirname(configPath),cfg.stateDirectory||'.bridge-data');
if(!existsSync(join(state,'bridge.lock'))){console.log('Bridge is not running.');}
else{writeFileSync(join(state,'stop.request'),'stop');console.log('Graceful shutdown requested. An active task may finish first. Use /stop in Lark to cancel it.');}
