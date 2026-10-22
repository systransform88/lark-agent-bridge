import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligible, chunks } from './bridge.mjs';
const valid = {type:'im.message.receive_v1', sender_type:'user', sender_id:'owner', chat_type:'p2p', message_type:'text', message_id:'om_123', content:'test'};
test('only owner direct text, PDF file, and image messages can execute', () => {
  assert.equal(eligible(valid, 'owner'), true);
  assert.equal(eligible({...valid,message_type:'file'}, 'owner'), true);
  assert.equal(eligible({...valid,message_type:'image',content:''}, 'owner'), true);
  for (const change of [{sender_id:'stranger'}, {sender_type:'bot'}, {chat_type:'group'}, {message_type:'audio'}, {message_id:'bad'}, {content:''}]) assert.equal(eligible({...valid,...change}, 'owner'), false);
});
test('reply chunks preserve Unicode and content', () => {
  const text = 'hello 😀 文档 '.repeat(1000); const parts = chunks(text);
  assert.equal(parts.join(''), text); assert.ok(parts.every(p => p.length <= 2500));
});
