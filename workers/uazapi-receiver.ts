import {importHasHeadroom,monitorCron} from "@/server/operations";
import { processIncomingWhatsApp } from "@/server/conversation-processing";
import { publishOutbox,retryAt,type QueueEvent } from "@/server/outbox";
import { processUazapiBatch,processUazapiStatus } from "@/server/uazapi-webhook";
import { acquireLease,releaseLease } from "@/server/operation-lease";
import { isDailyQuotaError } from "@/server/database-availability";

// This worker holds no provider credentials and cannot send external messages.
type ReceiverEnv=Env & {HISTORY_CRON_MESSAGE_BUDGET?:string};
function history(payload:unknown) {return Boolean(payload && typeof payload==='object' && (payload as {event?:{history?:boolean}}).event?.history);}
async function handled(env:Pick<Env,'DB'>,id:string) {
  await env.DB.prepare("UPDATE outbox_events SET published_at=coalesce(published_at,?),dispatch_state='DONE',processed_at=coalesce(processed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),next_attempt_at=NULL,last_error=NULL WHERE id=?").bind(new Date().toISOString(),id).run();
}
async function storedPayload(env:Pick<Env,'DB'>,externalId:string) {
  return env.DB.prepare("SELECT payload_json,processed_at FROM webhook_events WHERE provider='uazapi' AND external_id=?").bind(externalId).first<{payload_json:string;processed_at:string|null}>();
}
async function historyMessage(env:ReceiverEnv,externalId:string) {
  const result=await processIncomingWhatsApp({...env,OPENROUTER_API_KEY:undefined},externalId,{},'uazapi');
  if(!result.processed && !result.duplicate)throw new Error('History event not processed');
  await handled(env,`uazapi:${externalId}`);
}
async function recover(env:ReceiverEnv) {
  const now=new Date().toISOString();
  // Retry live events first; history is always recovered through the bounded path below.
  const pending=await env.DB.prepare("SELECT id,type,payload_json FROM outbox_events WHERE type IN ('uazapi.incoming','uazapi.status','uazapi.batch') AND published_at IS NULL AND attempts<10 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 50").bind(now).all<{id:string;type:string;payload_json:string}>();
  for(const item of pending.results) {
    const event=JSON.parse(item.payload_json) as QueueEvent;
    if(!event.externalId)continue;
    const stored=await storedPayload(env,event.externalId);
    if(!stored)continue;
    const payload=JSON.parse(stored.payload_json);
    if(history(payload) || (Array.isArray(payload) && payload.some(item=>history(item.payload))))continue;
    if(item.type==='uazapi.status') {await processUazapiStatus(env,event.externalId);await handled(env,item.id);}
    else await publishOutbox(env,{...event,id:item.id,type:item.type});
  }
  if(!await importHasHeadroom(env))return;
  // Discover durable parent batches even if their Queue message was already accepted.
  const batches=await env.DB.prepare("SELECT external_id,payload_json FROM webhook_events WHERE provider='uazapi' AND event_type='uazapi.batch' AND processed_at IS NULL ORDER BY created_at LIMIT 50").all<{external_id:string;payload_json:string}>();
  for(const batch of batches.results) {
    const candidates=JSON.parse(batch.payload_json) as Array<{payload?:{lineId?:string}}>;
    const item=candidates.find(item=>history(item.payload));
    if(!item?.payload?.lineId)continue;
    await env.DB.prepare("INSERT OR IGNORE INTO history_imports (external_id,line_id,updated_at) VALUES (?,?,?)").bind(batch.external_id,item.payload.lineId,now).run();
  }
  const configured=Number(env.HISTORY_CRON_MESSAGE_BUDGET ?? 100);
  let remaining=Number.isFinite(configured) ? Math.min(1000,Math.max(0,Math.floor(configured))) : 100;
  const jobs=await env.DB.prepare("SELECT external_id,line_id,cursor,attempts FROM history_imports WHERE completed_at IS NULL AND attempts<10 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY updated_at LIMIT 50").bind(now).all<{external_id:string;line_id:string;cursor:number;attempts:number}>();
  for(const job of jobs.results) {
    if(remaining===0)break;
    const key=`history:${job.line_id}`;
    const token=await acquireLease(env,key);
    if(!token)continue;
    try {
      const latest=await env.DB.prepare("SELECT cursor,completed_at FROM history_imports WHERE external_id=?").bind(job.external_id).first<{cursor:number;completed_at:string|null}>();
      if(!latest || latest.completed_at)continue;
      let cursor=latest.cursor;
      while(remaining>0) {
        const size=Math.min(10,remaining);
        remaining-=size; // Count attempted work too; retries never exceed this invocation's budget.
        const result=await processUazapiBatch(env,job.external_id,cursor,{processHistory:id=>historyMessage(env,id),publishContinuation:false,chunkSize:size});
        const complete=result.nextOffset===null;
        cursor=result.nextOffset ?? cursor;
        const timestamp=new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare("UPDATE history_imports SET cursor=?,completed_at=?,next_attempt_at=NULL,updated_at=? WHERE external_id=?").bind(cursor,complete ? timestamp : null,timestamp,job.external_id),
          env.DB.prepare("UPDATE operation_leases SET expires_at=? WHERE id=? AND token=?").bind(new Date(Date.now()+120_000).toISOString(),key,token),
        ]);
        if(complete) {
          await env.DB.prepare("UPDATE outbox_events SET published_at=coalesce(published_at,?),dispatch_state='DONE',processed_at=coalesce(processed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),next_attempt_at=NULL,last_error=NULL WHERE type='uazapi.batch' AND aggregate_id=?").bind(timestamp,job.external_id).run();
          break;
        }
      }
    } catch(error) {
      if(isDailyQuotaError(error))throw error;
      await env.DB.prepare("UPDATE history_imports SET attempts=attempts+1,next_attempt_at=?,updated_at=? WHERE external_id=?").bind(retryAt(job.attempts),now,job.external_id).run();
      console.error(JSON.stringify({event:'uazapi.history.recovery.failed'}));
    } finally {await releaseLease(env,key,token).catch(()=>undefined);}
  }
  const legacy=await env.DB.prepare("SELECT external_id,payload_json,attempts FROM webhook_events WHERE provider='uazapi' AND event_type='uazapi.incoming' AND processed_at IS NULL AND json_extract(payload_json,'$.event.history')=1 AND attempts<10 AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY created_at LIMIT ?").bind(now,remaining).all<{external_id:string;payload_json:string;attempts:number}>();
  for(const item of legacy.results) {
    const lineId=(JSON.parse(item.payload_json) as {lineId:string}).lineId;
    const key=`history:${lineId}`;
    const token=await acquireLease(env,key);
    if(!token)continue;
    try {await historyMessage(env,item.external_id);}
    catch(error) {if(isDailyQuotaError(error))throw error;await env.DB.prepare("UPDATE webhook_events SET attempts=attempts+1,next_retry_at=?,error='Falha na importação; revisão após o limite.' WHERE provider='uazapi' AND external_id=? AND processed_at IS NULL").bind(retryAt(item.attempts),item.external_id).run();console.error(JSON.stringify({event:'uazapi.history.message.recovery.failed'}));}
    finally {await releaseLease(env,key,token).catch(()=>undefined);}
  }
}
export default {
  async queue(batch,env) {
    for(const message of batch.messages) {
      const event=message.body as QueueEvent;
      try {
        if(!event.externalId)throw new Error('Missing event identifier');
        const stored=await storedPayload(env,event.externalId);
        const payload=stored ? JSON.parse(stored.payload_json) : null;
        const historical=history(payload) || (Array.isArray(payload) && payload.some(item=>history(item.payload)));
        // Parent/legacy history remains durable in D1; cron owns its budget and line lease.
        if(!historical) {
          if(event.type==='uazapi.batch')await processUazapiBatch(env,event.externalId,event.targetCount);
          else if(event.type==='uazapi.incoming')await processIncomingWhatsApp({...env,OPENROUTER_API_KEY:undefined},event.externalId,{},'uazapi','receive-only');
          else if(event.type==='uazapi.status')await processUazapiStatus(env,event.externalId);
          else throw new Error('Unsupported inbound event');
          if(event.id)await handled(env,event.id);
        }
        message.ack();
      } catch(error) {
        console.error(JSON.stringify({event:isDailyQuotaError(error) ? 'uazapi.quota.exhausted' : 'uazapi.receive.failed',messageId:message.id}));
        message.retry(isDailyQuotaError(error) ? {delaySeconds:3600} : undefined);
      }
    }
  },
  async scheduled(_controller,env) {
    try {await monitorCron(env,"receiver",()=>recover(env));}
    catch(error) {
      console.error(JSON.stringify({event:isDailyQuotaError(error) ? 'uazapi.quota.exhausted' : 'uazapi.recovery.failed'}));
      throw new Error("UAZAPI recovery temporarily unavailable");
    }
  },
} satisfies ExportedHandler<Env>;
