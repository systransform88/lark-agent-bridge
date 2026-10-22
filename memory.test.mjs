import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codexArgs,historyTranscript,fetchHistory,parseRun} from './memory.mjs';
const cfg={allowedUserId:'owner',botAppId:'app',larkScript:'lark'};
const event={chat_id:'chat',message_id:'current',create_time:'1792700000000'};
const msg=(id,text,sender='owner')=>({chat_id:'chat',message_id:id,content:text,sender:{id:sender},msg_type:'text'});
test('history preserves earlier URLs and replies, ignores future and bot noise',()=>{
  const r=historyTranscript([msg('future','future'),msg('current','yes'),msg('ack','Received. Codex is working on your task.','app'),msg('answer','Add both?','app'),msg('url','https://example.com/doc'),msg('stranger','unrelated','other')],event,cfg);
  assert.equal(r.count,2);assert.ok(r.text.indexOf('example.com')<r.text.indexOf('Add both?'));assert.ok(!r.text.includes('future'));assert.ok(!r.text.includes('unrelated'));
});
test('resumption targets only the saved chat session and persists it',()=>{
  const args=codexArgs({schema:'schema.json',images:['a.png'],workspace:'project',sessionId:'exact-id'});
  assert.ok(!args.includes('--ephemeral'));assert.ok(!args.includes('--last'));
  assert.deepEqual(args.slice(args.indexOf('resume')),['resume','exact-id','--image','a.png','-']);
});
test('history ends at the triggering message and supports reset boundary',async()=>{
  let captured;
  await fetchHistory(event,cfg,async(s,args)=>{captured=args;return {code:0,stdout:JSON.stringify({ok:true,data:{messages:[]}})};},1792600000000);
  assert.ok(captured.includes('--end'));assert.ok(captured.includes('--start'));assert.ok(captured.includes('--page-limit'));
});
test('session identity and completion are extracted from Codex JSON events',()=>{
  const r=parseRun('{"type":"thread.started","thread_id":"id"}\n{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n{"type":"turn.completed"}');
  assert.equal(r.sessionId,'id');assert.equal(r.completed,true);assert.deepEqual(r.messages,['done']);
});
