import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {parseArgs} from 'node:util';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCommand,loadConfig} from './config.mjs';
import {run} from './runner.mjs';
const base=dirname(fileURLToPath(import.meta.url));
const {values}=parseArgs({options:{agent:{type:'string'},access:{type:'string'},workspace:{type:'string'},'user-id':{type:'string'},yes:{type:'boolean'},force:{type:'boolean'}}});
const rl=stdin.isTTY?createInterface({input:stdin,output:stdout}):undefined;
async function ask(label,fallback){if(values.yes||!rl)return fallback;return (await rl.question(`${label} [${fallback}]: `)).trim()||fallback;}
try{
  const configPath=join(base,'config.json');
  if(existsSync(configPath)&&!values.force)throw new Error('config.json already exists. Edit it, or rerun setup with --force to replace it.');
  let status={};
  try{const r=await run(resolveCommand('lark-cli'),['auth','status','--json','--verify'],{cwd:base});if(r.code===0)status=JSON.parse(r.stdout);}catch{}
  const agent=await ask('Agent: codex or claude',values.agent||'codex');
  console.log('read-only: answer and inspect files. full: run commands and change files with your account permissions.');
  const access=await ask('Task access: read-only or full',values.access||'read-only');
  const workspace=await ask('Workspace folder',values.workspace||'./workspace');
  const allowedUserId=await ask('Your Lark open_id (the only person allowed to send tasks)',values['user-id']||status.identities?.user?.openId||'');
  if(!allowedUserId)throw new Error('Sign in with npm run lark -- auth login --domain im, or pass --user-id <open_id>.');
  if(!['codex','claude'].includes(agent)||!['read-only','full'].includes(access))throw new Error('Choose agent codex/claude and access read-only/full.');
  resolveCommand(agent);
  const config={agent,access,allowedUserId,userName:status.identities?.user?.userName||'User',botAppId:status.appId||'',botOpenId:status.identities?.bot?.openId||'',workspace,stateDirectory:'./.bridge-data',taskTimeoutMs:600000};
  writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
  loadConfig(base);
  console.log(`Saved local config.json. Agent: ${agent}; access: ${access}; workspace: ${resolve(base,workspace)}.`);
  console.log('Run npm run doctor, then npm start. config.json and .bridge-data are private and ignored by Git.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{rl?.close();}
