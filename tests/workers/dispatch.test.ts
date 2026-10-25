import {applyD1Migrations} from "cloudflare:test";
import {env} from "cloudflare:workers";
import {describe,expect,it,vi} from "vitest";
import {dispatchEvent} from "@/server/dispatch";
import {publishOutbox,type QueueEvent} from "@/server/outbox";
import {POST as release} from "../../app/api/admin/operations/outbox/[id]/release/route";
import {POST as reconcile} from "../../app/api/admin/messages/[id]/reconcile/route";
import {POST as send} from "../../app/api/admin/conversations/[id]/messages/route";
import {GET as me} from "../../app/api/admin/me/route";
import {processIncomingWhatsApp,processManualConversationMessage} from "@/server/conversation-processing";
import {acceptUazapiWebhook,processUazapiBatch} from "@/server/uazapi-webhook";
import {processNotificationEmail,type EmailEnv} from "@/server/notifications";
const now=()=>new Date().toISOString();
const req=(body:unknown)=>new Request('https://newwed.test/api/admin/operations',{method:'POST',headers:{origin:'https://newwed.test','content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(body)});
const ctx=(id:string)=>({params:Promise.resolve({id})});
async function event(id='job',type='conversation.manual.send',payload:unknown={}) {
 await env.DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,payload_json,created_at) VALUES (?,?,?, ?,?)").bind(id,type,'synthetic',JSON.stringify(payload),now()).run();return {id,type} as QueueEvent;
}
async function actor() {return (await(await me(new Request('https://newwed.test/api/admin/me'))).json() as {id:string}).id;}
describe('efeitos comerciais duráveis',()=>{
 it('migração retém o backlog antigo sem bloquear recebimento',async()=>{
  const index=env.TEST_MIGRATIONS.findIndex(m=>m.name.startsWith('0011_'));
  await applyD1Migrations(env.LEGACY_DB,env.TEST_MIGRATIONS.slice(0,index));
  await env.LEGACY_DB.batch([
   env.LEGACY_DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,payload_json,created_at) VALUES ('old-send','conversation.manual.send','synthetic','{}',?)").bind(now()),
   env.LEGACY_DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,payload_json,created_at) VALUES ('incoming','uazapi.incoming','synthetic','{}',?)").bind(now()),
  ]);
  await applyD1Migrations(env.LEGACY_DB,[env.TEST_MIGRATIONS[index]]);
  expect(await env.LEGACY_DB.prepare("SELECT dispatch_state,hold_reason FROM outbox_events WHERE id='old-send'").first()).toEqual({dispatch_state:'HELD',hold_reason:'PRE_ACTIVATION_REVIEW'});
  expect(await env.LEGACY_DB.prepare("SELECT dispatch_state FROM outbox_events WHERE id='incoming'").first()).toEqual({dispatch_state:'PENDING'});
 });

 it('retém funções desligadas e exige revisão individual antes de executar',async()=>{
  const body=await event();const queue=vi.fn();const handle=vi.fn(async()=>({sent:true}));
  expect(await publishOutbox({...env,ENABLE_MANUAL_SEND:'false',EVENTS_QUEUE:{send:queue} as unknown as Queue},body)).toBe(false);expect(queue).not.toHaveBeenCalled();
  await dispatchEvent(env,body,handle);expect(handle).not.toHaveBeenCalled();
  expect((await release(req({reason:'VALIDACAO operação revisada'}),ctx(body.id))).status).toBe(202);
  await dispatchEvent(env,body,handle);await dispatchEvent(env,body,handle);expect(handle).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare("SELECT dispatch_state FROM outbox_events WHERE id='job'").first()).toEqual({dispatch_state:'DONE'});
 });
 it('duas entregas da Queue não executam o mesmo efeito em paralelo',async()=>{
  const body=await event();let finish:()=>void=()=>{};const held=new Promise<void>(resolve=>{finish=resolve;});
  const handle=vi.fn(async()=>{await held;return {sent:true};});const first=dispatchEvent(env,body,handle);
  await vi.waitFor(()=>expect(handle).toHaveBeenCalledTimes(1));await dispatchEvent(env,body,handle);finish();await first;expect(handle).toHaveBeenCalledTimes(1);
 });
 it('um crash após possível efeito fica retido e não aceita replay cego',async()=>{
  const body=await event();const handle=vi.fn(async()=>{throw new Error('synthetic result unknown');});
  await dispatchEvent(env,body,handle);await dispatchEvent(env,body,handle);expect(handle).toHaveBeenCalledTimes(1);
  expect((await release(req({reason:'VALIDACAO tentativa de replay'}),ctx(body.id))).status).toBe(409);
 });
 it('timeout de envio exige reconciliação e não envia novamente',async()=>{
  const user=await actor();await env.DB.batch([
   env.DB.prepare("INSERT INTO whatsapp_instances (id,name,state,created_at,updated_at) VALUES ('vendas','VALIDACAO','connected',?,?)").bind(now(),now()),
   env.DB.prepare("INSERT INTO conversations (id,channel,external_id,whatsapp_instance_id,contact_phone,mode,claimed_by,created_at,updated_at) VALUES ('c','whatsapp','vendas:5581999999999','vendas','5581999999999','HUMAN',?,?,?)").bind(user,now(),now()),
   env.DB.prepare("INSERT INTO messages (id,conversation_id,actor_id,direction,type,body,status,created_at) VALUES ('m','c',?,'OUT','text','VALIDACAO','SEND_PENDING',?)").bind(user,now()),
  ]);
  const provider=vi.fn().mockRejectedValue(new Error('synthetic timeout'));
  expect(await processManualConversationMessage(env,'m',provider)).toMatchObject({uncertain:true});
  expect(await processManualConversationMessage(env,'m',provider)).toMatchObject({uncertain:true});expect(provider).toHaveBeenCalledTimes(1);
  expect((await send(req({body:'VALIDACAO repetir'}),ctx('c'))).status).toBe(409);
  expect((await reconcile(req({outcome:'not-sent',reason:'VALIDACAO conferido no provedor'}),ctx('m'))).status).toBe(200);
  const original=req({body:'VALIDACAO nova operação'});original.headers.set('idempotency-key','synthetic-message-idempotency');
  expect((await send(original,ctx('c'))).status).toBe(202);
  const retry=req({body:'VALIDACAO texto diferente'});retry.headers.set('idempotency-key','synthetic-message-idempotency');
  expect((await send(retry,ctx('c'))).status).toBe(409);
 });
 it('recebimento cria pedido de resposta uma vez sem credenciais ou chamada externa',async()=>{
  const commercial=vi.fn(async()=>{});const runtime={...env,OPENROUTER_API_KEY:undefined,EVENTS_QUEUE:{send:commercial} as unknown as Queue,UAZAPI_EVENTS_QUEUE:{send:vi.fn(async()=>{})} as unknown as Queue};
  await acceptUazapiWebhook(runtime,'vendas',{token:'synthetic-vendas-token',EventType:'messages',message:{messageid:'DEFER-1',chatid:'5581999999999@s.whatsapp.net',text:'Olá',fromMe:false,messageTimestamp:Date.now()}},'request-deferred-agent');
  await env.DB.prepare("INSERT INTO whatsapp_agents (id,instance_id,name,instructions,model,enabled,updated_by,created_at,updated_at) VALUES ('a','vendas','VALIDACAO','Contexto','openrouter/free',1,'test',?,?)").bind(now(),now()).run();
  const batch=(await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>())!;await processUazapiBatch(runtime,batch.external_id);
  const incoming=(await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.incoming'").first<{external_id:string}>())!;
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected network'));
  try {await processIncomingWhatsApp(runtime,incoming.external_id,{},'uazapi','receive-only');await processIncomingWhatsApp(runtime,incoming.external_id,{},'uazapi','receive-only');expect(network).not.toHaveBeenCalled();}finally{network.mockRestore();}
  expect(await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='conversation.reply.requested'").first()).toEqual({total:1});expect(commercial).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare("SELECT count(*) AS total FROM messages WHERE direction='OUT'").first()).toEqual({total:0});
 });
 it('e-mail com aceite incerto não é repetido',async()=>{
  const user=await actor();await env.DB.batch([
   env.DB.prepare("INSERT INTO notifications (id,type,entity_type,entity_id,title,body,dedupe_key,created_at) VALUES ('n','CHECKOUT_PAID','checkout','synthetic','VALIDACAO','Confirmação','n',?)").bind(now()),
   env.DB.prepare("INSERT INTO notification_recipients (id,notification_id,user_id,channel,delivery_status,created_at,updated_at) VALUES ('nr','n',?,'EMAIL','PENDING',?,?)").bind(user,now(),now()),
  ]);
  const body=await event('email','notification.email',{notificationId:'n',userId:user});const provider=vi.fn().mockRejectedValue(new Error('synthetic timeout'));
  const runtime={...env,EMAIL:{send:provider} as unknown as SendEmail,EMAIL_FROM:'marketing@newwed.com.br'} as EmailEnv;
  expect(await processNotificationEmail(runtime,body.id,'n',user)).toMatchObject({uncertain:true});expect(await processNotificationEmail(runtime,body.id,'n',user)).toMatchObject({duplicate:true});expect(provider).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare("SELECT delivery_status FROM notification_recipients WHERE id='nr'").first()).toEqual({delivery_status:'SEND_UNKNOWN'});
 });
});
