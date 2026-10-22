export function modelCommand(text) {
  const match=/^\/(model|models)(?:\s+(.*))?$/i.exec(text.trim());
  if(!match)return null;
  if(match[1].toLowerCase()==='models')return {action:'list'};
  const model=(match[2]||'').trim();
  if(!model)return {action:'show'};
  if(model==='default')return {action:'default'};
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(model))return {action:'invalid'};
  return {action:'set',model};
}
export async function listModels(cfg,run) {
  const r=await run(cfg.codexScript,['debug','models'],{timeout:30000});
  if(r.code!==0)throw new Error('Could not load Codex models. Please try /models again.');
  const data=JSON.parse(r.stdout);
  return data.models.filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name||m.slug}));
}
