import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import api from './desktop/controller.cjs';
const {DesktopController,validateSettings,trustedURL,redact}=api;
const root=dirname(fileURLToPath(import.meta.url));
const fixture=execute=>{const dir=mkdtempSync(join(tmpdir(),'lark-desktop-'));return new DesktopController({runtimeRoot:root,dataDirectory:dir,defaultWorkspace:join(dir,'work'),execute});};
test('desktop settings persist privately and do not copy arbitrary renderer properties',async()=>{
  const c=fixture();await c.saveSettings({agent:'claude',workspace:join(c.dir,'project'),access:'read-only',allowedUserId:'ou_test',appSecret:'must-not-persist'});
  const file=readFileSync(c.configPath,'utf8');assert.ok(!file.includes('must-not-persist'));assert.equal(JSON.parse(file).agent,'claude');
  const reloaded=new DesktopController({runtimeRoot:root,dataDirectory:c.dir});assert.equal(reloaded.state().settings.allowedUserId,'ou_test');
  assert.throws(()=>validateSettings({agent:'bad',workspace:c.dir}));assert.throws(()=>validateSettings({agent:'codex',workspace:c.dir,allowedUserId:'everyone'}));
});
test('external links are restricted to trusted HTTPS authorization and documentation hosts',()=>{
  assert.equal(trustedURL('https://open.larksuite.com/app'),true);assert.equal(trustedURL('https://auth.openai.com/codex/device'),true);
  for(const url of ['javascript:alert(1)','file:///private','https://larksuite.com.attacker.test','https://user:password@claude.ai'])assert.equal(trustedURL(url),false);
});
test('app secrets are passed only through stdin to an isolated named Lark profile',async()=>{
  const calls=[];const c=fixture(async(spec,args,opts)=>{calls.push({args,opts});if(args.includes('init'))return {code:0,stdout:'{}'};return {code:0,stdout:JSON.stringify({identities:{bot:{verified:true},user:{verified:false}}})};});
  c.agentSpec=async()=>({command:'test'});await c.connectLark({appId:'cli_desktop_test',appSecret:'test-private-secret'});
  assert.ok(calls[0].args.includes('--name'));assert.ok(!JSON.stringify(calls[0].args).includes('test-private-secret'));assert.equal(calls[0].opts.input,'test-private-secret\n');
  assert.ok(!JSON.stringify(c.state()).includes('test-private-secret'));assert.ok(!readFileSync(c.configPath,'utf8').includes('test-private-secret'));
});
test('Lark sign-in keeps the device code out of renderer state and shows URL plus QR',async()=>{
  let c;c=fixture(async(spec,args)=>{
    if(args.includes('--no-wait'))return {code:0,stdout:JSON.stringify({verification_url:'https://accounts.larksuite.com/test',device_code:'private-device-code'})};
    if(args.includes('qrcode')){writeFileSync(join(c.dir,'lark-login.png'),'png');return {code:0,stdout:'{}'};}
    return {code:0,stdout:'{}'};
  });
  const state=await c.beginLarkLogin();assert.equal(state.auth.url,'https://accounts.larksuite.com/test');assert.ok(state.auth.qr.startsWith('data:image/png;base64,'));assert.ok(!JSON.stringify(state).includes('private-device-code'));
  await c.cancelLogin();assert.equal(c.state().auth,null);
});
test('another active bridge is never started or stopped by the desktop',async()=>{
  const c=fixture(async()=>({code:0,stdout:JSON.stringify({apps:[{app_id:'cli_test',running:true,active_consumers:1}]})}));
  c.settings={...c.settings,allowedUserId:'ou_test',botAppId:'cli_test',larkScript:{command:process.execPath,args:['fake']},codexScript:'fake.mjs'};
  await assert.rejects(c.startBridge(),/Another bridge/);assert.equal(c.worker,null);assert.equal(c.state().bridge.status,'stopped');
});
test('desktop memory view reads its own profile rather than another bridge installation',async()=>{
  const c=fixture();await c.readMemories();assert.deepEqual(c.state().memories,[]);assert.deepEqual(c.state().skills,[]);
  assert.ok(!existsSync(join(c.dir,'permanent-memory.json')));
});
test('diagnostics redact common credential fields',()=>{assert.ok(!redact('app_secret=do-not-log').includes('do-not-log'));});
