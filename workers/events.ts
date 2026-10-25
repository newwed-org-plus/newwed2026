import {collectUsage,monitorCron} from "@/server/operations";
import {sendPaidConfirmation} from "@/server/checkout-confirmation";
import {dispatchEvent} from "@/server/dispatch";
import {capabilityEnabled} from "@/server/capabilities";
import { expireCheckoutReservations,markCheckoutDelivered,processCheckoutCancellation,processCheckoutCreation,sendCheckout } from "@/server/checkout-processing";
import { processConversationSummary,processIncomingWhatsApp,processManualConversationMessage } from "@/server/conversation-processing";
import { getAsaasPayment } from "@/server/integrations/asaas";
import { applyAsaasPayment,asaasStatusEvent } from "@/server/integrations/asaas-payment";
import { processStoredAsaasWebhook,type StoredAsaasWebhook } from "@/server/integrations/asaas-webhook";
import { publishOutbox } from "@/server/outbox";
import { processNotificationEmail,type EmailEnv } from "@/server/notifications";
import { processUazapiBatch,processUazapiStatus } from "@/server/uazapi-webhook";
import type { RuntimeSecrets } from "@/server/secrets";

type EventBody = { provider?:"meta"|"uazapi"; type:string;externalId?:string;checkoutId?:string;providerPaymentId?:string;id?:string;leadId?:string;resend?:boolean;conversationId?:string;messageId?:string;targetCount?:number;notificationId?:string;userId?:string;requestId?:string };
type WorkerEnv = Env & RuntimeSecrets & EmailEnv;

async function handleStatus(env: WorkerEnv, externalId: string) {
  const stored = await env.DB.prepare("SELECT id,payload_json FROM webhook_events WHERE provider='meta' AND external_id=?").bind(externalId).first<{ id: string; payload_json: string }>();
  if (!stored) return;
  const payload = JSON.parse(stored.payload_json) as { event: { id: string; status?: string } };
  const message = await env.DB.prepare("SELECT checkout_id,status FROM messages WHERE external_id=?").bind(payload.event.id).first<{ checkout_id:string|null;status:string }>();
  const status = (payload.event.status ?? "unknown").toUpperCase();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE messages SET status=CASE
      WHEN status='READ' THEN status
      WHEN status='DELIVERED' AND ? IN ('ACCEPTED','SENT','FAILED') THEN status
      ELSE ? END,
      failed_at=CASE WHEN ?='FAILED' AND status NOT IN ('DELIVERED','READ') THEN coalesce(failed_at,?) ELSE failed_at END,
      last_error=CASE WHEN ?='FAILED' AND status NOT IN ('DELIVERED','READ') THEN 'A Meta informou falha na entrega.' ELSE last_error END
      WHERE external_id=?`).bind(status,status,status,now,status,payload.event.id),
    env.DB.prepare("UPDATE webhook_events SET processed_at=? WHERE id=?").bind(now,stored.id),
  ]);
  if (message?.checkout_id && (status === "DELIVERED" || status === "READ")) {
    await markCheckoutDelivered(env,message.checkout_id,null,"Entrega confirmada pela Meta");
  } else if (message?.checkout_id && status === "FAILED" && !["DELIVERED","READ"].includes(message.status)) {
    await env.DB.prepare("UPDATE checkouts SET status='FAILED',send_status='FAILED',last_error_code='META_DELIVERY_FAILED',last_error='A Meta informou falha na entrega.',last_error_at=?,updated_at=?,version=version+1 WHERE id=? AND status IN ('SEND_PENDING','SENT')")
      .bind(now,now,message.checkout_id).run();
  }
}

async function reconcileAsaas(env: WorkerEnv, providerPaymentId: string) {
  const payment = await getAsaasPayment(env,providerPaymentId);
  await applyAsaasPayment(env,asaasStatusEvent(payment.status),payment,{ source: "scheduled_reconciliation", payment });
}

async function handleEvent(env: WorkerEnv, body: EventBody) {
  if(body.type==="checkout.confirmation.send"&&body.checkoutId&&body.id)return sendPaidConfirmation(env,body.checkoutId,body.id);
  if(body.type==="conversation.reply.requested" && body.externalId)return processIncomingWhatsApp(env,body.externalId,{},body.provider??"uazapi","reply");
  if (body.type === "uazapi.batch" && body.externalId) return processUazapiBatch(env,body.externalId,body.targetCount);
  if (body.type === "uazapi.incoming" && body.externalId) return processIncomingWhatsApp(env,body.externalId,{},"uazapi","receive-only");
  if (body.type === "uazapi.status" && body.externalId) return processUazapiStatus(env,body.externalId);
  if (body.type === "whatsapp.incoming" && body.externalId) return processIncomingWhatsApp(env,body.externalId,{},"meta","receive-only");
  if (body.type === "whatsapp.status" && body.externalId) return handleStatus(env,body.externalId);
  if (body.type === "checkout.create" && body.checkoutId && body.id) return processCheckoutCreation(env,body.checkoutId,body.id);
  if (body.type === "checkout.send" && body.checkoutId && body.id) return sendCheckout(env,body.checkoutId,body.id,body.resend);
  if (body.type === "checkout.cancel" && body.checkoutId) return processCheckoutCancellation(env,body.checkoutId);
  if (body.type === "conversation.manual.send" && body.messageId) return processManualConversationMessage(env,body.messageId);
  if (body.type === "conversation.summarize" && body.conversationId && body.targetCount) return processConversationSummary(env,body.conversationId,body.targetCount);
  if (body.type === "asaas.reconcile" && body.providerPaymentId) return reconcileAsaas(env,body.providerPaymentId);
  if (body.type === "notification.email" && body.id && body.notificationId && body.userId) return processNotificationEmail(env,body.id,body.notificationId,body.userId);
  if (body.type === "lead.submitted" && body.leadId) {
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO activities (id,lead_id,type,title,created_at,updated_at) VALUES (?,?,'LEAD_CREATED','Pré-inscrição recebida',?,?)")
      .bind(body.id??`lead:${body.leadId}`,body.leadId,now,now).run();
    return;
  }
  throw new Error("Unsupported durable event");
}

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = message.body as EventBody;
      try {
        if(body.type==="asaas.reconcile"&&!body.id)await handleEvent(env as WorkerEnv,body);
        else await dispatchEvent(env,body as import("@/server/outbox").QueueEvent,event=>handleEvent(env as WorkerEnv,event));
        message.ack();
      } catch {console.error(JSON.stringify({event:"queue.failed",messageId:message.id,requestId:body.requestId}));message.retry();}
    }
  },
  async scheduled(_controller, env) {
    return monitorCron(env,"commercial",async()=>{
    const workerEnv = env as WorkerEnv;
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    await workerEnv.DB.prepare("UPDATE outbox_events SET dispatch_state=CASE WHEN type='checkout.create' THEN 'PENDING' ELSE 'HELD' END,hold_reason=CASE WHEN type='checkout.create' THEN NULL ELSE 'PROCESSING_RESULT_UNKNOWN' END,published_at=CASE WHEN type='checkout.create' THEN NULL ELSE published_at END,processing_token=NULL,processing_started_at=NULL WHERE dispatch_state='PROCESSING' AND processing_started_at<=?").bind(stale).run();
    if(capabilityEnabled(workerEnv,"checkout"))await workerEnv.DB.batch([
      workerEnv.DB.prepare("UPDATE checkouts SET status='FAILED',last_error_code='PROCESSING_TIMEOUT',last_error='O processamento excedeu o lease e será retomado.',last_error_at=?,next_retry_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=? WHERE status='CREATING' AND processing_started_at IS NOT NULL AND processing_started_at<=?")
        .bind(now,now,now,stale),
      workerEnv.DB.prepare("UPDATE outbox_events SET published_at=NULL,next_attempt_at=? WHERE type='checkout.create' AND aggregate_id IN (SELECT id FROM checkouts WHERE status='FAILED' AND last_error_code='PROCESSING_TIMEOUT')")
        .bind(now),
      workerEnv.DB.prepare("UPDATE checkouts SET status='FAILED',send_status='UNKNOWN',last_error_code='DELIVERY_UNKNOWN',last_error='O aceite do envio não foi confirmado após o lease.',last_error_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=? WHERE status='SEND_PENDING' AND processing_started_at IS NOT NULL AND processing_started_at<=?")
        .bind(now,now,stale),
    ]);
    await workerEnv.DB.batch([
      workerEnv.DB.prepare("UPDATE conversations SET mode='HUMAN',human_active=1,agent_paused_at=coalesce(agent_paused_at,?),agent_error='Resposta do agente excedeu o lease e foi encaminhada ao humano.',agent_processing_token=NULL,agent_processing_started_at=NULL,updated_at=? WHERE agent_processing_token IS NOT NULL AND agent_processing_started_at<=?")
        .bind(now,now,new Date(Date.now() - 2 * 60_000).toISOString()),
      workerEnv.DB.prepare("UPDATE messages SET status='SEND_UNKNOWN',last_error='O resultado do envio não foi confirmado dentro do lease.',failed_at=? WHERE status='SENDING' AND coalesce(send_started_at,created_at)<=?")
        .bind(now,stale),
    ]);
    const pending = await workerEnv.DB.prepare("SELECT id,type,aggregate_id,payload_json FROM outbox_events WHERE type NOT LIKE 'uazapi.%' AND dispatch_state='PENDING' AND published_at IS NULL AND attempts<10 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 50")
      .bind(now).all<{ id:string;type:string;aggregate_id:string;payload_json:string }>();
    for (const event of pending.results) {
      await publishOutbox(workerEnv,{ id:event.id,type:event.type,...JSON.parse(event.payload_json) });
    }
    const pendingWebhooks = await workerEnv.DB.prepare("SELECT id,external_id,payload_json,attempts,request_id FROM webhook_events WHERE provider='asaas' AND processed_at IS NULL AND attempts<10 AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY created_at LIMIT 50")
      .bind(now).all<StoredAsaasWebhook>();
    for (const webhook of pendingWebhooks.results) {
      await processStoredAsaasWebhook(workerEnv,webhook);
    }
    if(capabilityEnabled(workerEnv,"checkout"))await expireCheckoutReservations(workerEnv);
    await workerEnv.DB.prepare("DELETE FROM rate_limit_buckets WHERE expires_at<?").bind(now).run();
    await collectUsage(workerEnv).catch(()=>console.error(JSON.stringify({event:"operations.usage.unavailable"})));
    if (workerEnv.ASAAS_API_KEY) {
      const pendingPayments = await workerEnv.DB.prepare("SELECT provider_payment_id FROM payments WHERE provider_payment_id IS NOT NULL AND status IN ('PENDING','OVERDUE') ORDER BY updated_at LIMIT 50")
        .all<{ provider_payment_id: string }>();
      await Promise.all(pendingPayments.results.map((payment) => workerEnv.EVENTS_QUEUE.send({
        type: "asaas.reconcile",
        providerPaymentId: payment.provider_payment_id,
      })));
    }
    });
  },
} satisfies ExportedHandler<Env>;
