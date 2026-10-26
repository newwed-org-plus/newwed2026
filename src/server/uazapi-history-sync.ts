import {normalizeDeliveryStatus,observeUazapiDelivery} from './uazapi-delivery';
import {z} from 'zod';
import {HttpError} from './http';
import {configuredInstance,configuredInstances,uazapiRequest,type UazapiEnv} from './integrations/uazapi';
import {normalizeUazapiMessage,uazapiHistoryMessageSchema} from './uazapi-webhook';
import {processIncomingWhatsApp} from './conversation-processing';
import {acquireLease,releaseLease} from './operation-lease';
import {importHasHeadroom} from './operations';
import {retryAt} from './outbox';
import type {RuntimeSecrets} from './secrets';
type HistoryEnv=Env & RuntimeSecrets & {HISTORY_CRON_MESSAGE_BUDGET?:string};
const pageSchema=z.object({messages:z.array(z.unknown()).max(1000),hasMore:z.boolean().optional(),nextOffset:z.number().int().nonnegative().nullish(),pagination:z.object({hasMore:z.boolean(),nextOffset:z.number().int().nonnegative().nullish()}).optional()});
export function requireHistorySync(env:{ENABLE_HISTORY_SYNC?:string}) {
 if(String(env.ENABLE_HISTORY_SYNC)!=='true')throw new HttpError(503,'HISTORY_SYNC_DISABLED','Importação de histórico pausada neste ambiente.');
}
export async function startHistorySync(env:UazapiEnv & {ENABLE_HISTORY_SYNC?:string},lineId:string,userId:string) {
 requireHistorySync(env);if(!configuredInstance(env,lineId).baseUrl)throw new HttpError(503,'UAZAPI_SERVER_NOT_CONFIGURED','Configure o servidor desta linha.');
 const line=await env.DB.prepare('SELECT state FROM whatsapp_instances WHERE id=?').bind(lineId).first<{state:string}>();
 if(line?.state!=='connected')throw new HttpError(409,'WHATSAPP_DISCONNECTED','A linha precisa estar conectada para consultar o histórico.');
 const now=new Date().toISOString();const id=crypto.randomUUID();
 await env.DB.prepare("INSERT OR IGNORE INTO uazapi_history_syncs(id,line_id,status,requested_by,created_at,updated_at) VALUES (?,?,'PENDING',?,?,?)").bind(id,lineId,userId,now,now).run();
 const job=await env.DB.prepare("SELECT id FROM uazapi_history_syncs WHERE line_id=? AND status IN ('PENDING','RUNNING')").bind(lineId).first<{id:string}>();
 if(!job)throw new HttpError(409,'HISTORY_SYNC_CONFLICT','Atualize a linha e tente novamente.');
 await env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,created_at) VALUES (?,?,'whatsapp.history.sync','whatsapp_instance',?,?)").bind(crypto.randomUUID(),userId,lineId,now).run();return job;
}
export async function historySyncStatus(env:Pick<Env,'DB'>,lineId:string) {
 const [job,totals]=await Promise.all([
  env.DB.prepare('SELECT id,status,provider_offset,scanned_count,skipped_count,attempts,last_error,updated_at,completed_at FROM uazapi_history_syncs WHERE line_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(lineId).first(),
  env.DB.prepare('SELECT count(DISTINCT c.id) AS conversations,count(m.id) AS messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.whatsapp_instance_id=?').bind(lineId).first(),
 ]);return {job,totals};
}
export async function processPendingHistorySyncs(env:HistoryEnv,fetcher:typeof fetch=fetch) {
 if(String(env.ENABLE_HISTORY_SYNC)!=='true'||!await importHasHeadroom(env))return false;
 let touched=false;
 const now=new Date().toISOString();const configured=Number(env.HISTORY_CRON_MESSAGE_BUDGET??100);let remaining=Number.isFinite(configured)?Math.max(0,Math.min(1000,Math.floor(configured))):100;
 const jobs=await env.DB.prepare("SELECT id,line_id,provider_offset,attempts FROM uazapi_history_syncs WHERE status IN ('PENDING','RUNNING') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY updated_at LIMIT 20").bind(now).all<{id:string;line_id:string;provider_offset:number;attempts:number}>();
 for(const job of jobs.results) {
  if(remaining<=0)break;const token=await acquireLease(env,`history:${job.line_id}`);if(!token)continue;
  try {
   const limit=Math.min(100,remaining);remaining-=limit;touched=true;
   await env.DB.prepare("UPDATE uazapi_history_syncs SET status='RUNNING',updated_at=? WHERE id=?").bind(now,job.id).run();
   const page=pageSchema.parse(await uazapiRequest(configuredInstance(env,job.line_id),'/message/find',{limit,offset:job.provider_offset},fetcher,4*1024*1024));
   if(page.messages.length>limit)throw new Error('Provider pagination exceeded requested budget');
   let skipped=0;
   for(const raw of page.messages) {
    const parsed=uazapiHistoryMessageSchema.safeParse(raw);const normalized=parsed.success?normalizeUazapiMessage(job.line_id,parsed.data,true):null;
    if(!normalized){skipped++;continue;}
    const externalId=`message:${normalized.event.id}`;const timestamp=new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO webhook_events(id,provider,external_id,event_type,payload_json,request_id,created_at) VALUES (?,'uazapi',?,'uazapi.incoming',?,?,?)").bind(`pull:${normalized.event.id}`,externalId,JSON.stringify(normalized),job.id,timestamp).run();
    await processIncomingWhatsApp(env,externalId,{},'uazapi','receive-only');
    const status=parsed.success&&normalizeDeliveryStatus(parsed.data.status);if(normalized.event.fromMe&&status)await observeUazapiDelivery(env,job.line_id,normalized.event.id,status,timestamp);
   }
   const more=page.pagination?.hasMore??page.hasMore??page.messages.length===limit;
   const offset=page.pagination?.nextOffset??page.nextOffset??job.provider_offset+page.messages.length;
   if(more&&offset<=job.provider_offset)throw new Error('Provider cursor did not advance');
   const finished=new Date().toISOString();
   await env.DB.prepare("UPDATE uazapi_history_syncs SET status=?,provider_offset=?,scanned_count=scanned_count+?,skipped_count=skipped_count+?,attempts=0,next_attempt_at=NULL,last_error=NULL,updated_at=?,completed_at=? WHERE id=?").bind(more?'PENDING':'DONE',offset,page.messages.length,skipped,finished,more?null:finished,job.id).run();
  }catch {
   await env.DB.prepare("UPDATE uazapi_history_syncs SET status=?,attempts=attempts+1,next_attempt_at=?,last_error='Não foi possível consultar esta página. A importação retoma do progresso salvo.',updated_at=? WHERE id=?").bind(job.attempts>=9?'FAILED':'PENDING',retryAt(job.attempts),new Date().toISOString(),job.id).run();
  }finally{await releaseLease(env,`history:${job.line_id}`,token);}
 }
 return touched;
}

// Local callback recovery: only recent stored messages, without automatic replies.
export async function reconcileRecentLocalMessages(env:HistoryEnv,fetcher:typeof fetch=fetch) {
 if(env.ENVIRONMENT!=="development"||env.LOCAL_TEST_MODE!=="true"||String(env.ENABLE_HISTORY_SYNC)!=="true")return;
 if(await env.DB.prepare("SELECT id FROM uazapi_history_syncs WHERE status IN ('PENDING','RUNNING') LIMIT 1").first())return;
 const requested=Number(env.HISTORY_CRON_MESSAGE_BUDGET??100);let budget=Number.isFinite(requested)?Math.max(0,Math.min(1000,Math.floor(requested))):100;
 for(const line of configuredInstances(env)) {
  if(budget<=0)break;
  if(!line.baseUrl)continue;const connected=await env.DB.prepare("SELECT id FROM whatsapp_instances WHERE id=? AND state='connected'").bind(line.id).first();if(!connected)continue;
  const limit=Math.min(25,budget);budget-=limit;
  const page=pageSchema.parse(await uazapiRequest(line,'/message/find',{limit,offset:0},fetcher,4*1024*1024));
  for(const raw of page.messages.slice(0,limit)) {
   const parsed=uazapiHistoryMessageSchema.safeParse(raw);const normalized=parsed.success?normalizeUazapiMessage(line.id,parsed.data,true):null;if(!normalized)continue;
   const externalId=`message:${normalized.event.id}`;const now=new Date().toISOString();
   const created=await env.DB.prepare("INSERT OR IGNORE INTO webhook_events(id,provider,external_id,event_type,payload_json,created_at) VALUES (?,'uazapi',?,'uazapi.incoming',?,?)").bind(`pull:${normalized.event.id}`,externalId,JSON.stringify(normalized),now).run();
   if(created.meta.changes)await processIncomingWhatsApp(env,externalId,{},'uazapi','receive-only');
   const status=parsed.success&&normalizeDeliveryStatus(parsed.data.status);if(normalized.event.fromMe&&status)await observeUazapiDelivery(env,line.id,normalized.event.id,status,now);
  }
 }
}
