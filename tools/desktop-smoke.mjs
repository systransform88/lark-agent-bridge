import {existsSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const output=join(root,'dist','desktop');
let executable;
if(process.platform==='win32')executable=join(output,'win-unpacked','Lark Agent Bridge.exe');
else if(process.platform==='linux')executable=join(output,'linux-unpacked','lark-agent-bridge-desktop');
else{const directory=readdirSync(output).find(name=>name==='mac'||name.startsWith('mac-'));if(directory)executable=join(output,directory,'Lark Agent Bridge.app','Contents','MacOS','Lark Agent Bridge');}
if(!executable||!existsSync(executable))throw new Error('Build the desktop app before running its packaged smoke tests.');
const env={...process.env,LARK_DESKTOP_EXECUTABLE:executable};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(process.execPath,[join(root,'node_modules','@playwright','test','cli.js'),'test','--config','desktop/playwright.config.mjs'],{cwd:root,env,stdio:'inherit',shell:false});
if(result.error)throw result.error;
process.exitCode=result.status??1;
