import {env} from 'cloudflare:workers';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {GET as me} from '../../app/api/admin/me/route';
import {POST as retryAgent} from '../../app/api/admin/conversations/[id]/retry-agent/route';
import {GET as conversationDetail} from '../../app/api/admin/conversations/[id]/route';
import {saveLineAgent} from '@/server/whatsapp-agents';
import {processIncomingWhatsApp,processConversationSummary} from '@/server/conversation-processing';
import {acceptUazapiWebhook,processUazapiBatch} from '@/server/uazapi-webhook';
import {dispatchEvent} from '@/server/dispatch';
import {getCooldown,paceFreeRequest} from '@/server/ai-availability';
import {loadAgentContext} from '@/server/integrations/openai-agent';
import commercial from '../../workers/events';

const runtime={...env,ENABLE_FREE_AI_RETRY:'true',OPENROUTER_API_KEY:'synthetic'};
const ctx=(id:string)=>({params:Promise.resolve({id})});
const req=(origin='https://newwed.test')=>new Request('https://newwed.test/api/admin/conversations/c/retry-agent',{method:'POST',headers:{origin}});
const model={id:'test/model:free',pricing:{prompt:'0',completion:'0'},supported_parameters:['response_format'],architecture:{input_modalities:['text'],output_modalities:['text']}};
const good=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith('/models')?Response.json({data:[model]}):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'Informação verificada.',confidence:0.95,handoff:false,reason:''})}}]}));
const limited=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith('/models')?Response.json({data:[model]}):Response.json({error:{message:'account rate limit'}},{status:429,headers:{'retry-after':'60'}}));
async function setup(text='Explique a proposta para empresas'){
 const user=(await(await me(new Request('https://newwed.test/api/admin/me'))).json() as {id:string}).id;
 await acceptUazapiWebhook(runtime,'vendas',{token:'synthetic-vendas-token',EventType:'messages',message:{messageid:'LIVE-1',chatid:'5581999999999@s.whatsapp.net',text,fromMe:false,messageTimestamp:Date.now()}},'request-recovery');
 await saveLineAgent(runtime,'agent',{instanceId:'vendas',name:'VALIDACAO',instructions:'Ajude com informações oficiais da New Wed.',model:model.id,enabled:true,version:0},user,good);
 await env.DB.prepare("UPDATE whatsapp_instances SET state='connected' WHERE id='vendas'").run();
 const batch=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>();
 await processUazapiBatch(runtime,batch!.external_id);
 const incoming=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.incoming'").first<{external_id:string}>();
 await processIncomingWhatsApp(runtime,incoming!.external_id,{},'uazapi','receive-only');
 const conversation=await env.DB.prepare('SELECT id FROM conversations').first<{id:string}>();
 const job=await env.DB.prepare("SELECT id,type FROM outbox_events WHERE type='conversation.reply.requested'").first<{id:string;type:string}>();
 expect(job).not.toBeNull();return {id:conversation!.id,externalId:incoming!.external_id,job:job!};
}
afterEach(()=>{vi.clearAllMocks();Object.assign(env,{ENABLE_FREE_AI_RETRY:'false',LOCAL_TEST_MODE:'false',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:undefined,OPENROUTER_API_KEY:undefined});});
describe('retomada durável da IA gratuita',()=>{
 it('mantém AGENT no 429, persiste espera visível e retoma sem repetir resposta ou geração',async()=>{
  const {id,externalId,job}=await setup();const sender=vi.fn(async()=>Response.json({messageid:'REPLY-1'}));
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:limited,uazapiFetcher:sender},'uazapi','reply'));
  expect(await env.DB.prepare('SELECT mode,agent_error,agent_processing_token FROM conversations').first()).toEqual({mode:'AGENT',agent_error:null,agent_processing_token:null});
  expect(await env.DB.prepare('SELECT dispatch_state,deferred_attempts,processing_attempts FROM outbox_events WHERE id=?').bind(job.id).first()).toEqual({dispatch_state:'PENDING',deferred_attempts:1,processing_attempts:0});
  const detail=await(await conversationDetail(new Request('https://newwed.test/api/admin/conversations/'+id),ctx(id))).json() as {conversation:{agent_wait_until:string}};
  expect(Date.parse(detail.conversation.agent_wait_until)).toBeGreaterThan(Date.now());expect(sender).not.toHaveBeenCalled();
  const calls=limited.mock.calls.length;
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:limited},'uazapi','reply'));expect(limited).toHaveBeenCalledTimes(calls);
  expect(await getCooldown(runtime,'openrouter:account')).not.toBeNull();
  await env.DB.batch([env.DB.prepare('DELETE FROM ai_provider_cooldowns'),env.DB.prepare('UPDATE outbox_events SET next_attempt_at=NULL WHERE id=?').bind(job.id)]);
  const handle=()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:good,uazapiFetcher:sender},'uazapi','reply');
  await dispatchEvent(runtime,job,handle);expect(sender).toHaveBeenCalledTimes(1);
  const generations=good.mock.calls.length;
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='PENDING' WHERE id=?").bind(job.id).run();await dispatchEvent(runtime,job,handle);
  expect(sender).toHaveBeenCalledTimes(1);expect(good).toHaveBeenCalledTimes(generations);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM messages WHERE in_reply_to=?').bind(externalId).first()).toEqual({n:1});
 });
 it('FAQ oficial e resumo extrativo não chamam modelo e claim humano interrompe espera',async()=>{
  const {id,externalId,job}=await setup('Quais produtos vc vende?');const sender=vi.fn(async()=>Response.json({messageid:'FAQ-1'}));const noModel=vi.fn();
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:noModel,uazapiFetcher:sender},'uazapi','reply'));
  expect(noModel).not.toHaveBeenCalled();expect(sender).toHaveBeenCalledTimes(1);
  expect(await processConversationSummary(runtime,id,2,noModel)).toMatchObject({summarized:true,local:true});expect(noModel).not.toHaveBeenCalled();
  await env.DB.prepare("UPDATE conversations SET mode='HUMAN',human_active=1,claimed_by=(SELECT id FROM users LIMIT 1)").run();
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='PENDING' WHERE id=?").bind(job.id).run();
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:noModel,uazapiFetcher:sender},'uazapi','reply'));expect(sender).toHaveBeenCalledTimes(1);
 });
 it('claim humano durante espera e nova pergunta durante geração impedem resposta atrasada',async()=>{
  const {id,externalId,job}=await setup();const sender=vi.fn();
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:limited},'uazapi','reply'));
  await env.DB.batch([
   env.DB.prepare("UPDATE conversations SET mode='HUMAN',human_active=1,claimed_by=(SELECT id FROM users LIMIT 1)"),
   env.DB.prepare('UPDATE outbox_events SET next_attempt_at=NULL WHERE id=?').bind(job.id),
   env.DB.prepare('DELETE FROM ai_provider_cooldowns'),
  ]);
  const calls=good.mock.calls.length;
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:good,uazapiFetcher:sender},'uazapi','reply'));expect(good).toHaveBeenCalledTimes(calls);expect(sender).not.toHaveBeenCalled();
  await env.DB.prepare("UPDATE conversations SET mode='AGENT',human_active=0,claimed_by=NULL").run();
  const during=vi.fn(async(url:RequestInfo|URL)=>{
   if(String(url).endsWith('/models'))return good(url);
   await env.DB.prepare("INSERT INTO messages(id,conversation_id,external_id,direction,type,body,status,created_at) VALUES('newer',?,'newer','IN','text','VALIDACAO nova pergunta','RECEIVED',?)").bind(id,new Date(Date.now()+1000).toISOString()).run();
   return good(url);
  });
  expect(await processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:during,uazapiFetcher:sender},'uazapi','reply')).toMatchObject({superseded:true});expect(sender).not.toHaveBeenCalled();
  expect((await env.DB.prepare('SELECT agent_processing_token FROM conversations').first())?.agent_processing_token).toBeNull();
 });
 it('esperas não esgotam orçamento de falhas e apenas geração sem envio pode ser recuperada após crash',async()=>{
  const {job}=await setup();
  for(let i=0;i<12;i++){
   await env.DB.prepare('UPDATE outbox_events SET next_attempt_at=NULL WHERE id=?').bind(job.id).run();
   await dispatchEvent(runtime,job,async()=>({retryAt:new Date(Date.now()+60000).toISOString(),retryCode:'OPENROUTER_HTTP_429'}));
  }
  expect(await env.DB.prepare('SELECT deferred_attempts,processing_attempts,dispatch_state FROM outbox_events WHERE id=?').bind(job.id).first()).toEqual({deferred_attempts:12,processing_attempts:0,dispatch_state:'PENDING'});
  const stale=new Date(Date.now()-180000).toISOString();
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='PROCESSING',processing_started_at=?,processing_token='stale' WHERE id=?").bind(stale,job.id).run();
  await env.DB.prepare("UPDATE conversations SET agent_processing_token='stale',agent_processing_started_at=?").bind(stale).run();
  const queue=vi.fn(async()=>{});
  await commercial.scheduled({} as ScheduledController,{...runtime,ENABLE_EMAIL:'false',ENABLE_CHECKOUT:'false',EVENTS_QUEUE:{send:queue} as unknown as Queue});
  expect(await env.DB.prepare('SELECT mode,agent_processing_token FROM conversations').first()).toEqual({mode:'AGENT',agent_processing_token:null});
  expect((await env.DB.prepare('SELECT dispatch_state FROM outbox_events WHERE id=?').bind(job.id).first())?.dispatch_state).toBe('PUBLISHED');
 });
 it('envio incerto permanece humano e jamais chama o provedor de novo',async()=>{
  const {externalId,job}=await setup('Quais produtos vc vende?');const sender=vi.fn(async()=>{throw new Error('synthetic timeout');});
  const handle=()=>processIncomingWhatsApp(runtime,externalId,{uazapiFetcher:sender},'uazapi','reply');
  await dispatchEvent(runtime,job,handle);
  expect((await env.DB.prepare('SELECT mode FROM conversations').first())?.mode).toBe('HUMAN');
  expect((await env.DB.prepare("SELECT status FROM messages WHERE direction='OUT'").first())?.status).toBe('SEND_UNKNOWN');
  await dispatchEvent(runtime,job,handle);expect(sender).toHaveBeenCalledTimes(1);
 });
 it('recuperação explícita é local, auditada, idempotente e recusa histórico ou resposta já enviada',async()=>{
  const {id,externalId,job}=await setup('Quais produtos vc vende?');Object.assign(env,{ENABLE_FREE_AI_RETRY:'true',LOCAL_TEST_MODE:'true',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:'5581999999999',OPENROUTER_API_KEY:'synthetic'});
  expect((await retryAgent(req('https://evil.test'),ctx(id))).status).toBe(403);
  Object.assign(env,{LOCAL_TEST_MODE:'false'});expect((await retryAgent(req(),ctx(id))).status).toBe(409);Object.assign(env,{LOCAL_TEST_MODE:'true'});
  await env.DB.prepare("UPDATE webhook_events SET event_type='uazapi.batch.test' WHERE event_type='uazapi.batch'").run();
  await env.DB.prepare("UPDATE webhook_events SET payload_json=json_set(payload_json,'$.event.history',json('true')) WHERE external_id=?").bind(externalId).run();
  expect((await retryAgent(req(),ctx(id))).status).toBe(409);
  await env.DB.prepare("UPDATE webhook_events SET event_type='uazapi.batch' WHERE event_type='uazapi.batch.test'").run();
  await env.DB.prepare("UPDATE webhook_events SET payload_json=json_set(payload_json,'$.event.history',json('false')) WHERE external_id=?").bind(externalId).run();
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='DONE' WHERE id=?").bind(job.id).run();
  expect((await retryAgent(req(),ctx(id))).status).toBe(202);expect((await retryAgent(req(),ctx(id))).status).toBe(202);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action='conversation.agent.retry'").first()).toEqual({n:1});
  const sender=vi.fn(async()=>Response.json({messageid:'SAFE-1'}));await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{uazapiFetcher:sender},'uazapi','reply'));
  expect((await retryAgent(req(),ctx(id))).status).toBe(409);expect(sender).toHaveBeenCalledTimes(1);
 });
 it('callback ao vivo vence histórico conciliado antes dele sem duplicar mensagem ou responder histórico sozinho',async()=>{
  const {externalId,job}=await setup('Feira tendencia');
  await env.DB.batch([
   env.DB.prepare('DELETE FROM outbox_events WHERE id=?').bind(job.id),
   env.DB.prepare("UPDATE webhook_events SET payload_json=json_set(payload_json,'$.event.history',json('true')),processed_at=? WHERE external_id=?").bind(new Date().toISOString(),externalId),
  ]);
  const sender=vi.fn(async()=>Response.json({messageid:'RACE-1'}));const noModel=vi.fn();
  await processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:noModel,uazapiFetcher:sender},'uazapi','reply');expect(sender).not.toHaveBeenCalled();
  const batch=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>();await processUazapiBatch(runtime,batch!.external_id);
  await processIncomingWhatsApp(runtime,externalId,{},'uazapi','receive-only');
  await dispatchEvent(runtime,job,()=>processIncomingWhatsApp(runtime,externalId,{openrouterFetcher:noModel,uazapiFetcher:sender},'uazapi','reply'));
  expect(sender).toHaveBeenCalledTimes(1);expect(noModel).not.toHaveBeenCalled();
  expect(await env.DB.prepare("SELECT count(*) AS n FROM messages WHERE direction='IN'").first()).toEqual({n:1});
 });
 it('pacing reserva uma chamada por vez e não confunde catálogo de demonstração com oferta',async()=>{
  const {id}=await setup();await env.DB.prepare('DELETE FROM ai_provider_cooldowns').run();await paceFreeRequest(runtime);
  expect(await getCooldown(runtime,'openrouter:pace')).not.toBeNull();
  const context=await loadAgentContext(runtime,{conversationId:id});expect(context.siteKnowledge.projects).toHaveLength(4);
  expect(context.catalog.every(row=>!String(row.name).includes('VALIDACAO'))).toBe(true);
 });
});
