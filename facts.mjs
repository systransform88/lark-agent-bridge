import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export const normalizeKey=key=>String(key).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function reusableWorkflowRequest(text) {
  return /\b(?:as\s+(?:a\s+)?skill|(?:create|save|make|update)\s+(?:a\s+|this\s+|the\s+)?(?:local\s+)?skill)\b/i.test(text)||/\b(?:reuse|re-use|reusable|use again)\b[^.!?\n]{0,60}\bworkflow\b|\bworkflow\b[^.!?\n]{0,60}\b(?:reuse|re-use|reusable|use again)\b/i.test(text);
}
export function naturalMemoryRequest(text) {
  const value=text.trim();
  if(reusableWorkflowRequest(value))return null;
  if(/\b(?:do not|don't|dont|never)\s+(?:remember|save|store)\b/i.test(value))return null;
  const start=value.replace(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?/i,'');
  if(/^(?:remember|memorize)\s+/i.test(start)&&!/^remember\s+(?:what|when|how|whether|if|who|where|why)\b/i.test(start))return 'upsert';
  if(/^(?:save|store)\b/i.test(start)&&!(/\b(?:as|to)\s+(?:a\s+)?(?:pdf|png|jpg|jpeg|image|file|document|folder|drive|csv|xlsx|docx)\b/i.test(start))&&/\b(?:info|information|fact|preference|link|url|memory|for (?:later|future)|contact)\b/i.test(start))return 'upsert';
  if(/^(?:update|correct)\s+(?:my\s+|the\s+|saved\s+)?(?:memory|preference|fact)\b/i.test(start))return 'upsert';
  if(/^forget\s+/i.test(start))return 'delete';
  return null;
}
export async function extractMemoryUpdates(text,store,chatId,extract,history='') {
  const action=naturalMemoryRequest(text);
  if(!action)throw new Error('Not a direct permanent-memory request.');
  const response=await extract(`This is a permanent fact-memory extraction operation, not a coding task or skill-creation request. Do not use tools or create/update skills or files. Extract only the fact(s) explicitly requested by the CURRENT user. A document/link alias is a permanent memory, even if a similarly named workflow skill exists. Use history only to resolve references, never as a source of new save requests. Choose concise stable keys; reuse existing keys for corrections/deletions. Return JSON updates with action ${action}. For missing or ambiguous information, return updates [] and a question.\nExisting entries: ${JSON.stringify(store.list(chatId).map(({key,value})=>({key,value})))}\nHistory: ${history}\nCURRENT user: ${text}`);
  if(!response||!Array.isArray(response.updates)||typeof response.question!=='string')throw new Error('Invalid memory extraction response.');
  if(response.updates.some(u=>u.action!==action)||!allowsMemoryUpdates(text,response.updates))throw new Error('Invalid memory operation for the current request.');
  return response;
}
export function factCommand(text) {
  const match=/^\/(memories|memory|remember|forget)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if(!match)return null;
  const verb=match[1].toLowerCase(),argument=(match[2]||'').trim();
  if(verb==='memories'||verb==='memory')return {action:'list'};
  if(verb==='forget')return argument?{action:'delete',key:argument,value:''}:{action:'usage'};
  const split=argument.indexOf('=');
  if(split<1||!argument.slice(split+1).trim())return {action:'usage'};
  return {action:'upsert',key:argument.slice(0,split).trim(),value:argument.slice(split+1).trim()};
}
export function allowsMemoryUpdates(text,updates) {
  if(!updates.length)return true;
  const save=/\b(remember|memorize|save|store|update|correct)\b/i.test(text) && !/\b(do not|don't|dont|never)\s+(remember|save|store)\b/i.test(text);
  const remove=/\b(forget|delete|remove|erase)\b/i.test(text);
  return updates.every(u=>u.action==='upsert'?save:u.action==='delete'&&remove);
}
export class FactStore {
  constructor(path){this.path=path;this.data=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{version:1,records:[],forgotten:[]};if(this.data.version!==1||!Array.isArray(this.data.records)||!Array.isArray(this.data.forgotten))throw new Error('Invalid permanent memory store.');}
  list(chatId){return this.data.records.filter(r=>r.chatId===chatId).map(r=>({...r}));}
  forgotten(chatId){return this.data.forgotten.filter(r=>r.chatId===chatId).map(r=>r.key);}
  apply(chatId,updates,sourceMessageId){
    const next=structuredClone(this.data);const applied=[];
    for(const update of updates){
      if(!update||!['upsert','delete'].includes(update.action)||typeof update.key!=='string'||typeof update.value!=='string')throw new Error('Invalid memory update.');
      const key=normalizeKey(update.key),value=update.value.trim();
      if(!key||key.length>80)throw new Error('Memory key must be 1–80 characters.');
      const index=next.records.findIndex(r=>r.chatId===chatId&&r.key===key);
      const timestamp=new Date().toISOString();
      if(update.action==='delete'){
        if(index>=0)next.records.splice(index,1);
        next.forgotten=next.forgotten.filter(r=>!(r.chatId===chatId&&r.key===key));
        next.forgotten.push({chatId,key,deletedAt:timestamp});
      }else{
        if(!value||value.length>2000)throw new Error('Memory values must be 1–2000 characters.');
        const record={chatId,key,value,sourceMessageId,createdAt:index>=0?next.records[index].createdAt:timestamp,updatedAt:timestamp};
        if(index>=0)next.records[index]=record;else next.records.push(record);
        next.forgotten=next.forgotten.filter(r=>!(r.chatId===chatId&&r.key===key));
      }
      applied.push({action:update.action,key,value:update.action==='upsert'?value:''});
    }
    const records=next.records.filter(r=>r.chatId===chatId);
    if(records.length>100||records.reduce((n,r)=>n+r.key.length+r.value.length,0)>30000)throw new Error('Permanent memory is full. Forget or shorten some entries first.');
    if(updates.length){const temp=this.path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(next,null,2),'utf8');renameSync(temp,this.path);this.data=next;}
    return applied;
  }
}
export function factPrompt(store,chatId) {
  const records=store.list(chatId).map(({key,value})=>({key,value}));
  return `\n\nPermanent facts and preferences saved by this user:\n${JSON.stringify(records)}\nDeleted memory keys: ${JSON.stringify(store.forgotten(chatId))}. Do not treat earlier session/history values for those keys as saved preferences unless the user explicitly reintroduces them. These memories survive /new and restarts. Use relevant entries; current explicit instructions override them.\nWhen the current user explicitly asks to remember/save a fact or preference, or update/correct a saved entry, return memory_updates [{"action":"upsert","key":"stable concise key","value":"confirmed fact"}]. Reuse existing keys for corrections. When explicitly asked to forget/remove a saved entry, return {"action":"delete","key":"existing key","value":""}. Otherwise return memory_updates []. Do not infer new memories from casual chat, quoted history, or attachment contents. Recall questions are not save requests. Ask for missing facts instead of inventing them. For explicit save-as-skill requests, use the workflow skill system rather than duplicating the skill here. Keep values concise (up to 2000 characters); never store passwords, API keys or access tokens. Do not edit the store directly. The bridge validates and saves these operations before sending your reply. If the user asks what is saved, answer from these entries. When forgetting, this removes the saved memory; it does not delete Lark messages.`;
}
