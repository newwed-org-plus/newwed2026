import { processIncomingWhatsApp } from "@/server/conversation-processing";
import { publishOutbox,retryAt,type QueueEvent } from "@/server/outbox";
import { processUazapiBatch,processUazapiStatus } from "@/server/uazapi-webhook";

// Dedicated inbound queue: no checkout, email, manual sends or automatic replies.
type ReceiverEnv = Env & { UAZAPI_EVENTS_QUEUE?:Queue };
type BatchPayload = QueueEvent & {externalId:string;targetCount?:number};

function isHistoryPayload(payload:unknown) {
  return Boolean(payload && typeof payload === "object" && (payload as {event?:{history?:unknown}}).event?.history === true);
}

async function markOutboxHandled(env:Pick<Env,"DB">,id:string) {
  await env.DB.prepare("UPDATE outbox_events SET published_at=coalesce(published_at,?),next_attempt_at=NULL,last_error=NULL WHERE id=?")
    .bind(new Date().toISOString(),id).run();
}

async function processHistoryMessage(env:ReceiverEnv,externalId:string) {
  const result=await processIncomingWhatsApp({...env,OPENROUTER_API_KEY:undefined},externalId,{},"uazapi");
  if (!result.processed && !result.duplicate) throw new Error("UAZAPI history event was not processed");
  await markOutboxHandled(env,`uazapi:${externalId}`);
}

async function batchIsHistory(env:Pick<Env,"DB">,externalId:string) {
  const stored=await env.DB.prepare("SELECT payload_json FROM webhook_events WHERE provider='uazapi' AND event_type='uazapi.batch' AND external_id=?")
    .bind(externalId).first<{payload_json:string}>();
  if (!stored) return false;
  const candidates=JSON.parse(stored.payload_json) as Array<{payload?:unknown}>;
  return candidates.some(item=>isHistoryPayload(item.payload));
}

async function noteRecoveryFailure(env:Pick<Env,"DB">,id:string,attempts:number) {
  await env.DB.prepare("UPDATE outbox_events SET attempts=?,next_attempt_at=?,last_error='UAZAPI history recovery failed' WHERE id=?")
    .bind(attempts+1,retryAt(attempts),id).run();
}

export default {
  async queue(batch,env) {
    for (const message of batch.messages) {
      const event = message.body as QueueEvent;
      try {
        if (!event.externalId) throw new Error("Missing UAZAPI event identifier");
        if (event.type === "uazapi.batch") await processUazapiBatch(env,event.externalId,event.targetCount,{processHistory:id=>processHistoryMessage(env,id)});
        else if (event.type === "uazapi.incoming") await processIncomingWhatsApp({...env,OPENROUTER_API_KEY:undefined},event.externalId,{},"uazapi");
        else if (event.type === "uazapi.status") await processUazapiStatus(env,event.externalId);
        else throw new Error("Unsupported inbound event type");
        message.ack();
      } catch {
        console.error(JSON.stringify({event:"uazapi.receive.failed",messageId:message.id,requestId:event.requestId}));
        message.retry();
      }
    }
  },
  async scheduled(_controller,env) {
    const workerEnv=env as ReceiverEnv;
    const now=new Date().toISOString();
    let historyChunkBudget=10;
    const pendingBatches=await env.DB.prepare("SELECT id,payload_json,attempts,next_attempt_at FROM outbox_events WHERE type='uazapi.batch' AND published_at IS NULL ORDER BY created_at LIMIT 50")
      .all<{id:string;payload_json:string;attempts:number;next_attempt_at:string|null}>();
    for (const pending of pendingBatches.results) {
      const current=await env.DB.prepare("SELECT published_at FROM outbox_events WHERE id=?").bind(pending.id).first<{published_at:string|null}>();
      if (current?.published_at) continue;
      const payload=JSON.parse(pending.payload_json) as BatchPayload;
      const history=Boolean(payload.externalId && await batchIsHistory(env,payload.externalId));
      if (!history) {
        if (pending.next_attempt_at && pending.next_attempt_at>now) continue;
        if (!payload.externalId) continue;
        await publishOutbox(env,{...payload,id:pending.id,type:"uazapi.batch"});
        continue;
      }
      let offset=payload.targetCount ?? 0;
      let outboxId=pending.id;
      try {
        while (historyChunkBudget>0) {
          const result=await processUazapiBatch(workerEnv,payload.externalId,offset,{processHistory:id=>processHistoryMessage(workerEnv,id),publishContinuation:false});
          await markOutboxHandled(env,outboxId);
          historyChunkBudget--;
          if (result.nextOffset===null) break;
          offset=result.nextOffset;
          outboxId=`uazapi.batch:${payload.externalId}:${offset}`;
        }
      } catch {
        await noteRecoveryFailure(env,outboxId,pending.attempts);
        console.error(JSON.stringify({event:"uazapi.history.recovery.failed"}));
        break;
      }
      if (historyChunkBudget===0) break;
    }

    // Recover historical messages already fanned out by earlier versions, including
    // records whose Queue publication hit the account's daily write limit.
    const pendingHistory=await env.DB.prepare("SELECT external_id FROM webhook_events WHERE provider='uazapi' AND event_type='uazapi.incoming' AND processed_at IS NULL AND json_extract(payload_json,'$.event.history')=1 ORDER BY created_at LIMIT 50")
      .all<{external_id:string}>();
    for (const event of pendingHistory.results) {
      try { await processHistoryMessage(workerEnv,event.external_id); }
      catch { console.error(JSON.stringify({event:"uazapi.history.message.recovery.failed"})); }
    }

    const pending=await env.DB.prepare("SELECT id,type,payload_json,attempts FROM outbox_events WHERE type IN ('uazapi.incoming','uazapi.status') AND published_at IS NULL AND attempts<10 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 50")
      .bind(now).all<{id:string;type:string;payload_json:string;attempts:number}>();
    for (const item of pending.results) {
      const payload=JSON.parse(item.payload_json) as QueueEvent;
      if (!payload.externalId) continue;
      if (item.type==="uazapi.status") {
        await processUazapiStatus(env,payload.externalId);
        await markOutboxHandled(env,item.id);
        continue;
      }
      const stored=await env.DB.prepare("SELECT payload_json FROM webhook_events WHERE provider='uazapi' AND event_type='uazapi.incoming' AND external_id=?")
        .bind(payload.externalId).first<{payload_json:string}>();
      if (stored && isHistoryPayload(JSON.parse(stored.payload_json))) {
        try { await processHistoryMessage(workerEnv,payload.externalId); }
        catch { await noteRecoveryFailure(env,item.id,item.attempts); }
      } else {
        await publishOutbox(env,{...payload,id:item.id,type:item.type});
      }
    }
  },
} satisfies ExportedHandler<Env>;
