import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FactStore,factCommand,allowsMemoryUpdates,factPrompt,naturalMemoryRequest,extractMemoryUpdates,reusableWorkflowRequest} from './facts.mjs';
const fixture=()=>new FactStore(join(mkdtempSync(join(tmpdir(),'lark-facts-')),'facts.json'));
test('facts persist across restarts and remain isolated per chat',()=>{
  const store=fixture();store.apply('chat',[{action:'upsert',key:'John contact',value:'WhatsApp'}],'om_test');
  const restarted=new FactStore(store.path);
  assert.equal(restarted.list('chat')[0].value,'WhatsApp');assert.equal(restarted.list('other').length,0);
  assert.ok(factPrompt(restarted,'chat').includes('WhatsApp'));
});
test('corrections update existing keys and forgetting removes the saved value',()=>{
  const store=fixture();store.apply('chat',[{action:'upsert',key:'John contact',value:'WhatsApp'}],'one');
  store.apply('chat',[{action:'upsert',key:'JOHN CONTACT',value:'Email'}],'two');
  assert.equal(store.list('chat').length,1);assert.equal(store.list('chat')[0].value,'Email');
  store.apply('chat',[{action:'delete',key:'john contact',value:''}],'three');
  assert.equal(new FactStore(store.path).list('chat').length,0);
  assert.ok(!readFileSync(store.path,'utf8').includes('Email'));assert.deepEqual(store.forgotten('chat'),['john contact']);
});
test('invalid batches leave disk and live state unchanged',()=>{
  const store=fixture();
  assert.throws(()=>store.apply('chat',[{action:'upsert',key:'valid',value:'yes'},{action:'upsert',key:'bad',value:''}],'om'));
  assert.equal(store.list('chat').length,0);
});
test('commands parse and natural-language writes require explicit intent',()=>{
  assert.deepEqual(factCommand('/remember john contact = WhatsApp'),{action:'upsert',key:'john contact',value:'WhatsApp'});
  assert.equal(factCommand('/memories').action,'list');assert.equal(factCommand('/forget john contact').action,'delete');
  const save=[{action:'upsert',key:'john',value:'WhatsApp'}];
  assert.equal(allowsMemoryUpdates('Remember John prefers WhatsApp',save),true);
  assert.equal(allowsMemoryUpdates('Describe this image',save),false);
  assert.equal(allowsMemoryUpdates("Don't remember this",save),false);
  assert.equal(allowsMemoryUpdates('Forget John preference',[{action:'delete',key:'john',value:''}]),true);
});
test('remembered links route to facts, while explicit skill and file-generation requests do not',()=>{
  assert.equal(naturalMemoryRequest('Remember this testing link https://example.com/testing'),'upsert');
  assert.equal(naturalMemoryRequest('Please remember John prefers WhatsApp'),'upsert');
  assert.equal(naturalMemoryRequest('Save this link for later https://example.com'),'upsert');
  assert.equal(naturalMemoryRequest('Save this as a skill: customer lookup'),null);
  assert.equal(naturalMemoryRequest('Remember this as a skill'),null);
  assert.equal(naturalMemoryRequest('Remember this workflow; I want to reuse this workflow'),null);
  assert.equal(reusableWorkflowRequest('Make this workflow reusable'),true);
  assert.equal(reusableWorkflowRequest('I want to reuse this workflow'),true);
  assert.equal(reusableWorkflowRequest('Remember this testing link'),false);
  assert.equal(naturalMemoryRequest('Save this document as PDF'),null);
  assert.equal(naturalMemoryRequest('Remember what I said earlier?'),null);
});
test('fact extraction uses only the permanent store despite earlier skill context',async()=>{
  const store=fixture();let prompt;
  const result=await extractMemoryUpdates('Remember this testing link https://example.com/testing',store,'chat',async input=>{prompt=input;return {updates:[{action:'upsert',key:'testing link',value:'https://example.com/testing'}],question:''};},'Earlier: save workflows as skills.');
  store.apply('chat',result.updates,'om_testing');
  assert.equal(new FactStore(store.path).list('chat')[0].value,'https://example.com/testing');
  assert.ok(prompt.includes('not a coding task or skill-creation request'));
});
