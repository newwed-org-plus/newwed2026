import {env} from 'cloudflare:workers';
import {runDurableObjectAlarm,runInDurableObject} from 'cloudflare:test';
import {describe,it,expect,vi} from 'vitest';
import {monitorCron,collectUsage,importHasHeadroom} from '@/server/operations';
import {GET as failures} from '../../app/api/admin/operations/failures/route';
import {GET as me} from '../../app/api/admin/me/route';
import {POST as reconcile} from '../../app/api/admin/operations/outbox/[id]/reconcile/route';
import {POST as retry} from '../../app/api/admin/operations/outbox/[id]/retry/route';
import {POST as login} from '../../app/api/auth/login/route';
import {hashPassword} from '@/server/auth/password';
import {acceptUazapiWebhook,processUazapiBatch} from '@/server/uazapi-webhook';
import {processIncomingWhatsApp} from '@/server/conversation-processing';
import receiver from '../../workers/uazapi-receiver';
const now=()=>new Date().toISOString();
const ctx=(id:string)=>({params:Promise.resolve({id})});
const req=(body:unknown)=>new Request('https://newwed.test/api/admin/operations',{method:'POST',headers:{origin:'https://newwed.test','content-type':'application/json'},body:JSON.stringify(body)});
async function actor(){return (await (await me(new Request('https://newwed.test/api/admin/me'))).json() as {id:string}).id;}
describe('observabilidade e recuperação operacional',()=>{
 it('conta todo o backlog e alerta uma vez após três execuções sem progresso',async()=>{
  await actor();await env.DB.batch(Array.from({length:75},(_,i)=>env.DB.prepare("INSERT INTO outbox_events(id,type,aggregate_id,payload_json,last_error,dispatch_state,created_at) VALUES (?,'checkout.send','synthetic','{}','VALIDACAO','PENDING',?)").bind(`job-${i}`,now())));
  for(let i=0;i<5;i++)await monitorCron({...env,ENABLE_EMAIL:'false'},'commercial',async()=>{});
  const response=await failures(new Request('https://newwed.test/api/admin/operations/failures'));expect(response.status).toBe(200);
  const body=await response.json() as {counts:{queue:number;pending:number};items:unknown[];health:Array<{stalled_runs:number}>};
  expect(body.counts.queue).toBe(75);expect(body.items.length).toBeLessThan(75);expect(body.counts.pending).toBe(75);
  expect(body.health[0].stalled_runs).toBeGreaterThanOrEqual(3);
  expect(await env.DB.prepare("SELECT count(*) AS total FROM notifications WHERE type='OPERATION_ALERT'").first()).toEqual({total:1});
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='DONE',processed_at=? WHERE id='job-0'").bind(now()).run();
  await monitorCron(env,'commercial',async()=>{});
  expect(await env.DB.prepare("SELECT stalled_runs FROM operational_health WHERE service='commercial'").first()).toEqual({stalled_runs:0});
 });
 it('coleta uso real agregado, deduplica alerta e suspende importação em 80%',async()=>{
  await actor();const provider=vi.fn(async()=>Response.json({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:85,rowsWritten:15}}],queueMessageOperationsAdaptiveGroups:[{sum:{billableOperations:20}}]}]}}}));
  const runtime={...env,CLOUDFLARE_ANALYTICS_TOKEN:'synthetic-analytics-only',CLOUDFLARE_ACCOUNT_ID:'synthetic-account',D1_READ_BUDGET:'100',D1_WRITE_BUDGET:'100',ENABLE_EMAIL:'false'};
  expect(await collectUsage(runtime,provider)).toMatchObject({configured:true,cached:false});
  expect(await collectUsage(runtime,provider)).toMatchObject({cached:true});expect(provider).toHaveBeenCalledTimes(1);expect(await importHasHeadroom(env)).toBe(false);
  expect(await env.DB.prepare("SELECT count(*) AS total FROM notifications WHERE type='OPERATION_ALERT'").first()).toEqual({total:1});
  await env.DB.prepare('UPDATE resource_usage SET observed_at=?').bind('2020-01-01T00:00:00.000Z').run();expect(await importHasHeadroom(env)).toBe(true);
 });
 it('concilia e-mail incerto sem enviar e só então aceita nova tentativa auditada',async()=>{
  const user=await actor();await env.DB.batch([
   env.DB.prepare("INSERT INTO notifications(id,type,entity_type,entity_id,title,body,dedupe_key,created_at) VALUES('n','CHECKOUT_PAID','checkout','synthetic','VALIDACAO','VALIDACAO','n',?)").bind(now()),
   env.DB.prepare("INSERT INTO notification_recipients(id,notification_id,user_id,channel,delivery_status,created_at,updated_at) VALUES('nr','n',?,'EMAIL','SEND_UNKNOWN',?,?)").bind(user,now(),now()),
   env.DB.prepare("INSERT INTO outbox_events(id,type,aggregate_id,payload_json,dispatch_state,hold_reason,created_at) VALUES('email','notification.email','n',?,'HELD','SEND_UNKNOWN',?)").bind(JSON.stringify({notificationId:'n',userId:user}),now()),
  ]);
  expect((await retry(req({reason:'VALIDACAO tentar antes de conferir'}),ctx('email'))).status).toBe(409);
  expect((await reconcile(req({outcome:'not-sent',reason:'VALIDACAO provedor confirmou ausência'}),ctx('email'))).status).toBe(200);
  expect((await retry(req({reason:'VALIDACAO novo envio autorizado'}),ctx('email'))).status).toBe(202);
  expect((await retry(req({reason:'VALIDACAO tentativa concorrente'}),ctx('email'))).status).toBe(409);
  expect(await env.DB.prepare("SELECT count(*) AS total FROM audit_log WHERE action IN ('operation.email.retry','operation.email.reconcile')").first()).toEqual({total:2});
 });
 it('libera o armazenamento do limitador IP quando a janela expira',async()=>{
  const stub=env.ADMIN_IP_LIMITER.getByName('synthetic-ip-expiry');for(let i=0;i<11;i++)await stub.consume();
  expect(await runInDurableObject(stub,async(_instance,state)=>Boolean(await state.storage.getAlarm()))).toBe(true);
  expect(await runDurableObjectAlarm(stub)).toBe(true);expect((await stub.consume()).limited).toBe(true);
  await runInDurableObject(stub,(_instance,state)=>{state.storage.sql.exec('UPDATE bucket SET started_at=?',Date.now()-900001);});
  expect(await runDurableObjectAlarm(stub)).toBe(true);expect((await stub.consume()).limited).toBe(false);
 });
 it('processa 28 recebimentos e login enquanto importa 100 mensagens, retomando sem perda',async()=>{
  const timestamp=Date.now();const queue=vi.fn(async()=>{});const runtime={...env,HISTORY_CRON_MESSAGE_BUDGET:'100',EVENTS_QUEUE:{send:queue} as unknown as Queue,UAZAPI_EVENTS_QUEUE:{send:queue} as unknown as Queue,OPENROUTER_API_KEY:undefined};
  const message=(id:string)=>({messageid:id,chatid:'5581999990001@s.whatsapp.net',text:'VALIDACAO capacidade',fromMe:false,messageTimestamp:timestamp});
  await acceptUazapiWebhook(runtime,'vendas',{token:'synthetic-vendas-token',EventType:'history',event:'messages',messages:Array.from({length:120},(_,i)=>message(`H-${i}`))},'req-capacity-history');
  for(let i=0;i<28;i++)await acceptUazapiWebhook(runtime,'vendas',{token:'synthetic-vendas-token',EventType:'messages',message:message(`LIVE-${i}`)},'req-capacity-live');
  const hash=await hashPassword('Synthetic-test-password!');await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,email,name,active,created_at,updated_at) VALUES('load-user','load@example.test','VALIDACAO',1,?,?)").bind(now(),now()),
   env.DB.prepare("INSERT INTO roles(id,user_id,role,created_at) VALUES('load-role','load-user','admin',?)").bind(now()),
   env.DB.prepare("INSERT INTO admin_credentials(user_id,password_hash,updated_at) VALUES('load-user',?,?)").bind(hash,now()),
  ]);
  const live=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.batch' AND request_id='req-capacity-live'").all<{external_id:string}>();
  const start=performance.now();
  const receive=async()=>{for(const batch of live.results)await processUazapiBatch(runtime,batch.external_id,0,{publishContinuation:false});const events=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE event_type='uazapi.incoming' AND request_id='req-capacity-live'").all<{external_id:string}>();for(const item of events.results)await processIncomingWhatsApp(runtime,item.external_id,{},'uazapi','receive-only');};
  const signIn=()=>login(new Request('https://newwed.test/api/auth/login',{method:'POST',headers:{origin:'https://newwed.test','content-type':'application/json','cf-connecting-ip':'198.51.100.30'},body:JSON.stringify({email:'load@example.test',password:'Synthetic-test-password!'})}));
  const responses=await Promise.all([receiver.scheduled({} as ScheduledController,runtime),receive(),signIn(),signIn()]);expect((responses[2] as Response).status).toBe(200);expect((responses[3] as Response).status).toBe(200);
  expect(await env.DB.prepare('SELECT count(*) AS total FROM messages').first()).toEqual({total:128});
  await receiver.scheduled({} as ScheduledController,runtime);await receiver.scheduled({} as ScheduledController,runtime);
  expect(await env.DB.prepare('SELECT count(*) AS total FROM messages').first()).toEqual({total:148});expect(await env.DB.prepare("SELECT count(*) AS total FROM messages WHERE direction='OUT'").first()).toEqual({total:0});
  console.info(JSON.stringify({event:'capacity.synthetic.validated',liveMessages:28,historyMessages:120,logins:2,durationMs:Math.round(performance.now()-start)}));
 },30000);
});
