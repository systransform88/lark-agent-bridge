export function codexArgs({schema,images=[],workspace,sessionId,model,access='read-only'}) {
  const args=['exec','--ignore-user-config',
    '--skip-git-repo-check','--json','--output-schema',schema,'-C',workspace];
  if(access==='full')args.push('--dangerously-bypass-approvals-and-sandbox');else args.push('--sandbox','read-only');
  if(sessionId) args.push('resume',sessionId);
  if(model)args.push('--model',model);
  for(const image of images) args.push('--image',image);
  args.push('-'); return args;
}
export function parseRun(stdout) {
  const messages=[]; let sessionId; let completed=false;
  for(const line of stdout.split('\n')) { try {
    const event=JSON.parse(line);
    if(event.type==='thread.started') sessionId=event.thread_id;
    if(event.type==='turn.completed') completed=true;
    if(event.type==='item.completed'&&event.item?.type==='agent_message')messages.push(event.item.text);
  }catch{} }
  return {messages,sessionId,completed};
}
const noise=/^(Received\. (?:Codex|The agent) is working on your task\.|Attachment received and ready\.|(?:Codex|Agent) bridge is online\.|Attachment context cleared\.|Started a new conversation\.)/;
export function historyTranscript(messages,event,cfg) {
  const currentIndex=messages.findIndex(m=>m.message_id===event.message_id);
  const older=currentIndex>=0?messages.slice(currentIndex+1):messages;
  const dedup=new Set(); const rows=[];
  for(const msg of older) {
    if(msg.deleted||msg.chat_id!==event.chat_id||dedup.has(msg.message_id))continue;
    const owner=msg.sender?.id===cfg.allowedUserId;
    const bot=Boolean(cfg.botAppId&&msg.sender?.id===cfg.botAppId) || Boolean(cfg.botOpenId&&msg.sender?.open_bot_id===cfg.botOpenId);
    if(!owner&&!bot)continue;
    const content=String(msg.content||'');
    if((bot&&noise.test(content))||(owner&&/^\/(status|new|clearfiles|stop|models?|memories|memory|remember|forget)(?:\s+.*)?$/i.test(content)))continue;
    dedup.add(msg.message_id);
    rows.push({id:msg.message_id,role:owner?(cfg.userName||'User'):'Assistant',time:msg.create_time,type:msg.msg_type,replyTo:msg.reply_to,text:content.length>6000?content.slice(0,6000)+' [message truncated]':content});
  }
  const kept=[]; let size=0;
  for(const row of rows.slice(0,60)) {
    const line=JSON.stringify(row);
    if(size+line.length>50000)break;
    kept.push(line); size+=line.length;
  }
  return {text:kept.reverse().join('\n'),count:kept.length};
}
export async function fetchHistory(event,cfg,run,since) {
  const args=['im','+chat-messages-list','--chat-id',event.chat_id,'--as','bot','--order','desc',
    '--page-size','50','--page-all','--page-limit','3','--no-reactions','--format','json'];
  const time=Number(event.create_time);
  if(Number.isFinite(time)&&time>0)args.push('--end',new Date(time).toISOString());
  if(since)args.push('--start',new Date(since).toISOString());
  const result=await run(cfg.larkScript,args,{timeout:60000});
  if(result.code!==0)throw new Error(`Chat history unavailable: ${(result.stderr||result.stdout).slice(-1000)}`);
  const envelope=JSON.parse(result.stdout);
  if(!envelope.ok)throw new Error('Lark could not return conversation history.');
  const messages=envelope.data.messages||[];
  const quoted=event.reply_to||event.root_id;
  if(quoted&&!messages.some(m=>m.message_id===quoted)) {
    const quoteResult=await run(cfg.larkScript,['im','+messages-mget','--message-ids',quoted,'--as','bot','--no-reactions','--format','json'],{timeout:30000});
    if(quoteResult.code===0) {
      const quoteEnvelope=JSON.parse(quoteResult.stdout);
      if(quoteEnvelope.ok)messages.push(...(quoteEnvelope.data.messages||[]));
    }
  }
  return historyTranscript(messages,event,cfg);
}
