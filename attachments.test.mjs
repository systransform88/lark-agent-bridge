import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachmentKind, confinedFile, downloadAttachments, taskAttachments } from './attachments.mjs';
const workspace = mkdtempSync(join(tmpdir(),'lark-attachments-'));
mkdirSync(join(workspace,'lark-im-resources'));
const image = join(workspace,'lark-im-resources','image.bin');
writeFileSync(image, Buffer.from([137,80,78,71,13,10,26,10,0]));
test('accept signatures rather than untrusted filenames', () => {
  assert.equal(attachmentKind(image),'image');
  const invalid = join(workspace,'lark-im-resources','fake.pdf'); writeFileSync(invalid,'executable content');
  assert.throws(() => attachmentKind(invalid), /Unsupported/);
});
test('reject files outside download folder', () => {
  const outside = join(workspace,'outside.png'); writeFileSync(outside,'test');
  assert.equal(confinedFile(workspace,image),image);
  assert.throws(() => confinedFile(workspace,outside), /outside/);
});
test('download errors and sender mismatches do not enter context', async () => {
  const event = {message_id:'om_test',chat_id:'oc_test'};
  const cfg = {workspace,allowedUserId:'owner'};
  const payload = {message_id:'om_test',chat_id:'oc_test',sender:{id:'owner'},resources:[{error:true}]};
  const runner = async () => ({code:0,stdout:JSON.stringify({ok:true,data:{messages:[payload]}})});
  await assert.rejects(downloadAttachments(event,cfg,runner), /could not download/);
  payload.sender.id = 'stranger';
  await assert.rejects(downloadAttachments(event,cfg,runner), /does not match/);
});
test('visual inputs are bounded while full manifests remain available', () => {
  const manifest = Array.from({length:10},(_,n)=>({path:`pdf${n}`,images:[`image${n}`]}));
  const output = taskAttachments(manifest);
  assert.equal(output.images.length,6); assert.equal(output.images.at(-1),'image9');
  assert.ok(output.description.includes('pdf0'));
});
