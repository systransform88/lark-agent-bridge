import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const blocked=/(^|\/)(config\.json|\.bridge-data|workspace|node_modules|sessions\.json|seen\.json|attachments\.json|permanent-memory\.json|chat-settings\.json|smoke-results\.json|migrated-skills|\.env)(\/|$)/;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,})\b/,/\bou_[a-f0-9]{32}\b/,/\bcli_[a-f0-9]{12,}\b/,/C:[\\/]+Users[\\/]+(?!<|YOUR_|example\b)[^\s"'<>]+/i];
const findings=[];
const localRoots=[];
if(existsSync('config.json')){const config=JSON.parse(readFileSync('config.json','utf8').replace(/^\uFEFF/,''));for(const key of ['workspace','stateDirectory','skillDirectory'])if(config[key]){const rel=relative(process.cwd(),resolve(config[key])).replaceAll('\\','/');if(rel&&!rel.startsWith('..')&&!isAbsolute(rel))localRoots.push(rel+'/');}}
for(const file of files){
  if(blocked.test(file)||localRoots.some(root=>file.startsWith(root)))findings.push(`${file}: runtime/private file is tracked`);
  const text=readFileSync(file,'utf8');
  for(const pattern of patterns)if(pattern.test(text))findings.push(`${file}: possible credential, account identity, or personal local path`);
}
if(findings.length){console.error(findings.join('\n'));process.exitCode=1;}else console.log(`Public-content check passed for ${files.length} tracked files.`);
