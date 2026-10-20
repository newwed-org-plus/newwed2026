import { processIncomingWhatsApp } from "@/server/conversation-processing";
import { publishOutbox,type QueueEvent } from "@/server/outbox";
import { processUazapiBatch,processUazapiStatus } from "@/server/uazapi-webhook";

// Dedicated inbound queue: no checkout, email, manual sends or automatic replies.
export default {
  async queue(batch,env) {
    for (const message of batch.messages) {
      const event = message.body as QueueEvent;
      try {
        if (!event.externalId) throw new Error("Missing UAZAPI event identifier");
        if (event.type === "uazapi.batch") await processUazapiBatch(env,event.externalId,event.targetCount);
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
    const pending = await env.DB.prepare("SELECT id,type,payload_json FROM outbox_events WHERE type IN ('uazapi.batch','uazapi.incoming','uazapi.status') AND published_at IS NULL AND attempts<10 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 50")
      .bind(new Date().toISOString()).all<{id:string;type:string;payload_json:string}>();
    for (const event of pending.results) await publishOutbox(env,{...JSON.parse(event.payload_json),id:event.id,type:event.type});
  },
} satisfies ExportedHandler<Env>;
