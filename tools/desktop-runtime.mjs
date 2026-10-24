import {existsSync,readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,cpSync,rmSync,realpathSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=realpathSync(dirname(dirname(fileURLToPath(import.meta.url))));
const target=join(root,'.desktop-runtime');
if(existsSync(target)){if(realpathSync(target)!==target)throw new Error('Refusing to replace a runtime directory that points outside the project.');rmSync(target,{recursive:true,force:true});}
mkdirSync(target,{recursive:true});
for(const file of readdirSync(root))if(file.endsWith('.mjs')&&!file.endsWith('.test.mjs'))copyFileSync(join(root,file),join(target,file));
for(const file of ['output-schema.json','memory-schema.json','package.json','package-lock.json','LICENSE'])copyFileSync(join(root,file),join(target,file));
cpSync(join(root,'templates'),join(target,'templates'),{recursive:true});
const npmCLI=process.env.npm_execpath;
if(!npmCLI)throw new Error('Run this builder through npm run desktop:runtime.');
const result=spawnSync(process.execPath,[npmCLI,'ci','--omit=dev','--no-audit','--no-fund'],{cwd:target,stdio:'inherit',shell:false});
if(result.status!==0)process.exit(result.status||1);
const allowed=new Set(['node_modules','templates','output-schema.json','memory-schema.json','package.json','package-lock.json','LICENSE',...readdirSync(root).filter(f=>f.endsWith('.mjs')&&!f.endsWith('.test.mjs'))]);
for(const item of readdirSync(target))if(!allowed.has(item))throw new Error(`Unexpected packaged runtime file: ${item}`);
console.log('Desktop runtime prepared from source and production dependencies only.');
