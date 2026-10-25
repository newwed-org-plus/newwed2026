import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,json } from "@/server/http";

export async function GET(request:Request) {
  try {
    await requireAccessUser(request,["admin","gestor"]);
    const [outbox,webhooks,checkouts,messages,conversations,email,counts,health,usage,retained,finalFailures] = await Promise.all([
      env.DB.prepare("SELECT id,type,aggregate_id AS entity_id,last_error AS error,attempts,request_id,created_at FROM outbox_events WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT id,'webhook.'||provider AS type,external_id AS entity_id,error,attempts,request_id,created_at FROM webhook_events WHERE error IS NOT NULL ORDER BY created_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT id,'checkout' AS type,id AS entity_id,last_error AS error,retry_count AS attempts,request_id,created_at FROM checkouts WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT id,'message' AS type,id AS entity_id,last_error AS error,0 AS attempts,request_id,created_at FROM messages WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT id,'agent' AS type,id AS entity_id,agent_error AS error,0 AS attempts,request_id,created_at FROM conversations WHERE agent_error IS NOT NULL ORDER BY created_at DESC LIMIT 30").all(),
      env.DB.prepare(`SELECT nr.id,'email' AS type,nr.notification_id AS entity_id,nr.last_error AS error,nr.attempts,n.request_id,nr.created_at
        FROM notification_recipients nr JOIN notifications n ON n.id=nr.notification_id WHERE nr.channel='EMAIL' AND nr.last_error IS NOT NULL ORDER BY nr.created_at DESC LIMIT 30`).all(),
      env.DB.prepare(`SELECT
       (SELECT count(*) FROM outbox_events WHERE last_error IS NOT NULL) AS queue,
       (SELECT count(*) FROM webhook_events WHERE error IS NOT NULL) AS webhooks,
       (SELECT count(*) FROM checkouts WHERE last_error IS NOT NULL) AS checkouts,
       (SELECT count(*) FROM messages WHERE last_error IS NOT NULL) AS meta,
       (SELECT count(*) FROM conversations WHERE agent_error IS NOT NULL) AS openai,
       (SELECT count(*) FROM notification_recipients WHERE channel='EMAIL' AND last_error IS NOT NULL) AS email,
       (SELECT count(*) FROM outbox_events WHERE dispatch_state IN ('PENDING','PUBLISHED','PROCESSING')) AS pending,
       (SELECT min(created_at) FROM outbox_events WHERE dispatch_state IN ('PENDING','PUBLISHED','PROCESSING')) AS oldestPendingAt,
       (SELECT count(*) FROM outbox_events WHERE dispatch_state='HELD') AS held,
       (SELECT count(*) FROM outbox_events WHERE dispatch_state='FAILED') AS finalFailures,
       (SELECT count(*) FROM messages WHERE status='SEND_UNKNOWN') AS uncertainMessages,
       (SELECT count(*) FROM notification_recipients WHERE channel='EMAIL' AND delivery_status='SEND_UNKNOWN') AS uncertainEmail,
       (SELECT count(*) FROM history_imports WHERE completed_at IS NULL AND attempts<10) AS historyImports,
       (SELECT min(updated_at) FROM history_imports WHERE completed_at IS NULL AND attempts<10) AS oldestHistoryAt,
       (SELECT count(*) FROM webhook_events WHERE provider='uazapi' AND processed_at IS NULL AND json_extract(payload_json,'$.event.history')=1) AS historicalMessages,
       (SELECT min(created_at) FROM webhook_events WHERE provider='uazapi' AND processed_at IS NULL) AS oldestInboundAt,
       (SELECT count(*) FROM webhook_events WHERE provider='uazapi' AND processed_at IS NULL) AS inboundPending`).first(),
      env.DB.prepare('SELECT * FROM operational_health ORDER BY service').all(),
      env.DB.prepare('SELECT * FROM resource_usage ORDER BY resource').all(),
      env.DB.prepare("SELECT id,type,aggregate_id AS entity_id,hold_reason,created_at FROM outbox_events WHERE dispatch_state='HELD' ORDER BY created_at,id LIMIT 50").all(),
      env.DB.prepare("SELECT id,type,aggregate_id AS entity_id,last_error AS error,created_at FROM outbox_events WHERE dispatch_state='FAILED' ORDER BY created_at,id LIMIT 50").all(),
    ]);
    const items = [...outbox.results,...webhooks.results,...checkouts.results,...messages.results,...conversations.results,...email.results]
      .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0,100);
    return json({items,counts,health:health.results,usage:usage.results,retained:retained.results,finalFailures:finalFailures.results,asOf:new Date().toISOString()});
  } catch (error) { return errorResponse(error); }
}
