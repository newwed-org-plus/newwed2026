import {z} from 'zod';
import {acquireLease,releaseLease} from './operation-lease';
import {publishOutbox} from './outbox';
import {readJsonWithLimit} from './request-context';
import type {RuntimeSecrets} from './secrets';
export type OperationsEnv=Pick<Env,'DB'|'EVENTS_QUEUE'> & RuntimeSecrets & {CLOUDFLARE_ACCOUNT_ID?:string;D1_READ_BUDGET?:string;D1_WRITE_BUDGET?:string;D1_BUDGET_WINDOW?:string;QUEUE_BUDGET?:string;UAZAPI_EVENTS_QUEUE?:Queue;ENABLE_EMAIL?:string};
export type Service='receiver'|'commercial';
type Snapshot={pending:number;oldest:string|null;watermark:string|null;failures:number};
export async function operationalSnapshot(env:Pick<Env,'DB'>,service:Service):Promise<Snapshot> {
 if(service==='receiver')return (await env.DB.prepare(`SELECT
  (SELECT count(*) FROM webhook_events WHERE provider='uazapi' AND processed_at IS NULL AND attempts<10) AS pending,
  (SELECT min(created_at) FROM webhook_events WHERE provider='uazapi' AND processed_at IS NULL AND attempts<10) AS oldest,
  (SELECT max(processed_at) FROM webhook_events WHERE provider='uazapi') AS watermark,
  (SELECT count(*) FROM webhook_events WHERE provider='uazapi' AND processed_at IS NULL AND attempts>=10)+(SELECT count(*) FROM history_imports WHERE completed_at IS NULL AND attempts>=10) AS failures`).first<Snapshot>())!;
 return (await env.DB.prepare(`SELECT
  (SELECT count(*) FROM outbox_events WHERE type NOT LIKE 'uazapi.%' AND dispatch_state IN ('PENDING','PUBLISHED','PROCESSING'))+(SELECT count(*) FROM webhook_events WHERE provider='asaas' AND processed_at IS NULL AND attempts<10) AS pending,
  (SELECT min(created_at) FROM (SELECT created_at FROM outbox_events WHERE type NOT LIKE 'uazapi.%' AND dispatch_state IN ('PENDING','PUBLISHED','PROCESSING') UNION ALL SELECT created_at FROM webhook_events WHERE provider='asaas' AND processed_at IS NULL AND attempts<10)) AS oldest,
  (SELECT max(processed_at) FROM outbox_events WHERE type NOT LIKE 'uazapi.%' AND processed_at IS NOT NULL) AS watermark,
  (SELECT count(*) FROM outbox_events WHERE type NOT LIKE 'uazapi.%' AND dispatch_state='FAILED')+(SELECT count(*) FROM webhook_events WHERE provider='asaas' AND processed_at IS NULL AND attempts>=10) AS failures`).first<Snapshot>())!;
}
export async function operationalAlert(env:OperationsEnv,key:string,title:string,body:string) {
 const day=new Date().toISOString().slice(0,10);const id=`ops:${key}:${day}`;const now=new Date().toISOString();
 const recipients=(await env.DB.prepare("SELECT DISTINCT u.id FROM users u JOIN roles r ON r.user_id=u.id WHERE u.active=1 AND r.role IN ('admin','gestor')").all<{id:string}>()).results;
 if(!recipients.length)return;
  const created=await env.DB.prepare("INSERT OR IGNORE INTO notifications(id,type,entity_type,entity_id,title,body,dedupe_key,created_at) VALUES (?,'OPERATION_ALERT','operation',?,?,?,?,?)").bind(id,key,title,body,id,now).run();
  if(!created.meta.changes)return;
 for(const user of recipients) {
  const eventId=`${id}:${user.id}`;
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO notification_recipients(id,notification_id,user_id,channel,delivery_status,sent_at,created_at,updated_at) VALUES (?,?,?,'IN_APP','SENT',?,?,?)").bind(`${eventId}:app`,id,user.id,now,now,now),
   env.DB.prepare("INSERT OR IGNORE INTO notification_recipients(id,notification_id,user_id,channel,delivery_status,created_at,updated_at) VALUES (?,?,?,'EMAIL','PENDING',?,?)").bind(`${eventId}:email`,id,user.id,now,now),
   env.DB.prepare("INSERT OR IGNORE INTO outbox_events(id,type,aggregate_id,dedupe_key,payload_json,created_at) VALUES (?,'notification.email',?,?,?,?)").bind(eventId,id,eventId,JSON.stringify({notificationId:id,userId:user.id}),now),
  ]);
  await publishOutbox(env,{id:eventId,type:'notification.email',notificationId:id,userId:user.id});
 }
}
export async function monitorCron(env:OperationsEnv,service:Service,work:()=>Promise<void>) {
 const token=await acquireLease(env,`cron:${service}`,240);if(!token)return;
 const started=new Date().toISOString();let error:unknown;
 try {
  await env.DB.prepare(`INSERT INTO operational_health(service,last_started_at) VALUES (?,?) ON CONFLICT(service) DO UPDATE SET last_started_at=excluded.last_started_at`).bind(service,started).run();
  try{await work();}catch(cause){error=cause;}
  const state=await operationalSnapshot(env,service);const now=new Date().toISOString();
  const previous=await env.DB.prepare('SELECT pending,watermark,failures,stalled_runs,failure_streak FROM operational_health WHERE service=?').bind(service).first<Snapshot & {stalled_runs:number;failure_streak:number}>();
  const stalled=state.pending>0&&previous&&previous.pending>0&&state.pending>=previous.pending&&String(state.watermark??'')<=String(previous.watermark??'')?previous.stalled_runs+1:0;
  const failureStreak=error?(previous?.failure_streak??0)+1:0;
  await env.DB.prepare(`UPDATE operational_health SET last_completed_at=?,last_success_at=CASE WHEN ?=0 THEN ? ELSE last_success_at END,last_error_code=?,pending=?,oldest_pending_at=?,watermark=?,failures=?,stalled_runs=?,failure_streak=?,peak_pending=max(peak_pending,?) WHERE service=?`)
   .bind(now,error?1:0,now,error?'CRON_FAILED':null,state.pending,state.oldest,state.watermark,state.failures,stalled,failureStreak,state.pending,service).run();
  await collectQueueBacklog(env,service).catch(()=>console.error(JSON.stringify({event:"operations.queue.metrics.unavailable",service})));
  if(stalled>=3||failureStreak>=3)await operationalAlert(env,`${service}:stalled`,'Operação sem progresso',`${service}: conferir execução, cotas e pendências. Três execuções consecutivas sem progresso ou com falha.`);
  if(state.failures>(previous?.failures??0))await operationalAlert(env,`${service}:failures`,'Novas falhas finais',`${service}: existem ${state.failures} falhas finais para revisão.`);
 }finally{await releaseLease(env,`cron:${service}`,token).catch(()=>undefined);}
 if(error)throw error;
}
const analyticsSchema=z.object({errors:z.array(z.unknown()).nullish(),data:z.object({viewer:z.object({accounts:z.array(z.object({d1AnalyticsAdaptiveGroups:z.array(z.object({sum:z.object({rowsRead:z.number().nonnegative(),rowsWritten:z.number().nonnegative()})})),queueMessageOperationsAdaptiveGroups:z.array(z.object({sum:z.object({billableOperations:z.number().nonnegative()})}))})).length(1)})}).nullish()});
export async function collectUsage(env:OperationsEnv,fetcher:typeof fetch=fetch) {
 if(!env.CLOUDFLARE_ANALYTICS_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)return {configured:false};
 const latest=await env.DB.prepare("SELECT max(observed_at) AS observed FROM resource_usage WHERE source='cloudflare-account-graphql'").first<{observed:string|null}>().catch(()=>{throw new Error('ANALYTICS_DB_READ');});
 if(latest?.observed&&Date.now()-Date.parse(latest.observed)<900000)return {configured:true,cached:true};
 const now=new Date();const end=now.toISOString().slice(0,10);const start=env.D1_BUDGET_WINDOW==='month'?`${end.slice(0,7)}-01`:end;
 const query=`query Usage($accountTag:string!,$start:Date!,$end:Date!,$datetimeStart:Time!,$datetimeEnd:Time!){viewer{accounts(filter:{accountTag:$accountTag}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$start,date_leq:$end}){sum{rowsRead rowsWritten}}queueMessageOperationsAdaptiveGroups(limit:10000,filter:{datetime_geq:$datetimeStart,datetime_leq:$datetimeEnd}){sum{billableOperations}}}}}`;
 const response=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:env.CLOUDFLARE_ACCOUNT_ID,start,end,datetimeStart:`${start}T00:00:00.000Z`,datetimeEnd:now.toISOString()}}),signal:AbortSignal.timeout(10000),redirect:'manual'}).catch(()=>{throw new Error('ANALYTICS_FETCH_FAILED');});
 if(!response.ok)throw new Error(`ANALYTICS_HTTP_${response.status}`);
 const parsed=analyticsSchema.safeParse(await readJsonWithLimit(response,65536).catch(()=>{throw new Error('ANALYTICS_RESPONSE');}));if(!parsed.success)throw new Error('ANALYTICS_SCHEMA');
 const result=parsed.data;if(result.errors?.length||!result.data)throw new Error('ANALYTICS_REJECTED');
 const totals=result.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups.reduce((sum,row)=>({read:sum.read+row.sum.rowsRead,write:sum.write+row.sum.rowsWritten}),{read:0,write:0});
 const queueOperations=result.data.viewer.accounts[0].queueMessageOperationsAdaptiveGroups.reduce((total,row)=>total+row.sum.billableOperations,0);
 for(const [resource,used,configured] of [['queues.operations',queueOperations,env.QUEUE_BUDGET],['d1.rowsRead',totals.read,env.D1_READ_BUDGET],['d1.rowsWritten',totals.write,env.D1_WRITE_BUDGET]] as const) {
  const budget=Number(configured);const limit=Number.isFinite(budget)&&budget>0?budget:null;
  await env.DB.prepare(`INSERT INTO resource_usage(resource,window_start,window_end,used,budget,observed_at,source) VALUES (?,?,?,?,?,?,'cloudflare-account-graphql') ON CONFLICT(resource) DO UPDATE SET window_start=excluded.window_start,window_end=excluded.window_end,used=excluded.used,budget=excluded.budget,observed_at=excluded.observed_at,source=excluded.source`).bind(resource,start,end,used,limit,now.toISOString()).run().catch(()=>{throw new Error('ANALYTICS_DB_WRITE');});
  if(limit&&used/limit>=0.8)await operationalAlert(env,`${resource}:budget`,'Consumo próximo do orçamento',`${resource}: ${Math.round(used/limit*100)}% do orçamento configurado. Rever importação e capacidade antes de ampliar.`);
 }
 return {configured:true,cached:false};
}
export async function importHasHeadroom(env:Pick<Env,'DB'>) {
 return !await env.DB.prepare("SELECT resource FROM resource_usage WHERE source='cloudflare-account-graphql' AND budget>0 AND (used>=budget*0.8 OR observed_at<? OR window_end!=?) LIMIT 1").bind(new Date(Date.now()-1800000).toISOString(),new Date().toISOString().slice(0,10)).first();
}

export async function collectQueueBacklog(env:OperationsEnv,service:Service) {
 const queue=service==='receiver'?env.UAZAPI_EVENTS_QUEUE:env.EVENTS_QUEUE;
 if(!queue||typeof queue.metrics!=='function')return;
 const metrics=await queue.metrics();const now=new Date().toISOString();
 await env.DB.prepare(`INSERT INTO resource_usage(resource,window_start,window_end,used,observed_at,source,oldest_item_at) VALUES (?,?,?,?,?,'queue-binding',?) ON CONFLICT(resource) DO UPDATE SET used=excluded.used,observed_at=excluded.observed_at,window_start=excluded.window_start,window_end=excluded.window_end,oldest_item_at=excluded.oldest_item_at`).bind(`queue.${service}.backlog`,now.slice(0,10),now.slice(0,10),metrics.backlogCount,now,metrics.oldestMessageTimestamp?.toISOString()??null).run();
}
