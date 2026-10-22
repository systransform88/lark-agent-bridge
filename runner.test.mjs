import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {run} from './runner.mjs';
test('pre-cancelled tasks never spawn',()=>{
  const controller=new AbortController();controller.abort();
  assert.throws(()=>run('never-start.mjs',[],{signal:controller.signal}),{name:'AbortError'});
});
test('stop kills the spawned worker and its child process, and next task can run',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lark-stop-'));
  const fixture=join(directory,'worker.mjs');const pidFile=join(directory,'child.pid');
  writeFileSync(fixture,`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'inherit'});writeFileSync(process.argv[2],String(child.pid));setInterval(()=>{},1000);`);
  const controller=new AbortController();
  const running=run(fixture,[pidFile],{cwd:directory,signal:controller.signal,timeout:15000});
  const rejection=assert.rejects(running,{name:'AbortError'});
  for(let i=0;i<100&&!existsSync(pidFile);i++)await delay(50);
  assert.ok(existsSync(pidFile),'child process started');
  const pid=Number(readFileSync(pidFile,'utf8'));controller.abort();await rejection;
  let alive=true;for(let i=0;i<40;i++){try{process.kill(pid,0);}catch{alive=false;break;}await delay(50);}
  assert.equal(alive,false,'child process must be gone');
  const next=join(directory,'next.mjs');writeFileSync(next,'console.log("NEXT_OK")');
  assert.equal((await run(next,[],{cwd:directory})).stdout.trim(),'NEXT_OK');
});
