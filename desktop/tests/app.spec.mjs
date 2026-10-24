import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../..',import.meta.url));
async function launch(configured=false){
  const dir=mkdtempSync(join(tmpdir(),'bridge-desktop-ui-'));
  if(configured){
    const lark=join(dir,'fake-lark.mjs'),agent=join(dir,'fake-agent.mjs');
    writeFileSync(lark,`const a=process.argv.slice(2);if(a[0]==='auth')console.log(JSON.stringify({appId:'cli_test',identities:{bot:{verified:true,appName:'Test bot',openId:'ou_bot'},user:{verified:true,userName:'Test user',openId:'ou_owner'}}}));else if(a[1]==='status')console.log('{"apps":[]}');else if(a[1]==='consume'){console.error('[event] ready event_key=im.message.receive_v1');console.error('[source] feishu-websocket: connected');setInterval(()=>{},1000);process.stdin.resume();process.stdin.on('end',()=>process.exit());}else console.log('{"ok":true,"data":{"messages":[]}}');`);
    writeFileSync(agent,`console.log('Logged in using test credentials');`);
    writeFileSync(join(dir,'config.json'),JSON.stringify({agent:'codex',access:'read-only',allowedUserId:'ou_owner',botAppId:'cli_test',workspace:join(dir,'workspace'),larkScript:{command:process.execPath,args:[lark]},codexScript:agent}));
  }
  const env={...process.env,LARK_DESKTOP_DATA_DIR:dir,LARK_DESKTOP_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.LARK_DESKTOP_EXECUTABLE||require('electron'),args:process.env.LARK_DESKTOP_EXECUTABLE?[]:[join(root,'desktop')],env});
  const page=await app.firstWindow();await expect(page.locator('#bridge-status')).toHaveText('Stopped');
  return {app,page,dir};
}
test('first-run setup, private renderer, settings and memory pages',async()=>{
  const {app,page,dir}=await launch();try{
    await expect(page.locator('#start-bridge')).toBeDisabled();
    expect(await page.evaluate(()=>typeof require)).toBe('undefined');
    expect(await page.evaluate(()=>typeof window.bridge.startBridge)).toBe('function');
    mkdirSync(join(root,'desktop-artifacts'),{recursive:true});
    await page.screenshot({path:join(root,'desktop-artifacts','overview.png')});
    await page.locator('.nav[data-page=connections]').click();
    await page.locator('#workspace-input').fill(join(dir,'My work'));
    await page.locator('input[value=claude]').check();
    await page.locator('#save-settings').click();
    await expect(page.locator('#toast')).toHaveText('Settings saved.');
    await expect.poll(()=>page.evaluate(()=>window.bridge.state().then(s=>s.settings.agent))).toBe('claude');
    await page.screenshot({path:join(root,'desktop-artifacts','connections.png'),fullPage:true});
    await page.locator('.nav[data-page=memories]').click();
    await expect(page.locator('#memory-list')).toContainText('No permanent memories yet');
    await expect(page.locator('#skill-list')).toContainText('No saved workflows yet');
    await page.locator('.nav[data-page=activity]').click();
    await expect(page.locator('#activity-list')).toContainText('Workspace and agent settings saved.');
  }finally{await app.close();}
});
test('desktop starts and stops only its own worker with isolated mock connections',async()=>{
  const {app,page}=await launch(true);try{
    await page.locator('#refresh-overview').click();
    await expect(page.locator('#agent-state')).toHaveText('Connected');
    await expect(page.locator('#lark-state')).toHaveText('Connected');
    await page.locator('#start-bridge').click();
    await expect(page.locator('#bridge-status')).toHaveText('Connected',{timeout:20000});
    await page.locator('#cancel-task').click();
    await expect(page.locator('#toast')).toContainText('Cancellation requested');
    await page.locator('#stop-bridge').click();
    await expect(page.locator('#bridge-status')).toHaveText('Stopped',{timeout:20000});
    const state=await page.evaluate(()=>window.bridge.state());expect(state.bridge.exitCode).toBe(0);
    expect(state.activity.some(item=>item.message.includes('Bridge stopped.'))).toBe(true);
  }finally{await app.close();}
});
