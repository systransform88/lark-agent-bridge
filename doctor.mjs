import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.mjs';
import {run} from './runner.mjs';
try{
  const cfg=loadConfig(dirname(fileURLToPath(import.meta.url)));
  console.log(`Node ${process.version}; agent ${cfg.agent}; access ${cfg.access}`);
  const lark=await run(cfg.larkScript,['auth','status','--json','--verify']);
  if(lark.code!==0)throw new Error('Lark credentials are not ready. Run npm run lark -- config init and auth login.');
  const status=JSON.parse(lark.stdout);
  if(!status.identities?.bot?.verified)throw new Error('Lark bot credentials are not verified.');
  if(cfg.botAppId&&cfg.botAppId!==status.appId)throw new Error('Configured botAppId does not match the current Lark CLI app. Rerun setup for the correct app.');
  console.log('Lark bot credentials: verified');
  console.log(`Allowed user configured: ${Boolean(cfg.allowedUserId)}. App identity matches: ${!cfg.botAppId||cfg.botAppId===status.appId}`);
  const agent=await run(cfg.agent==='claude'?cfg.claudeCommand:cfg.codexScript,cfg.agent==='claude'?['auth','status']:['login','status']);
  if(agent.code!==0)throw new Error(`${cfg.agent} authentication is not ready. Sign in using its CLI.`);
  console.log('Agent login: configured (the first model request verifies session freshness)');
  console.log('Ready for npm start. The first start verifies event-listener readiness; send /status to the bot for an end-to-end test.');
}catch(error){console.error(error.message);process.exitCode=1;}
