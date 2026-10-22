import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from './config.mjs';
test('missing and placeholder identity fail closed',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bridge-config-'));
  assert.throws(()=>loadConfig(dir),/setup/);
  writeFileSync(join(dir,'config.json'),JSON.stringify({allowedUserId:'REPLACE_WITH_YOUR_LARK_OPEN_ID'}));
  assert.throws(()=>loadConfig(dir),/allowedUserId/);
});
test('relative directories resolve beside the config and access defaults to read-only',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bridge-config-'));
  writeFileSync(join(dir,'config.json'),JSON.stringify({allowedUserId:'owner',workspace:'work',larkScript:'fake.mjs',codexScript:'fake.mjs'}));
  const cfg=loadConfig(dir,{createDirectories:false});
  assert.equal(cfg.workspace,join(dir,'work'));assert.equal(cfg.access,'read-only');assert.equal(cfg.stateDirectory,join(dir,'.bridge-data'));
});
