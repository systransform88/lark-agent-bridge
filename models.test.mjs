import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelCommand,listModels} from './models.mjs';
import {codexArgs} from './memory.mjs';
test('model commands support showing, listing, selecting and resetting',()=>{
  assert.deepEqual(modelCommand('/model'),{action:'show'});
  assert.deepEqual(modelCommand('/models'),{action:'list'});
  assert.deepEqual(modelCommand('/model gpt-6.1-sol'),{action:'set',model:'gpt-6.1-sol'});
  assert.deepEqual(modelCommand('/model default'),{action:'default'});
  assert.equal(modelCommand('/model --model bad').action,'invalid');
  assert.equal(modelCommand('please explain models'),null);
});
test('live model list excludes hidden tools',async()=>{
  const models=await listModels({codexScript:'codex'},async()=>({code:0,stdout:JSON.stringify({models:[{slug:'visible',visibility:'list'},{slug:'hidden',visibility:'hide'}]})}));
  assert.deepEqual(models,[{id:'visible',name:'visible'}]);
});
test('explicit model is forwarded for new and resumed sessions',()=>{
  for(const sessionId of [undefined,'session']) {
    const args=codexArgs({schema:'schema',workspace:'workspace',sessionId,model:'gpt-6.1-sol'});
    assert.equal(args[args.indexOf('--model')+1],'gpt-6.1-sol');
  }
});
