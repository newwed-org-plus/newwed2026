import {env} from 'cloudflare:workers';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {applyUazapiDelivery,syncUazapiDelivery} from '@/server/uazapi-delivery';
import {acceptUazapiWebhook,processUazapiBatch,processUazapiStatus,reconcileUazapiReceipt} from '@/server/uazapi-webhook';
import {processIncomingWhatsApp,processManualConversationMessage} from '@/server/conversation-processing';
import {GET as detailRoute} from '../../app/api/admin/conversations/[id]/route';
import {POST as syncRoute} from '../../app/api/admin/conversations/[id]/sync-status/route';
const now=()=>new Date().toISOString();
const runtime=()=>({...env,ENABLE_MESSAGE_STATUS_SYNC:'true'});
async function seed(){await env.DB.batch([
 env.DB.prepare("INSERT INTO whatsapp_instances(id,name,state,created_at,updated_at) VALUES('vendas','VALIDACAO','connected',?,?)").bind(now(),now()),
 env.DB.prepare("INSERT INTO conversations(id,channel,external_id,whatsapp_instance_id,contact_phone,mode,created_at,updated_at) VALUES('c','whatsapp','vendas:5581999999999','vendas','5581999999999','HUMAN',?,?)").bind(now(),now()),
 env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,external_id,created_at) VALUES('m','c','OUT','text','VALIDACAO','ACCEPTED','uazapi:vendas:OUT-1',?)").bind(now()),
]);}
const record=(status:string,overrides:Record<string,unknown>={})=>({id:'5581888888888:OUT-1',messageid:'OUT-1',chatid:'5581999999999@s.whatsapp.net',fromMe:true,status,...overrides});
afterEach(()=>vi.restoreAllMocks());
describe('estados reais UAZAPI',()=>{
 it('concilia por ID e linha, progride até leitura e nunca reenvia',async()=>{
  await seed();let status='Sent';const provider=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{expect(String(input)).toBe('https://vendas.uazapi.test/message/find');expect(JSON.parse(String(init?.body))).toEqual({id:'OUT-1',limit:1,offset:0});return Response.json({messages:[record(status,{chatid:'558199999999@s.whatsapp.net'})]});});
  for(const next of ['Sent','Delivered','Read','Sent']){status=next;await syncUazapiDelivery(runtime(),{force:true},provider);}
  const message=await env.DB.prepare('SELECT status,sent_at,delivered_at,read_at,status_checked_at,status_check_error FROM messages').first();
  expect(message).toMatchObject({status:'READ',sent_at:expect.any(String),delivered_at:expect.any(String),read_at:expect.any(String),status_checked_at:expect.any(String),status_check_error:null});
  const send=vi.fn();expect(await processManualConversationMessage(env,'m',send)).toMatchObject({sent:true,idempotent:true});expect(send).not.toHaveBeenCalled();
  await env.DB.prepare("UPDATE messages SET status_check_error='UAZAPI_UNAVAILABLE'").run();await applyUazapiDelivery(env,'uazapi:vendas:OUT-1','READ');expect(await env.DB.prepare('SELECT status_check_error FROM messages').first()).toEqual({status_check_error:null});
  await applyUazapiDelivery(env,'uazapi:vendas:OUT-1','FAILED');expect(await env.DB.prepare('SELECT status,last_error FROM messages').first()).toEqual({status:'READ',last_error:null});
 });
 it('preserva estado diante de falha, resposta de outro contato e cooldown',async()=>{
  await seed();const wrong=vi.fn(async()=>Response.json({messages:[record('Read',{chatid:'5581888888888@s.whatsapp.net'})]}));
  expect(await syncUazapiDelivery(runtime(),{},wrong)).toMatchObject({checked:1,unavailable:1});
  expect(await env.DB.prepare('SELECT status,status_check_error FROM messages').first()).toEqual({status:'ACCEPTED',status_check_error:'UAZAPI_MESSAGE_UNCONFIRMED'});
  await syncUazapiDelivery(runtime(),{},wrong);expect(wrong).toHaveBeenCalledTimes(1);
  const offline=vi.fn(async()=>{throw new Error('synthetic offline');});expect(await syncUazapiDelivery(runtime(),{force:true},offline)).toMatchObject({unavailable:1});
  expect(await env.DB.prepare('SELECT status,status_check_error FROM messages').first()).toEqual({status:'ACCEPTED',status_check_error:'UAZAPI_UNAVAILABLE'});
 });
 it('reaplica recibos antecipados, deduplica e preserva os horários de confirmação',async()=>{
  await seed();await env.DB.prepare('UPDATE messages SET external_id=NULL').run();
  const timestamp=Math.floor(Date.now()/1000)-30;
  for(let i=0;i<2;i++)await acceptUazapiWebhook({...env},'vendas',{token:'synthetic-vendas-token',EventType:'messages_update',state:'Read',event:{MessageIDs:['OUT-1'],Timestamp:timestamp,IsFromMe:true}},'synthetic-receipt');
  const batches=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").all<{external_id:string}>();for(const batch of batches.results)await processUazapiBatch(env,batch.external_id);
  await processUazapiStatus(env,'status:uazapi:vendas:OUT-1:READ');await env.DB.prepare("UPDATE messages SET external_id='uazapi:vendas:OUT-1'").run();await reconcileUazapiReceipt(env,'uazapi:vendas:OUT-1');
  expect(await env.DB.prepare('SELECT status,read_at FROM messages').first()).toEqual({status:'READ',read_at:new Date(timestamp*1000).toISOString()});
  expect(await env.DB.prepare("SELECT count(*) AS total FROM webhook_events WHERE external_id='status:uazapi:vendas:OUT-1:READ'").first()).toEqual({total:1});
 });
 it('consulta administrativa exige mesma origem e mantém o endpoint de envio fora da conciliação',async()=>{
  await seed();Object.assign(env,{ENABLE_MESSAGE_STATUS_SYNC:'true'});
  const request=(origin:string)=>new Request('https://newwed.test/api/admin/conversations/c/sync-status',{method:'POST',headers:{origin}});const ctx={params:Promise.resolve({id:'c'})};
  const provider=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({messages:[record('Delivered')]}));
  try{expect((await syncRoute(request('https://evil.test'),ctx)).status).toBe(403);expect(provider).not.toHaveBeenCalled();const response=await syncRoute(request('https://newwed.test'),ctx);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({checked:1,updated:1});expect(String(provider.mock.calls[0][0]).endsWith('/message/find')).toBe(true);}finally{Object.assign(env,{ENABLE_MESSAGE_STATUS_SYNC:undefined});}
 });
 it('devolve estados de páginas antigas somente da conversa autorizada',async()=>{
  await seed();await env.DB.batch([
   env.DB.prepare("INSERT INTO conversations(id,channel,external_id,mode,created_at,updated_at) VALUES('other','whatsapp','other','HUMAN',?,?)").bind(now(),now()),
   env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,status,created_at) VALUES('foreign','other','OUT','text','READ',?)").bind(now()),
  ]);
  const response=await detailRoute(new Request('https://newwed.test/api/admin/conversations/c?statusIds=m,foreign'),{params:Promise.resolve({id:'c'})});
  expect(response.status).toBe(200);const data=await response.json() as {messageStates:{id:string;body?:string}[]};expect(data.messageStates).toHaveLength(1);expect(data.messageStates[0]).toMatchObject({id:'m'});expect(data.messageStates[0]).not.toHaveProperty('body');
  expect((await detailRoute(new Request('https://newwed.test/api/admin/conversations/c?statusIds='+Array.from({length:100},(_,i)=>'m'+i).join(',')),{params:Promise.resolve({id:'c'})})).status).toBe(400);
 });
 it('permite IA na mesma identidade brasileira sem nono dígito e sem liberar outro destinatário',async()=>{
  await seed();await env.DB.prepare("INSERT INTO whatsapp_agents(id,instance_id,name,instructions,model,enabled,version,updated_by,created_at,updated_at) VALUES('agent','vendas','VALIDACAO','Contexto sintético','openrouter/free',1,1,'synthetic',?,?)").bind(now(),now()).run();
  const runtime={...env,ENABLE_AGENT:'true',LOCAL_TEST_MODE:'true',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:'5581999999999'};
  await acceptUazapiWebhook(runtime,'vendas',{token:'synthetic-vendas-token',EventType:'messages',message:{messageid:'IN-CANONICAL',chatid:'558199999999@s.whatsapp.net',fromMe:false,text:'Olá',messageTimestamp:Date.now()}},'synthetic-canonical');
  const batch=(await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>())!;await processUazapiBatch(runtime,batch.external_id);
  await processIncomingWhatsApp(runtime,'message:uazapi:vendas:IN-CANONICAL',{},'uazapi','receive-only');
  expect(await env.DB.prepare("SELECT mode FROM conversations WHERE external_id='vendas:558199999999'").first()).toEqual({mode:'AGENT'});
  expect(await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='conversation.reply.requested'").first()).toEqual({total:1});
 });

});
