import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {claudeArgs,claudeInput,parseClaude,runAgent} from './agents.mjs';
import {codexArgs} from './memory.mjs';
const dir=mkdtempSync(join(tmpdir(),'agent-adapters-')),schema=join(dir,'schema.json');writeFileSync(schema,'{"type":"object"}');
test('full access is opt-in for either backend',()=>{
  assert.ok(!codexArgs({schema,workspace:dir}).includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(codexArgs({schema,workspace:dir,access:'full'}).includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(!claudeArgs({schema}).includes('--dangerously-skip-permissions'));
  assert.ok(claudeArgs({schema,access:'full'}).includes('--dangerously-skip-permissions'));
});
test('Claude structured outputs and session ids normalize to the bridge protocol',()=>{
  const parsed=parseClaude(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:'claude-session',structured_output:{reply:'done',attachments:[],memory_updates:[]}}));
  assert.equal(parsed.sessionId,'claude-session');assert.equal(JSON.parse(parsed.messages[0]).reply,'done');
  assert.throws(()=>parseClaude('{"is_error":true,"result":"not logged in"}'),/not logged in/);
  assert.equal(parseClaude('{"type":"system","subtype":"init"}\n{"type":"result","subtype":"success","session_id":"streamed","structured_output":{"reply":"ok"}}').sessionId,'streamed');
});
test('Claude image inputs use actual bytes and typed content',()=>{
  const image=join(dir,'pixel.png');writeFileSync(image,Buffer.from('test'));
  const message=JSON.parse(claudeInput('inspect',[image]));
  assert.equal(message.message.content[1].source.media_type,'image/png');
  assert.equal(message.message.content[1].source.data,Buffer.from('test').toString('base64'));
});
test('backend selection uses the selected executable and session',async()=>{
  let called;
  const result=await runAgent({agent:'claude',access:'read-only',workspace:dir,claudeCommand:{command:'claude'},taskTimeoutMs:10000},{schema,input:'test',sessionId:'saved'},async(spec,args)=>{called={spec,args};return {code:0,stdout:JSON.stringify({subtype:'success',session_id:'saved',structured_output:{reply:'ok'}})};});
  assert.equal(called.spec.command,'claude');assert.ok(called.args.includes('--resume'));assert.equal(result.sessionId,'saved');
});
