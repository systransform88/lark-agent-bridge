import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {codexArgs,parseRun} from './memory.mjs';
export function claudeInput(prompt,images=[]) {
  const content=[{type:'text',text:prompt}];
  for(const path of images){
    const mediaType=({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'})[extname(path).toLowerCase()];
    if(!mediaType)throw new Error('Unsupported Claude image format.');
    content.push({type:'image',source:{type:'base64',media_type:mediaType,data:readFileSync(path).toString('base64')}});
  }
  return JSON.stringify({type:'user',message:{role:'user',content}})+'\n';
}
export function claudeArgs({schema,sessionId,model,access='read-only',ephemeral=false}) {
  const args=['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--json-schema',readFileSync(schema,'utf8'),'--strict-mcp-config'];
  if(ephemeral)args.push('--no-session-persistence','--permission-mode','dontAsk','--tools','');
  else if(access==='full')args.push('--dangerously-skip-permissions');
  else args.push('--permission-mode','dontAsk','--tools','Read,Glob,Grep');
  if(sessionId)args.push('--resume',sessionId);
  if(model)args.push('--model',model);
  return args;
}
export function parseClaude(stdout){
  let result;
  try{result=JSON.parse(stdout);}catch{for(const line of stdout.split('\n')){try{const event=JSON.parse(line);if(event.type==='result')result=event;}catch{}}}
  if(!result)throw new Error('Claude Code returned no result event.');
  if(result.is_error||!['success',undefined].includes(result.subtype))throw new Error(result.result||result.errors?.join('\n')||'Claude Code run failed.');
  if(!result.structured_output)throw new Error('Claude Code returned no structured output. Check your CLI version and schema support.');
  return {messages:[JSON.stringify(result.structured_output)],sessionId:result.session_id,completed:true};
}
export async function runAgent(cfg,{schema,images=[],sessionId,model,input,signal,ephemeral=false,timeout=cfg.taskTimeoutMs},run){
  if(cfg.agent==='claude'){
    const r=await run(cfg.claudeCommand,claudeArgs({schema,sessionId,model,access:cfg.access,ephemeral}),{cwd:cfg.workspace,input:claudeInput(input,images),signal,timeout});
    if(r.code!==0&&!r.expired){try{parseClaude(r.stdout);}catch(error){return {...r,messages:[],completed:false,stderr:error.message};}}
    return {...r,...(r.code===0&&!r.expired?parseClaude(r.stdout):{messages:[],completed:false})};
  }
  const args=codexArgs({schema,images,sessionId,model,workspace:cfg.workspace,access:ephemeral?'read-only':cfg.access});
  if(ephemeral)args.splice(1,0,'--ephemeral');
  const r=await run(cfg.codexScript,args,{cwd:cfg.workspace,input,signal,timeout});
  return {...r,...parseRun(r.stdout)};
}
export async function agentModels(cfg,run){
  if(cfg.agent==='claude')return (cfg.claudeModels||['sonnet','opus']).map(id=>({id,name:id}));
  const r=await run(cfg.codexScript,['debug','models'],{timeout:30000});
  if(r.code!==0)throw new Error('Could not load Codex model choices.');
  return JSON.parse(r.stdout).models.filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name||m.slug}));
}
