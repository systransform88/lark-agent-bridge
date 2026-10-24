import {existsSync,readFileSync,mkdirSync,copyFileSync,accessSync,constants,realpathSync} from 'node:fs';
import {join,resolve,dirname,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function findProgram(name) {
  if(name.includes('/')||name.includes('\\')){if(existsSync(name))return realpathSync(name);throw new Error(`Executable not found: ${name}`);}
  const extensions=process.platform==='win32'?['.exe','.cmd']:[''];
  for(const folder of (process.env.PATH||'').split(delimiter))for(const extension of extensions){
    const candidate=join(folder,name+extension);try{accessSync(candidate,process.platform==='win32'?constants.F_OK:constants.X_OK);return realpathSync(candidate);}catch{}
  }
  throw new Error(`${name} is not on PATH. Install it and sign in before starting the bridge.`);
}
export function resolveCommand(name,override) {
  if(override){if(typeof override!=='object'||typeof override.command!=='string'||(override.args&&!Array.isArray(override.args)))throw new Error('Command override must be {command, args}.');return {command:findProgram(override.command),args:override.args||[]};}
  if(name==='lark-cli'){
    const cliRoot=dirname(require.resolve('@larksuite/cli/package.json'));
    const native=join(cliRoot,'bin','lark-cli'+(process.platform==='win32'?'.exe':''));
    // Prefer the installed native CLI so agents can invoke it without a Node shell shim.
    if(existsSync(native))return {command:native,args:[]};
    return {command:process.execPath,args:[join(cliRoot,'scripts','run.js')]};
  }
  const executable=findProgram(name);
  if(/\.cmd$/i.test(executable)){
    const packageName=name==='codex'?'@openai/codex/bin/codex.js':'@anthropic-ai/claude-code/cli.js';
    const script=join(dirname(executable),'node_modules',packageName);
    if(existsSync(script))return {command:process.execPath,args:[script]};
    throw new Error(`Cannot launch ${executable} without a shell. Configure commands.${name} with its native executable or Node entrypoint.`);
  }
  return {command:executable,args:[]};
}
export function loadConfig(base,{createDirectories=true}={}) {
  const path=process.env.LARK_BRIDGE_CONFIG?resolve(process.env.LARK_BRIDGE_CONFIG):join(base,'config.json');
  if(!existsSync(path))throw new Error('No config.json found. Run npm run setup first.');
  const raw=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
  if(!raw.allowedUserId||raw.allowedUserId.includes('REPLACE_'))throw new Error('Set your own allowedUserId with npm run setup. The bridge never accepts messages from everyone.');
  const agent=raw.agent||'codex',access=raw.access||'read-only';
  if(!['codex','claude'].includes(agent))throw new Error('agent must be codex or claude.');
  if(!['read-only','full'].includes(access))throw new Error('access must be read-only or full.');
  const workspace=resolve(dirname(path),raw.workspace||'workspace');
  const stateDirectory=resolve(dirname(path),raw.stateDirectory||'.bridge-data');
  const skillDirectory=resolve(dirname(path),raw.skillDirectory||join(stateDirectory,'skills'));
  const cfg={...raw,agent,access,workspace,stateDirectory,skillDirectory,taskTimeoutMs:raw.taskTimeoutMs||600000,userName:raw.userName||'User'};
  cfg.larkScript=raw.larkScript||resolveCommand('lark-cli',raw.commands?.lark);
  if(raw.larkProfile){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(raw.larkProfile))throw new Error('Invalid Lark profile name.');
    const command=typeof cfg.larkScript==='string'?{command:process.execPath,args:[cfg.larkScript]}:cfg.larkScript;
    cfg.larkScript={...command,args:[...(command.args||[]),'--profile',raw.larkProfile]};
  }
  cfg.codexScript=raw.codexScript||(agent==='codex'?resolveCommand('codex',raw.commands?.codex):undefined);
  cfg.claudeCommand=raw.claudeCommand||(agent==='claude'?resolveCommand('claude',raw.commands?.claude):undefined);
  if(createDirectories){
    for(const dir of [workspace,stateDirectory,skillDirectory])mkdirSync(dir,{recursive:true});
    const helper=join(skillDirectory,'lark-workflow-memory','SKILL.md');
    if(!existsSync(helper)){mkdirSync(dirname(helper),{recursive:true});copyFileSync(join(base,'templates','lark-workflow-memory','SKILL.md'),helper);}
  }
  return cfg;
}
