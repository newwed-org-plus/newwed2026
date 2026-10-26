import {env} from 'cloudflare:workers';
import {describe,it,expect,vi} from 'vitest';
import {startHistorySync,processPendingHistorySyncs,reconcileRecentLocalMessages} from '@/server/uazapi-history-sync';
import {processManualConversationMessage} from '@/server/conversation-processing';
import {sendUazapiText} from '@/server/integrations/uazapi';
import {POST as cron} from '../../app/api/local/cron/route';
const now=()=>new Date().toISOString();
async function seed(){await env.DB.prepare("INSERT INTO whatsapp_instances(id,name,state,created_at,updated_at) VALUES('vendas','VALIDACAO','connected',?,?)").bind(now(),now()).run();}
const message=(id:string,extra:Record<string,unknown>={})=>({messageid:id,chatid:'5581999999999@s.whatsapp.net',text:'VALIDACAO histórico',fromMe:false,messageTimestamp:Date.now(),...extra});
describe('histórico nativo e stack local',()=>{
 it('pagina com orçamento, deduplica e inclui saídas antigas sem automação',async()=>{
  await seed();const runtime={...env,ENABLE_HISTORY_SYNC:'true',HISTORY_CRON_MESSAGE_BUDGET:'2'};
  await expect(startHistorySync({...runtime,ENABLE_HISTORY_SYNC:'false'},'vendas',null!)).rejects.toMatchObject({code:'HISTORY_SYNC_DISABLED'});
  const first=await startHistorySync(runtime,'vendas',null!);expect(await startHistorySync(runtime,'vendas',null!)).toEqual(first);
  const provider=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{expect(String(input)).toBe('https://vendas.uazapi.test/message/find');const body=JSON.parse(String(init?.body));expect(body.limit).toBe(2);return Response.json(body.offset===0?{messages:[message('A'),message('B',{fromMe:true,wasSentByApi:true})],pagination:{hasMore:true,nextOffset:2}}:{messages:[message('A'),message('GROUP',{chatid:'123@g.us',isGroup:true})],pagination:{hasMore:false,nextOffset:4}});});
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected network'));
  try{await processPendingHistorySyncs(runtime,provider);expect(await env.DB.prepare('SELECT count(*) AS total FROM messages').first()).toEqual({total:2});await processPendingHistorySyncs(runtime,provider);expect(network).not.toHaveBeenCalled();}finally{network.mockRestore();}
  expect(provider).toHaveBeenCalledTimes(2);expect(await env.DB.prepare('SELECT count(*) AS total FROM messages').first()).toEqual({total:2});
  expect(await env.DB.prepare('SELECT status,provider_offset,scanned_count,skipped_count FROM uazapi_history_syncs').first()).toEqual({status:'DONE',provider_offset:4,scanned_count:4,skipped_count:1});
  expect(await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='conversation.reply.requested'").first()).toEqual({total:0});
  expect(await env.DB.prepare("SELECT count(*) AS total FROM messages WHERE direction='OUT'").first()).toEqual({total:1});
 });
 it('respeita lock e retoma falha transitória do cursor salvo',async()=>{
  await seed();const runtime={...env,ENABLE_HISTORY_SYNC:'true'};await startHistorySync(runtime,'vendas',null!);
  await env.DB.prepare("INSERT INTO operation_leases VALUES('history:vendas','other',?)").bind(new Date(Date.now()+60000).toISOString()).run();
  const provider=vi.fn().mockRejectedValueOnce(new Error('synthetic timeout')).mockResolvedValue(Response.json({messages:[],pagination:{hasMore:false,nextOffset:0}}));
  await processPendingHistorySyncs(runtime,provider);expect(provider).not.toHaveBeenCalled();await env.DB.prepare('DELETE FROM operation_leases').run();
  await processPendingHistorySyncs(runtime,provider);await processPendingHistorySyncs(runtime,provider);expect(provider).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare('SELECT provider_offset,attempts FROM uazapi_history_syncs').first()).toEqual({provider_offset:0,attempts:1});
  await env.DB.prepare('UPDATE uazapi_history_syncs SET next_attempt_at=NULL').run();await processPendingHistorySyncs(runtime,provider);expect(await env.DB.prepare('SELECT status FROM uazapi_history_syncs').first()).toEqual({status:'DONE'});
 });
 it('limita o envio real local ao destinatário autorizado',async()=>{
  await seed();const provider=vi.fn(async()=>Response.json({id:'local-out'}));const runtime={...env,LOCAL_TEST_MODE:'true',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:'5581999999999'};
  await expect(sendUazapiText(runtime,'vendas','5581888888888','VALIDACAO',provider)).rejects.toMatchObject({code:'WHATSAPP_LOCAL_RECIPIENT_BLOCKED'});expect(provider).not.toHaveBeenCalled();
  expect(await sendUazapiText(runtime,'vendas','5581999999999','VALIDACAO',provider)).toMatchObject({messages:[{id:'uazapi:vendas:local-out'}]});
  await expect(sendUazapiText({...runtime,LOCAL_ALLOW_MANUAL_SEND_ANY:'true'},'vendas','5581888888888','VALIDACAO',provider)).rejects.toMatchObject({code:'WHATSAPP_LOCAL_RECIPIENT_BLOCKED'});
  expect(await sendUazapiText({...runtime,LOCAL_ALLOW_MANUAL_SEND_ANY:'true'},'vendas','5581888888888','VALIDACAO',provider,'manual')).toMatchObject({messages:[{id:'uazapi:vendas:local-out'}]});
 });
 it('não expõe o acionamento local sem o segredo de máquina',async()=>{
  Object.assign(env,{LOCAL_TEST_MODE:'true',LOCAL_CRON_TOKEN:'synthetic-machine-only'});
  try{expect((await cron(new Request('http://127.0.0.1/api/local/cron',{method:'POST'}))).status).toBe(403);expect((await cron(new Request('https://public.example.test/api/local/cron',{method:'POST'}))).status).toBe(404);}finally{Object.assign(env,{LOCAL_TEST_MODE:undefined,LOCAL_CRON_TOKEN:undefined});}
 });
 it('envia a resposta manual selecionada uma vez, sem ampliar automações locais',async()=>{
  await seed();await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,email,name,active,created_at,updated_at) VALUES ('operator','operator@example.test','VALIDACAO',1,?,?)").bind(now(),now()),
   env.DB.prepare("INSERT INTO conversations(id,channel,external_id,whatsapp_instance_id,contact_phone,mode,claimed_by,created_at,updated_at) VALUES ('manual','whatsapp','vendas:5581888888888','vendas','5581888888888','HUMAN','operator',?,?)").bind(now(),now()),
   env.DB.prepare("INSERT INTO messages(id,conversation_id,actor_id,direction,type,body,status,created_at) VALUES ('reply','manual','operator','OUT','text','VALIDACAO','SEND_PENDING',?)").bind(now()),
  ]);
  const provider=vi.fn(async()=>Response.json({id:'operator-out'}));
  const runtime={...env,LOCAL_TEST_MODE:'true',LOCAL_ALLOW_MANUAL_SEND_ANY:'true',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:'5581999999999'};
  expect(await processManualConversationMessage(runtime,'reply',provider)).toMatchObject({sent:true});
  expect(await processManualConversationMessage(runtime,'reply',provider)).toMatchObject({idempotent:true});expect(provider).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare("SELECT status FROM messages WHERE id='reply'").first()).toEqual({status:'ACCEPTED'});
 });
 it('recupera mensagens recentes perdidas pelo callback sem resposta automática',async()=>{
  await seed();const runtime={...env,LOCAL_TEST_MODE:'true',ENABLE_HISTORY_SYNC:'true',HISTORY_CRON_MESSAGE_BUDGET:'1'};
  const provider=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{expect(JSON.parse(String(init?.body)).limit).toBe(1);return Response.json({messages:[message('MISSED')],hasMore:false});});
  await reconcileRecentLocalMessages(runtime,provider);await reconcileRecentLocalMessages(runtime,provider);
  expect(await env.DB.prepare('SELECT count(*) AS total FROM messages').first()).toEqual({total:1});
  expect(await env.DB.prepare("SELECT mode FROM conversations").first()).toEqual({mode:'HUMAN'});
  expect(await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='conversation.reply.requested'").first()).toEqual({total:0});
 });
});
