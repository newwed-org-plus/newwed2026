import {applyUazapiDelivery,normalizeDeliveryStatus,receiptTime,type DeliveryStatus} from "./uazapi-delivery";
import { z } from "zod";
import { configuredInstance,uazapiMessageId,type UazapiEnv } from "@/server/integrations/uazapi";
import { ensureWhatsAppLines } from "@/server/whatsapp-lines";
import { HttpError } from "@/server/http";
import { sha256 } from "@/server/normalization";
import { timingSafeEqual } from "@/server/crypto";
import { publishOutbox } from "@/server/outbox";

export const uazapiHistoryMessageSchema = z.object({
  id:z.string().max(256).optional(),messageid:z.string().max(256).optional(),chatid:z.string().max(100),
  senderName:z.string().max(200).optional(),fromMe:z.boolean().optional(),wasSentByApi:z.boolean().optional(),isGroup:z.boolean().optional(),
  status:z.string().max(80).optional(),messageType:z.string().max(100).optional(),text:z.string().max(32_000).nullish(),messageTimestamp:z.number().optional(),
});
const messageSchema=uazapiHistoryMessageSchema;
type MessageInput = z.infer<typeof messageSchema>;
export type UazapiIncoming = { event:{ id:string;from:string;type:string;text:{body:string};fromMe:boolean;history:boolean;createdAt:string;contactName:string|null };lineId:string };

export function normalizeUazapiMessage(lineId: string,message: MessageInput,history = false): UazapiIncoming|null {
  const match = /^(\d{10,15})@s\.whatsapp\.net$/.exec(message.chatid);
  const id = message.messageid || message.id;
  if (!match || !id || message.isGroup || (message.wasSentByApi&&!history)) return null;
  const rawTimestamp = message.messageTimestamp;
  const timestamp = rawTimestamp&&rawTimestamp<100_000_000_000?rawTimestamp*1000:rawTimestamp;
  const createdAt = timestamp && timestamp > 0 && timestamp < Date.now()+86_400_000 ? new Date(timestamp).toISOString() : new Date().toISOString();
  return { lineId,event:{ id:uazapiMessageId(lineId,id),from:match[1],type:message.text ? "text" : (message.messageType ?? "unknown").slice(0,100),
    text:{body:message.text ?? ""},fromMe:message.fromMe ?? false,history,createdAt,contactName:message.fromMe ? null : message.senderName ?? null } };
}

type WebhookEnv = UazapiEnv & Pick<Env,"EVENTS_QUEUE">;
export async function acceptUazapiWebhook(env: WebhookEnv,lineId: string,input: unknown,requestId: string) {
  const config = configuredInstance(env,lineId);
  const envelope = z.object({ token:z.string().max(512),EventType:z.string().max(80) }).safeParse(input);
  // Compare fixed-length digests; never persist or log the envelope's instance token.
  if (!envelope.success || !timingSafeEqual(await sha256(envelope.data.token),await sha256(config.token))) throw new HttpError(401,"INVALID_WEBHOOK_TOKEN","Webhook não autorizado.");
  await ensureWhatsAppLines(env);
  const type = envelope.data.EventType;
  const candidates:Array<{externalId:string;type:string;payload:unknown}> = [];
  if (type === "messages" || type === "history") {
    const history = type === "history";
    let raw:MessageInput[];
    if (history) {
      const body = z.object({ event:z.string(),messages:z.array(messageSchema).max(2000).optional() }).parse(input);
      if (body.event !== "messages") return { received:true,queued:0,ignored:true };
      raw = body.messages ?? [];
    } else { raw = [z.object({ message:messageSchema.refine(value => typeof value.fromMe === "boolean") }).parse(input).message]; }
    for (const item of raw) {
      const payload = normalizeUazapiMessage(lineId,item,history);
      if (payload) candidates.push({externalId:`${history ? "history" : "message"}:${payload.event.id}`,type:"uazapi.incoming",payload});
    }
  } else if (type === "messages_update") {
    const body = z.object({ state:z.string().optional(),event:z.object({ MessageIDs:z.array(z.string().max(256)).max(200),Type:z.string().optional(),Timestamp:z.number().optional(),IsGroup:z.boolean().optional(),IsFromMe:z.boolean().optional() }) }).parse(input);
    const state = (body.state ?? body.event.Type ?? "").toLowerCase();
    const status=normalizeDeliveryStatus(state);
    if (!status || body.event.IsGroup || body.event.IsFromMe === false) return { received:true,queued:0,ignored:true };
    for (const id of body.event.MessageIDs) {
      const messageId = uazapiMessageId(lineId,id);
      candidates.push({externalId:`status:${messageId}:${status}`,type:"uazapi.status",payload:{lineId,messageId,status,observedAt:receiptTime(body.event.Timestamp)}});
    }
  } else {
    // Connection webhooks can arrive out of order. /instance/status is authoritative.
    return { received:true,queued:0,ignored:true };
  }
  if (!candidates.length) return {received:true,queued:0,ignored:true};
  // Store large history batches once. Fan-out happens in bounded Queue jobs.
  const externalId = `batch:${lineId}:${await sha256(JSON.stringify(candidates))}`;
  const outboxId = `uazapi.batch:${externalId}:0`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO webhook_events (id,provider,external_id,event_type,payload_json,request_id,created_at) VALUES (?,'uazapi',?,'uazapi.batch',?,?,?)")
      .bind(crypto.randomUUID(),externalId,JSON.stringify(candidates),requestId,now),
    env.DB.prepare("INSERT OR IGNORE INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at) SELECT ?,'uazapi.batch',?,?,?,0,?,? WHERE changes()=1")
      .bind(outboxId,externalId,outboxId,JSON.stringify({externalId,targetCount:0,requestId}),requestId,now),
  ]);
  const pending = await env.DB.prepare("SELECT published_at FROM outbox_events WHERE id=?").bind(outboxId).first<{published_at:string|null}>();
  const published = pending && !pending.published_at && await publishOutbox(env,{id:outboxId,type:"uazapi.batch",externalId,targetCount:0,requestId});
  return {received:true,queued:published ? candidates.length : 0,ignored:false};
}

type NormalizedEvent = {externalId:string;type:string;payload:unknown};
type ProcessBatchOptions = { processHistory?: (externalId:string)=>Promise<void>;publishContinuation?: boolean;chunkSize?:number };
function isHistoryPayload(payload: unknown) {
  return Boolean(payload && typeof payload === "object" && (payload as {event?:{history?:unknown}}).event?.history === true);
}

export async function processUazapiBatch(env: WebhookEnv,externalId: string,offset = 0,options: ProcessBatchOptions = {}) {
  const stored = await env.DB.prepare("SELECT id,payload_json,request_id FROM webhook_events WHERE provider='uazapi' AND external_id=?")
    .bind(externalId).first<{id:string;payload_json:string;request_id:string}>();
  if (!stored) return {nextOffset:null};
  const candidates = JSON.parse(stored.payload_json) as NormalizedEvent[];
  const chunk = candidates.slice(offset,offset+Math.min(10,Math.max(1,options.chunkSize ?? 10)));
  if (!chunk.length) {
    await env.DB.prepare("UPDATE webhook_events SET processed_at=? WHERE id=? AND processed_at IS NULL").bind(new Date().toISOString(),stored.id).run();
    return {nextOffset:null};
  }
  const now = new Date().toISOString();
  const statements = chunk.flatMap(item => [
    env.DB.prepare("INSERT OR IGNORE INTO webhook_events (id,provider,external_id,event_type,payload_json,request_id,created_at) VALUES (?,'uazapi',?,?,?,?,?)")
      .bind(crypto.randomUUID(),item.externalId,item.type,JSON.stringify(item.payload),stored.request_id,now),
    ...(options.processHistory && isHistoryPayload(item.payload) ? [] : [env.DB.prepare("INSERT OR IGNORE INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at) SELECT ?,?,?,?,?,0,?,? WHERE changes()=1")
      .bind(`uazapi:${item.externalId}`,item.type,item.externalId,`uazapi:${item.externalId}`,JSON.stringify({externalId:item.externalId,requestId:stored.request_id}),stored.request_id,now)]),
  ]);
  const next = offset+chunk.length;
  const continuationId = `uazapi.batch:${externalId}:${next}`;
  if (next < candidates.length) statements.push(env.DB.prepare("INSERT OR IGNORE INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at) VALUES (?,'uazapi.batch',?,?,?,0,?,?)")
    .bind(continuationId,externalId,continuationId,JSON.stringify({externalId,targetCount:next,requestId:stored.request_id}),stored.request_id,now));
  await env.DB.batch(statements);
  for (const item of chunk) {
    if (options.processHistory && isHistoryPayload(item.payload)) {
      await options.processHistory(item.externalId);
      // Older deployments created one outbox row per historical message. Mark it handled
      // after direct D1 processing so quota recovery does not enqueue it again.
      await env.DB.prepare("UPDATE outbox_events SET published_at=coalesce(published_at,?),next_attempt_at=NULL,last_error=NULL WHERE id=?")
        .bind(now,`uazapi:${item.externalId}`).run();
    } else {
      // Repeated publication is safe: each leaf event has a persistent processed marker.
      await publishOutbox(env,{id:`uazapi:${item.externalId}`,type:item.type,externalId:item.externalId,requestId:stored.request_id});
    }
  }
  if (next < candidates.length && options.publishContinuation !== false) await publishOutbox(env,{id:continuationId,type:"uazapi.batch",externalId,targetCount:next,requestId:stored.request_id});
  if (next >= candidates.length) await env.DB.prepare("UPDATE webhook_events SET processed_at=? WHERE id=? AND processed_at IS NULL").bind(now,stored.id).run();
  return {nextOffset:next < candidates.length ? next : null};
}

export async function processUazapiStatus(env: Pick<Env,"DB">,externalId: string) {
  const stored = await env.DB.prepare("SELECT id,payload_json FROM webhook_events WHERE provider='uazapi' AND external_id=? AND processed_at IS NULL")
    .bind(externalId).first<{id:string;payload_json:string}>();
  if (!stored) return;
  const {messageId,status,observedAt} = JSON.parse(stored.payload_json) as {messageId:string;status:DeliveryStatus;observedAt?:string};
  await applyUazapiDelivery(env,messageId,status,observedAt);
  await env.DB.prepare("UPDATE webhook_events SET processed_at=? WHERE id=?").bind(new Date().toISOString(),stored.id).run();
  await reconcileUazapiReceipt(env,messageId);
}

export async function reconcileUazapiReceipt(env: Pick<Env,"DB">,messageId: string) {
  if (!messageId.startsWith("uazapi:")) return;
  const evidence=await env.DB.prepare(`SELECT external_id,payload_json,created_at FROM webhook_events WHERE provider='uazapi' AND external_id IN (?,?,?,?)
   ORDER BY CASE external_id WHEN ? THEN 4 WHEN ? THEN 3 WHEN ? THEN 2 ELSE 1 END DESC LIMIT 1`)
   .bind(`status:${messageId}:READ`,`status:${messageId}:DELIVERED`,`status:${messageId}:FAILED`,`status:${messageId}:SENT`,
    `status:${messageId}:READ`,`status:${messageId}:DELIVERED`,`status:${messageId}:FAILED`).first<{external_id:string;payload_json:string;created_at:string}>();
  if(evidence){const data=JSON.parse(evidence.payload_json) as {status?:DeliveryStatus;observedAt?:string};const status=normalizeDeliveryStatus(data.status)??normalizeDeliveryStatus(evidence.external_id.split(':').at(-1));if(status)await applyUazapiDelivery(env,messageId,status,data.observedAt??evidence.created_at);}
}
