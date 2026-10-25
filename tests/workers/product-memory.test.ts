import {env} from 'cloudflare:workers';
import {describe,it,expect,vi} from 'vitest';
import {GET as knowledge} from '../../app/api/admin/knowledge/route';
import {loadProductMemory} from '@/server/product-memory';
import {processIncomingWhatsApp} from '@/server/conversation-processing';
import {acceptUazapiWebhook,processUazapiBatch} from '@/server/uazapi-webhook';
import {previewLineAgent} from '@/server/whatsapp-agents';
import {dispatchEvent} from '@/server/dispatch';

const runtime={...env,ENABLE_FREE_AI_RETRY:'true',OPENROUTER_API_KEY:'synthetic'};
const now=()=>new Date().toISOString();
async function setup(){
 await knowledge(new Request('https://newwed.test/api/admin/knowledge'));
 await env.DB.batch([
  env.DB.prepare("INSERT INTO whatsapp_instances(id,name,state,created_at,updated_at) VALUES('vendas','VALIDACAO','connected',?,?)").bind(now(),now()),
  env.DB.prepare("INSERT INTO whatsapp_agents(id,instance_id,name,instructions,model,enabled,updated_by,created_at,updated_at) VALUES('agent','vendas','VALIDACAO','Ajude com conteúdo publicado','openrouter/free',1,'test',?,?)").bind(now(),now()),
  env.DB.prepare("INSERT INTO conversations(id,channel,external_id,whatsapp_instance_id,contact_phone,mode,human_active,created_at,updated_at) VALUES('c','whatsapp','vendas:5581999999999','vendas','5581999999999','AGENT',0,?,?)").bind(now(),now()),
  env.DB.prepare("INSERT INTO messages(id,conversation_id,external_id,direction,type,body,status,created_at) VALUES('selection','c','selection','IN','text','Quero conhecer Noronha','RECEIVED','2026-01-01T00:00:00Z')"),
 ]);
}
describe('conhecimento e memória no D1',()=>{
 it('expõe apenas fatos publicados para gestão com identificação da fonte e dados desconhecidos',async()=>{
  const response=await knowledge(new Request('https://newwed.test/api/admin/knowledge'));expect(response.status).toBe(200);
  const data=await response.json() as {fingerprint:string;projects:unknown[];editions:Array<{cash:string}>;unpublished:string[]};
  expect(data.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(data.projects).toHaveLength(4);expect(data.editions).toHaveLength(4);expect(data.editions[0].cash).toBe('R$ 7.697,00');expect(data.unpublished.length).toBeGreaterThan(0);
  await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,email,name,active,created_at,updated_at) VALUES('vendor','vendor@test.local','VALIDACAO',1,?,?)").bind(now(),now()),
   env.DB.prepare("INSERT INTO roles(id,user_id,role,created_at) VALUES('vendor-role','vendor','vendedor',?)").bind(now()),
  ]);
  expect((await knowledge(new Request('https://newwed.test/api/admin/knowledge',{headers:{'x-dev-access-email':'vendor@test.local'}}))).status).toBe(403);
 });
 it('reconstrói escolha antiga além de resumo e últimas mensagens sem misturar clientes',async()=>{
  await setup();
  for(let offset=0;offset<1000;offset+=100)await env.DB.batch(Array.from({length:100},(_,i)=>env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,created_at) VALUES(?,'c','IN','text','Estou pensando','RECEIVED',?)").bind(`turn-${offset+i}`,new Date(Date.UTC(2026,1,1,0,0,offset+i)).toISOString())));
  await env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,created_at) VALUES('suggestion','c','OUT','text','Alagoas é uma alternativa','SENT',?)").bind(now()).run();
  expect((await loadProductMemory(runtime,'c')).editionSlugs).toEqual(['famtour-noronha-maio-2027']);
  expect((await loadProductMemory(runtime,'other')).projects).toEqual([]);
  // A new invocation reconstructs from D1; no mutable isolate cache is involved.
  expect(await loadProductMemory({...runtime},'c')).toEqual(await loadProductMemory(runtime,'c'));
 });
 it('pergunta curta de preço usa seleção persistida e registra a base sem chamar modelo',async()=>{
  await setup();
  await env.DB.batch(Array.from({length:150},(_,i)=>env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,created_at) VALUES(?,'c','IN','text','Ainda sobre o FAMTOUR','RECEIVED',?)").bind(`topic-${i}`,new Date(Date.UTC(2026,2,1,0,0,i)).toISOString())));
  await acceptUazapiWebhook(runtime,'vendas',{token:'synthetic-vendas-token',EventType:'messages',message:{messageid:'PRICE-1',chatid:'5581999999999@s.whatsapp.net',text:'E o valor?',fromMe:false,messageTimestamp:Date.now()}},'request-price-memory');
  const batch=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch'").first<{external_id:string}>();await processUazapiBatch(runtime,batch!.external_id);
  const incoming=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.incoming'").first<{external_id:string}>();
  await processIncomingWhatsApp(runtime,incoming!.external_id,{},'uazapi','receive-only');
  const model=vi.fn();const sender=vi.fn(async()=>Response.json({messageid:'PRICE-OUT'}));
  const job=await env.DB.prepare("SELECT id,type FROM outbox_events WHERE type='conversation.reply.requested'").first<{id:string;type:string}>();
  const handle=()=>processIncomingWhatsApp(runtime,incoming!.external_id,{openrouterFetcher:model,uazapiFetcher:sender},'uazapi','reply');
  await dispatchEvent(runtime,job!,handle);expect(sender).not.toHaveBeenCalled();
  expect((await env.DB.prepare("SELECT last_error FROM outbox_events WHERE id=?").bind(job!.id).first())?.last_error).toBe('PRODUCT_MEMORY_RECOVERY');
  expect((await env.DB.prepare("SELECT mode FROM conversations WHERE id='c'").first())?.mode).toBe('AGENT');
  await env.DB.prepare('UPDATE outbox_events SET next_attempt_at=NULL WHERE id=?').bind(job!.id).run();await dispatchEvent(runtime,job!,handle);
  expect(model).not.toHaveBeenCalled();expect(sender).toHaveBeenCalledTimes(1);
  const reply=await env.DB.prepare("SELECT body,payload_json FROM messages WHERE in_reply_to=?").bind(incoming!.external_id).first<{body:string;payload_json:string}>();
  expect(reply?.body).toContain('R$ 7.997,00');expect(reply?.body).toContain('12x de R$ 666,42');expect(JSON.parse(reply!.payload_json).knowledge.fingerprint).toMatch(/^[a-f0-9]{64}$/);
 });
 it('snapshot é persistido, recupera corrupção e evita sobrescrita concorrente',async()=>{
  await setup();const [a,b]=await Promise.all([loadProductMemory(runtime,'c'),loadProductMemory(runtime,'c')]);expect(a.editionSlugs).toEqual(b.editionSlugs);
  const saved=await env.DB.prepare("SELECT focus_json,revision FROM conversation_product_memory WHERE conversation_id='c'").first<{focus_json:string;revision:number}>();expect(saved?.revision).toBe(1);expect(saved?.focus_json).not.toContain('R$');
  await env.DB.prepare("UPDATE conversation_product_memory SET focus_json='{}' WHERE conversation_id='c'").run();expect((await loadProductMemory(runtime,'c')).editionSlugs).toEqual(['famtour-noronha-maio-2027']);
 });
 it('novas escolhas e esquecimento atualizam a memória persistida sem carregar dados de outro chat',async()=>{
  await setup();await loadProductMemory(runtime,'c');
  await env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,created_at) VALUES('change','c','IN','text','Não quero Noronha, quero Ceará','RECEIVED','2026-03-01T00:00:00Z')").run();expect((await loadProductMemory(runtime,'c')).editionSlugs).toEqual(['famtour-ceara-agosto-2027']);
  await env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,created_at) VALUES('clear','c','IN','text','Esqueça esse destino','RECEIVED','2026-03-02T00:00:00Z')").run();expect((await loadProductMemory(runtime,'c')).projects).toEqual([]);expect((await loadProductMemory({...runtime},'c')).projects).toEqual([]);
 });
 it('ano e sua correção persistem entre perguntas e runtimes',async()=>{
  await setup();await env.DB.prepare("UPDATE messages SET body='Noronha 2026' WHERE id='selection'").run();expect((await loadProductMemory(runtime,'c')).requestedYears).toEqual(['2026']);
  expect((await loadProductMemory({...runtime},'c')).requestedYears).toEqual(['2026']);
  await env.DB.prepare("INSERT INTO messages(id,conversation_id,direction,type,body,status,created_at) VALUES('year','c','IN','text','Agora quero 2027','RECEIVED','2026-03-01T00:00:00Z')").run();expect((await loadProductMemory(runtime,'c')).requestedYears).toEqual(['2027']);
 });
 it('prévia de preço publicado ou desconhecido continua funcionando mesmo com provider limitado',async()=>{
  await setup();const provider=vi.fn(async()=>{throw new Error('No provider available');});
  expect((await previewLineAgent(runtime,'agent','Qual valor do FAMTOUR Alagoas?',provider)).reply).toContain('R$ 7.697,00');
  expect((await previewLineAgent(runtime,'agent','Qual valor do Workshop?',provider)).reply).toContain('sob consulta');expect(provider).not.toHaveBeenCalled();
 });
});
