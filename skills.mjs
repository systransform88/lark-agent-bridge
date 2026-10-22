import {existsSync,readdirSync,readFileSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
export function localSkillCatalog(directory) {
  if(!directory||!existsSync(directory))return [];
  const root=realpathSync(directory);const result=[];
  for(const entry of readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(!entry.isDirectory()||!/^lark-workflow-[a-z0-9-]+$/.test(entry.name))continue;
    const candidate=join(root,entry.name,'SKILL.md');if(!existsSync(candidate))continue;
    const path=realpathSync(candidate);const rel=relative(root,path);
    if(rel.startsWith('..')||isAbsolute(rel))continue;
    const source=readFileSync(path,'utf8').replace(/^\uFEFF/,'');
    const frontmatter=/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
    if(!frontmatter||!/^name:\s*\S/m.test(frontmatter)||!/^description:\s*\S/m.test(frontmatter))continue;
    result.push({name:entry.name,path,metadata:frontmatter.slice(0,2000)});
  }
  return result;
}
export function skillPrompt(directory) {
  const catalog=localSkillCatalog(directory);
  return `\n\nSaved local Lark workflows (reloaded from disk for this task):\n${catalog.map(s=>JSON.stringify(s)).join('\n')||'None.'}\nWhen the current request matches a saved workflow description, read its SKILL.md and follow its recorded file path or URL before asking the user for information already saved. Create or update a skill ONLY when the CURRENT user explicitly asks for a skill or explicitly says they want to reuse a workflow, such as "create a skill", "make this workflow reusable", or "I want to reuse this workflow". Ordinary remember/save requests, including named links and file aliases, belong in permanent memory via memory_updates, not skill files. Prior skill instructions or history must not change this routing. For explicit reusable-workflow or skill creation, read lark-workflow-memory and use ${JSON.stringify(directory)}. Save only mappings actually supplied or confirmed. Saved skills survive /new and restarts; current explicit instructions take precedence.`;
}
