import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {parseEnv} from 'node:util';
const env=parseEnv(readFileSync('.dev.vars','utf8'));
if(env.LOCAL_TEST_MODE!=='true'||!env.LOCAL_CRON_TOKEN)throw new Error('Perfil local de teste necessário.');
const lineId=process.argv[2]??'atendimento';const line=JSON.parse(env.UAZAPI_INSTANCES??'[]').find(item=>item.id===lineId);
if(!line?.baseUrl)throw new Error('Linha local não configurada.');
const statePath=`.local-runtime/history-${lineId}.json`;
if(!/^[a-z0-9-]{1,64}$/.test(lineId))throw new Error('Linha inválida.');
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{chats:[],complete:false,received:0};
if(process.argv.includes('--retry-limited'))for(const chat of state.chats)if(chat.status==='PARTIAL')chat.status='PENDING';
const save=()=>{writeFileSync(`${statePath}.next`,JSON.stringify(state),{mode:0o600});renameSync(`${statePath}.next`,statePath);};
async function json(response){if(!response.ok){await response.body?.cancel();throw new Error(`HTTP_${response.status}`);}const reader=response.body.getReader();let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024){await reader.cancel();throw new Error('RESPONSE_TOO_LARGE');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
const local=(path,body)=>fetch(`http://127.0.0.1:4173${path}`,{method:'POST',headers:{'content-type':'application/json','x-local-cron-token':env.LOCAL_CRON_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}).then(json);
const provider=(path,body)=>fetch(new URL(path,line.baseUrl),{method:'POST',headers:{token:line.token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'manual'}).then(json);
function project(message){return Object.fromEntries(['id','messageid','chatid','senderName','fromMe','wasSentByApi','isGroup','messageType','text','messageTimestamp'].filter(key=>message[key]!==undefined).map(key=>[key,message[key]]));}
if(!state.chatsComplete){
 for(let offset=state.chatsOffset??0;;){const page=await provider('/chat/find',{limit:100,offset,compact:true,wa_isGroup:false,sort:'-wa_lastMsgTimestamp'});const chats=(page.chats??[]).filter(chat=>/^\d{10,15}@s\.whatsapp\.net$/.test(chat.wa_chatid??'')&&!chat.wa_isGroup);await local('/api/local/history',{lineId,chats:chats.map(chat=>({phone:chat.wa_chatid.split('@')[0],name:(chat.wa_contactName||chat.name||chat.wa_name||'').slice(0,200)||null,timestamp:chat.wa_lastMsgTimestamp??null}))});
  for(const chat of chats)if(!state.chats.some(item=>item.number===chat.wa_chatid))state.chats.push({number:chat.wa_chatid,status:'PENDING',next:null,received:0});
  const pagination=page.pagination??{};if(!pagination.hasMore){state.chatsComplete=true;save();break;}const next=pagination.nextOffset??offset+100;if(next<=offset)throw new Error('PAGINATION_STALLED');state.chatsOffset=next;save();offset=next;
 }
 console.log(JSON.stringify({event:'local.history.chats.ready',chats:state.chats.length}));
}
for(let index=0;index<state.chats.length;index++){
 const chat=state.chats[index];if(['DONE','BLOCKED','PARTIAL','FAILED'].includes(chat.status))continue;
 for(let page=0;page<500;page++){
  const request=chat.next??{number:chat.number,count:100};const fingerprint=JSON.stringify(request);
  try {
   const result=await provider('/message/history-sync',{...request,number:chat.number,count:Math.min(100,request.count??100),sync:true,timeoutMs:25000});
   const messages=(result.messages??[]).map(project);
   for(let offset=0;offset<messages.length;offset+=100)await local('/api/local/history',{lineId,messages:messages.slice(offset,offset+100)});
   await local('/api/local/cron',{});
   chat.received+=messages.length;state.received+=messages.length;
   if(result.has_more===false){chat.status='DONE';chat.next=null;}
   else if(result.status==='blocked'||result.history_access==='unavailable'){chat.status='BLOCKED';chat.next=null;}
   else if(result.next_request&&JSON.stringify(result.next_request)!==fingerprint){chat.next=result.next_request;chat.status='PENDING';}
   else {chat.status='PARTIAL';chat.next=request;}
   save();if(chat.status!=='PENDING')break;
  }catch{chat.status='PARTIAL';save();throw new Error('Importação pausada após falha de consulta. O progresso foi preservado.');}
 }
 if(index%10===0||index===state.chats.length-1)console.log(JSON.stringify({event:'local.history.progress',processed:index+1,total:state.chats.length,received:state.received,limited:state.chats.filter(item=>['BLOCKED','PARTIAL','FAILED'].includes(item.status)).length}));
}
state.complete=state.chats.every(chat=>chat.status==='DONE');save();await local('/api/local/cron',{});console.log(JSON.stringify({event:'local.history.finished',chats:state.chats.length,received:state.received,limited:state.chats.filter(item=>item.status!=='DONE').length}));
