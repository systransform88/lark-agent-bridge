import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTaskResult, outputFile, deliverOutputs } from './outputs.mjs';
const parent = mkdtempSync(join(tmpdir(),'lark-outputs-')); const dir=join(parent,'task'); mkdirSync(dir);
writeFileSync(join(dir,'report.pdf'),'pdf fixture'); writeFileSync(join(dir,'photo.png'),'image fixture');
writeFileSync(join(parent,'private.txt'),'do not send');
test('manifest requires explicit file paths and reply', () => {
  assert.deepEqual(parseTaskResult('{"reply":"done","attachments":[]}'),{reply:'done',attachments:[]});
  assert.throws(()=>parseTaskResult('{"reply":"done","attachments":[{}]}'));
});
test('only actual files inside the task output folder can be sent', () => {
  assert.equal(outputFile(dir,'report.pdf').image,false);
  assert.equal(outputFile(dir,'photo.png').image,true);
  assert.throws(()=>outputFile(dir,'../private.txt'),/outside/);
  assert.throws(()=>outputFile(dir,join(parent,'private.txt')),/relative/);
  assert.throws(()=>outputFile(dir,'https://example.com/x'),/relative/);
});
test('uploads use bot replies, deduplicate, and report partial failures', async () => {
  const calls=[]; const runner=async (script,args,opts)=>{calls.push({args,opts});return {code:args.includes('--image')?1:0,stderr:'image upload failed'};};
  const result=await deliverOutputs({directory:dir,paths:['report.pdf','report.pdf','photo.png','../private.txt'],messageId:'om_test',cfg:{larkScript:'lark'},run:runner});
  assert.deepEqual(result.sent,['report.pdf']); assert.equal(result.errors.length,2); assert.equal(calls.length,2);
  assert.ok(calls[0].args.includes('--file')); assert.ok(calls[1].args.includes('--image'));
  assert.equal(calls[0].opts.cwd,dir); assert.ok(calls[0].args.includes('bot'));
});
