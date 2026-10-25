import {sendUazapiText} from "./integrations/uazapi";
import {reconcileUazapiReceipt} from "./uazapi-webhook";
import {uncertainSend} from "./send-outcome";
import { dueDateFromCheckoutExpiry } from "@/features/billing/checkout-request";
import { HttpError } from "@/server/http";
import {
  cancelAsaasPayment,
  createAsaasPayment,
  findOrCreateCustomer,
  findPaymentsByExternalReference,
  getAsaasPayment,
  listInstallmentPayments,
  type AsaasFetcher,
  type AsaasPaymentSnapshot,
} from "@/server/integrations/asaas";
import { applyAsaasPayment,asaasStatusEvent,normalizeAsaasPaymentStatus } from "@/server/integrations/asaas-payment";
import { sendCheckoutTemplate,type MetaFetcher } from "@/server/integrations/meta";
import { deferOutbox,publishOutbox } from "@/server/outbox";
import type { RuntimeSecrets } from "@/server/secrets";

type CheckoutWorkerEnv = Env & RuntimeSecrets;

type CheckoutCreationRow = {
  id:string;
  lead_id:string;
  edition_id:string;
  price_batch_id:string;
  provider_customer_id:string|null;
  method:"PIX"|"CREDIT_CARD";
  installment_count:number;
  amount_cents:number;
  expires_at:string;
  retry_count:number;
  name:string;
  email:string;
  normalized_phone:string;
  price_name:string;
  edition_name:string;
  request_id:string|null;
};

function processingError(error: unknown) {
  if (error instanceof HttpError) return { code:error.code,message:error.message };
  return { code:"CHECKOUT_PROCESSING_ERROR",message:error instanceof Error ? error.message : String(error) };
}

export function validateAsaasPaymentSeries(input: {
  checkoutId:string;
  method:"PIX"|"CREDIT_CARD";
  installmentCount:number;
  amountCents:number;
  payments:AsaasPaymentSnapshot[];
}) {
  if (input.payments.length !== input.installmentCount) {
    throw new HttpError(502,"ASAAS_INSTALLMENT_COUNT_MISMATCH","O Asaas retornou uma quantidade inesperada de parcelas.");
  }
  const ids = new Set(input.payments.map((payment) => payment.id));
  if (ids.size !== input.payments.length) throw new HttpError(502,"ASAAS_DUPLICATE_PAYMENT","O Asaas retornou cobranças duplicadas.");
  if (input.payments.some((payment) => payment.externalReference && payment.externalReference !== input.checkoutId)) {
    throw new HttpError(502,"ASAAS_REFERENCE_MISMATCH","A referência externa da cobrança não corresponde ao checkout.");
  }
  if (input.payments.some((payment) => payment.billingType && payment.billingType !== input.method)) {
    throw new HttpError(502,"ASAAS_METHOD_MISMATCH","A forma de pagamento retornada não corresponde ao checkout.");
  }
  const total = input.payments.reduce((sum,payment) => sum + Math.round(payment.value * 100),0);
  if (total !== input.amountCents) throw new HttpError(502,"ASAAS_AMOUNT_MISMATCH","O valor retornado pelo Asaas não corresponde ao checkout.");
  if (input.installmentCount > 1) {
    const installmentIds = new Set(input.payments.map((payment) => payment.installment).filter(Boolean));
    if (installmentIds.size !== 1) throw new HttpError(502,"ASAAS_INSTALLMENT_MISMATCH","As cobranças não pertencem ao mesmo parcelamento.");
    const numbers = input.payments.map((payment) => payment.installmentNumber).sort((a,b) => Number(a) - Number(b));
    if (numbers.some((number,index) => number !== index + 1)) throw new HttpError(502,"ASAAS_INSTALLMENT_SEQUENCE","A sequência de parcelas retornada é inválida.");
  }
}

function paymentStatement(env: Pick<Env,"DB">,checkoutId: string,payment: AsaasPaymentSnapshot,now: string) {
  return env.DB.prepare(`INSERT INTO payments (id,checkout_id,provider_payment_id,provider_installment_id,installment_number,status,amount_cents,due_date,paid_at,payload_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_payment_id) DO UPDATE SET provider_installment_id=excluded.provider_installment_id,installment_number=excluded.installment_number,status=CASE WHEN payments.status='REFUNDED' THEN payments.status WHEN payments.status='PAID' AND excluded.status IN ('PENDING','OVERDUE','CANCELLED') THEN payments.status ELSE excluded.status END,amount_cents=excluded.amount_cents,due_date=excluded.due_date,paid_at=coalesce(excluded.paid_at,payments.paid_at),payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),checkoutId,payment.id,payment.installment ?? null,payment.installmentNumber ?? null,normalizeAsaasPaymentStatus(payment.status),Math.round(payment.value * 100),payment.dueDate ?? null,payment.paymentDate ?? payment.confirmedDate ?? null,JSON.stringify(payment),now,now);
}

export async function enqueueCheckoutSend(env: CheckoutWorkerEnv,checkoutId: string) {
  const outboxId = crypto.randomUUID();
  const now = new Date().toISOString();
  const dedupeKey = `checkout.send:auto:${checkoutId}`;
  const checkout = await env.DB.prepare("SELECT request_id FROM checkouts WHERE id=?").bind(checkoutId).first<{request_id:string|null}>();
  const [updated] = await env.DB.batch([
    env.DB.prepare("UPDATE checkouts SET status='SEND_PENDING',send_status='PENDING',send_requested_at=?,updated_at=?,version=version+1 WHERE id=? AND status='READY' AND url IS NOT NULL")
      .bind(now,now,checkoutId),
    env.DB.prepare("INSERT OR IGNORE INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at) SELECT ?,'checkout.send',?,?,?,0,?,? WHERE changes()=1")
      .bind(outboxId,checkoutId,dedupeKey,JSON.stringify({ checkoutId,resend:false,requestId:checkout?.request_id }),checkout?.request_id ?? null,now),
  ]);
  if ((updated.meta.changes ?? 0) !== 1) return false;
  const stored = await env.DB.prepare("SELECT id FROM outbox_events WHERE dedupe_key=?").bind(dedupeKey).first<{ id:string }>();
  return stored ? publishOutbox(env,{ id:stored.id,type:"checkout.send",checkoutId,resend:false,requestId:checkout?.request_id ?? undefined }) : false;
}

export async function processCheckoutCreation(env: CheckoutWorkerEnv,checkoutId: string,outboxId: string,fetcher: AsaasFetcher = fetch) {
  const token = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const claimed = await env.DB.prepare(`UPDATE checkouts SET status='CREATING',processing_token=?,processing_started_at=?,retry_count=retry_count+1,next_retry_at=NULL,updated_at=?,version=version+1
    WHERE id=? AND send_status='NOT_REQUESTED' AND status IN ('CREATING','FAILED') AND (next_retry_at IS NULL OR next_retry_at<=?) AND (processing_started_at IS NULL OR processing_started_at<=?)`)
    .bind(token,nowIso,nowIso,checkoutId,nowIso,staleBefore).run();
  if ((claimed.meta.changes ?? 0) !== 1) return { processed:false as const };

  const checkout = await env.DB.prepare(`SELECT c.id,c.lead_id,c.edition_id,c.price_batch_id,c.provider_customer_id,c.method,c.installment_count,c.amount_cents,c.expires_at,c.retry_count,
    l.name,l.email,l.normalized_phone,p.name AS price_name,e.name AS edition_name,c.request_id
    FROM checkouts c JOIN leads l ON l.id=c.lead_id JOIN price_batches p ON p.id=c.price_batch_id AND p.edition_id=c.edition_id JOIN editions e ON e.id=c.edition_id
    WHERE c.id=? AND c.processing_token=? AND c.amount_cents=p.amount_cents`)
    .bind(checkoutId,token).first<CheckoutCreationRow>();
  if (!checkout) {
    await env.DB.prepare("UPDATE checkouts SET status='FAILED',last_error_code='CHECKOUT_SNAPSHOT_INVALID',last_error='Checkout, edição ou preço divergente.',last_error_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=? WHERE id=? AND processing_token=?")
      .bind(nowIso,nowIso,checkoutId,token).run();
    await deferOutbox(env,outboxId,"Checkout snapshot invalid",1);
    return { processed:true as const,status:"FAILED" as const };
  }

  try {
    let recovered = await findPaymentsByExternalReference(env,checkoutId,fetcher);
    const recoveredExisting = recovered.length > 0;
    let first = recovered.sort((a,b) => (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1))[0];
    let customerId = checkout.provider_customer_id ?? first?.customer;
    if (!first) {
      customerId = customerId ?? await findOrCreateCustomer(env,{
        id:checkout.lead_id,name:checkout.name,email:checkout.email,normalizedPhone:checkout.normalized_phone,
      },fetcher);
      first = await createAsaasPayment(env,{
        customerId,checkoutId,method:checkout.method,amountCents:checkout.amount_cents,installmentCount:checkout.installment_count,
        dueDate:dueDateFromCheckoutExpiry(checkout.expires_at),description:`${checkout.edition_name} — ${checkout.price_name}`,
      },fetcher);
      recovered = [first];
    }
    const payments = first.installment ? await listInstallmentPayments(env,first.installment,fetcher) : recovered;
    validateAsaasPaymentSeries({
      checkoutId,method:checkout.method,installmentCount:checkout.installment_count,amountCents:checkout.amount_cents,payments,
    });
    const readyAt = new Date().toISOString();
    const financialStatus = normalizeAsaasPaymentStatus(first.status);
    const [stored] = await env.DB.batch([
      env.DB.prepare(`UPDATE checkouts SET provider_customer_id=coalesce(?,provider_customer_id),provider_payment_id=?,provider_installment_id=?,url=?,status='READY',financial_status=?,ready_at=?,last_error_code=NULL,last_error=NULL,last_error_at=NULL,processing_token=NULL,processing_started_at=NULL,next_retry_at=NULL,updated_at=?,version=version+1
        WHERE id=? AND processing_token=? AND status='CREATING'`)
        .bind(customerId ?? null,first.id,first.installment ?? null,first.invoiceUrl ?? null,financialStatus,readyAt,readyAt,checkoutId,token),
      ...payments.map((payment) => paymentStatement(env,checkoutId,payment,readyAt)),
    ]);
    if ((stored.meta.changes ?? 0) !== 1) {
      await env.DB.prepare("UPDATE checkouts SET processing_token=NULL,processing_started_at=NULL WHERE id=? AND processing_token=?").bind(checkoutId,token).run();
      const current = await env.DB.prepare("SELECT status FROM checkouts WHERE id=?").bind(checkoutId).first<{ status:string }>();
      if (current && ["CANCELLED","OVERDUE"].includes(current.status)) {
        await cancelAsaasPayment(env,{ paymentId:first.id,installmentId:first.installment },fetcher);
      }
      return { processed:true as const,status:"RECONCILED" as const };
    }
    for (const payment of payments) {
      await applyAsaasPayment(env,`PAYMENT_${payment.status.toUpperCase()}`,payment,{ source:"checkout_creation",payment },checkout.request_id ?? undefined);
    }
    await enqueueCheckoutSend(env,checkoutId);
    return { processed:true as const,status:"READY" as const,recovered:recoveredExisting };
  } catch (error) {
    const failure = processingError(error);
    const failedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE checkouts SET status='FAILED',last_error_code=?,last_error=?,last_error_at=?,next_retry_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND processing_token=? AND status='CREATING'")
      .bind(failure.code,failure.message.slice(0,1000),failedAt,new Date(Date.now() + Math.min(3600,30 * (2 ** Math.min(checkout.retry_count,7))) * 1000).toISOString(),failedAt,checkoutId,token).run();
    await deferOutbox(env,outboxId,error,checkout.retry_count);
    return { processed:true as const,status:"FAILED" as const,errorCode:failure.code };
  }
}

export async function sendCheckout(env: CheckoutWorkerEnv,checkoutId: string,eventId: string,resend = false,metaFetcher:MetaFetcher = fetch) {
  const now = new Date();
  const nowIso = now.toISOString();
  const token = crypto.randomUUID();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const allowed = resend ? "('SEND_PENDING','SENT','PENDING','FAILED')" : "('SEND_PENDING')";
  const claimed = await env.DB.prepare(`UPDATE checkouts SET processing_token=?,processing_started_at=?,updated_at=?,version=version+1
    WHERE id=? AND send_status!='UNKNOWN' AND NOT EXISTS (SELECT 1 FROM messages WHERE checkout_id=checkouts.id AND status IN ('SEND_UNKNOWN','SENDING')) AND status IN ${allowed} AND url IS NOT NULL AND expires_at>? AND (processing_started_at IS NULL OR processing_started_at<=?)`)
    .bind(token,nowIso,nowIso,checkoutId,nowIso,staleBefore).run();
  if ((claimed.meta.changes ?? 0) !== 1) return { sent:false as const };

  const checkout = await env.DB.prepare(`SELECT c.url,c.lead_id,c.edition_id,c.status,c.request_id,c.conversation_id,c.whatsapp_instance_id,c.delivery_channel,l.normalized_phone,l.stage FROM checkouts c JOIN leads l ON l.id=c.lead_id WHERE c.id=? AND c.processing_token=?`)
    .bind(checkoutId,token).first<{ url:string;lead_id:string;edition_id:string;status:string;request_id:string|null;conversation_id:string|null;whatsapp_instance_id:string|null;delivery_channel:string;normalized_phone:string;stage:string }>();
  if (!checkout) {
    await env.DB.prepare("UPDATE checkouts SET status='FAILED',send_status='FAILED',last_error_code='CHECKOUT_SEND_SNAPSHOT_INVALID',last_error='Checkout ou lead não disponível para envio.',last_error_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=? WHERE id=? AND processing_token=?")
      .bind(nowIso,nowIso,checkoutId,token).run();
    return { sent:false as const };
  }
  if (!resend && checkout.stage !== "QUALIFICADO") {
      await env.DB.batch([
        env.DB.prepare("UPDATE availability SET reserved=max(0,reserved-1),version=version+1,updated_at=? WHERE edition_id=? AND EXISTS (SELECT 1 FROM checkouts WHERE id=? AND reservation_released_at IS NULL)")
          .bind(nowIso,checkout.edition_id,checkoutId),
        env.DB.prepare("UPDATE checkouts SET status='CANCELLED',financial_status=CASE WHEN financial_status='NOT_STARTED' THEN 'CANCELLED' ELSE financial_status END,reservation_released_at=coalesce(reservation_released_at,?),cancelled_at=?,processing_token=NULL,processing_started_at=NULL,last_error_code='LEAD_NOT_SENDABLE',last_error='Lead não está qualificado para o primeiro envio.',last_error_at=?,updated_at=? WHERE id=? AND processing_token=?")
          .bind(nowIso,nowIso,nowIso,nowIso,checkoutId,token),
      ]);
    return { sent:false as const };
  }

  let phone=checkout.normalized_phone.replace(/\D/g,"");
  let conversation:{id:string}|null=null;
  if(checkout.delivery_channel==="uazapi") {
    const bound=await env.DB.prepare("SELECT id,contact_phone,opted_out_at FROM conversations WHERE id=? AND lead_id=? AND whatsapp_instance_id=?").bind(checkout.conversation_id,checkout.lead_id,checkout.whatsapp_instance_id).first<{id:string;contact_phone:string;opted_out_at:string|null}>();
    if(bound&&!bound.opted_out_at){conversation=bound;phone=bound.contact_phone;}
    else {
      await env.DB.prepare("UPDATE checkouts SET status='FAILED',send_status='FAILED',last_error_code='CHECKOUT_CONVERSATION_INVALID',last_error='Conversa indisponível ou com opt-out.',processing_token=NULL,processing_started_at=NULL WHERE id=? AND processing_token=?").bind(checkoutId,token).run();
      return {sent:false as const};
    }
  } else {
  await env.DB.prepare(`INSERT INTO conversations (id,lead_id,channel,external_id,mode,human_active,last_message_at,request_id,created_at,updated_at)
    VALUES (?,?,'whatsapp',?,'AGENT',0,?,?,?,?) ON CONFLICT(channel,external_id) DO UPDATE SET lead_id=coalesce(conversations.lead_id,excluded.lead_id),last_message_at=excluded.last_message_at,request_id=coalesce(excluded.request_id,conversations.request_id),updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),checkout.lead_id,phone,nowIso,checkout.request_id,nowIso,nowIso).run();
  conversation = await env.DB.prepare("SELECT id FROM conversations WHERE channel='whatsapp' AND external_id=?").bind(phone).first<{ id:string }>();

  }
  if(!conversation)throw new Error("Conversation unavailable");
  const existing = await env.DB.prepare("SELECT status FROM messages WHERE id=?").bind(eventId).first<{ status:string }>();
  if (existing && ["SEND_PENDING","SENDING","SEND_UNKNOWN"].includes(existing.status)) {
    await env.DB.prepare("UPDATE checkouts SET status='FAILED',send_status='UNKNOWN',last_error_code='DELIVERY_UNKNOWN',last_error='O aceite do envio anterior é desconhecido; reenvio automático bloqueado.',last_error_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=? WHERE id=? AND processing_token=?")
      .bind(nowIso,nowIso,checkoutId,token).run();
    return { sent:false as const,uncertain:true as const };
  }
  if (existing?.status === "ACCEPTED" || existing?.status === "DELIVERED" || existing?.status === "READ") {
    await env.DB.prepare("UPDATE checkouts SET processing_token=NULL,processing_started_at=NULL WHERE id=? AND processing_token=?").bind(checkoutId,token).run();
    return { sent:true as const,idempotent:true as const };
  }
  const messageBody=checkout.delivery_channel==="uazapi"?`Olá! Segue o link do seu checkout New Wed: ${checkout.url}`:checkout.url;
  await env.DB.prepare(`INSERT INTO messages (id,conversation_id,checkout_id,direction,type,body,status,template_name,payload_json,request_id,created_at)
    VALUES (?,?,?,'OUT',?,?,'SENDING',?, ?,?,?) ON CONFLICT(id) DO UPDATE SET status='SENDING',created_at=excluded.created_at`)
    .bind(eventId,conversation.id,checkoutId,checkout.delivery_channel==="uazapi"?"text":"template",messageBody,checkout.delivery_channel==="uazapi"?null:env.META_CHECKOUT_TEMPLATE,JSON.stringify({ resend }),checkout.request_id,nowIso).run();

  try {
    const response = checkout.delivery_channel==="uazapi" ? await sendUazapiText(env,checkout.whatsapp_instance_id!,phone,messageBody,metaFetcher) : await sendCheckoutTemplate(env,phone,checkout.url,metaFetcher);
    const sentAt = new Date().toISOString();
    const externalId = response.messages?.[0]?.id;
    if (!externalId) throw new Error("Meta did not return a message id");
    const statements: D1PreparedStatement[] = [
      env.DB.prepare("UPDATE messages SET external_id=?,status='ACCEPTED' WHERE id=? AND status IN ('SEND_PENDING','SENDING')").bind(externalId,eventId),
      env.DB.prepare("UPDATE checkouts SET status=CASE WHEN status='SEND_PENDING' THEN 'SENT' ELSE status END,send_status='ACCEPTED',sent_at=?,last_error_code=NULL,last_error=NULL,last_error_at=NULL,processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND processing_token=?")
        .bind(sentAt,sentAt,checkoutId,token),
      env.DB.prepare("INSERT INTO activities (id,lead_id,type,title,body,created_at,updated_at) VALUES (?,?,'CHECKOUT_SENT','Checkout aceito pelo WhatsApp',?,?,?)")
        .bind(crypto.randomUUID(),checkout.lead_id,checkout.url,sentAt,sentAt),
    ];
    if (checkout.stage === "QUALIFICADO") {
      statements.push(
        env.DB.prepare("UPDATE leads SET stage='CHECKOUT_ENVIADO',updated_at=? WHERE id=? AND stage='QUALIFICADO'").bind(sentAt,checkout.lead_id),
        env.DB.prepare("INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at) SELECT ?,?,'QUALIFICADO','CHECKOUT_ENVIADO',NULL,'Envio aceito pelo WhatsApp',? WHERE changes()=1")
          .bind(crypto.randomUUID(),checkout.lead_id,sentAt),
      );
    }
    await env.DB.batch(statements);
    if(checkout.delivery_channel==="uazapi")await reconcileUazapiReceipt(env,externalId);
    return { sent:true as const,externalId };
  } catch (error) {
    const failure = processingError(error);
    const uncertain=uncertainSend(error);
    const failedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE messages SET status=? WHERE id=? AND status IN ('SEND_PENDING','SENDING')").bind(uncertain?"SEND_UNKNOWN":"FAILED",eventId),
      env.DB.prepare("UPDATE checkouts SET status='FAILED',send_status=?,last_error_code=?,last_error=?,last_error_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND processing_token=?")
        .bind(uncertain?"UNKNOWN":"FAILED",failure.code,failure.message.slice(0,1000),failedAt,failedAt,checkoutId,token),
    ]);
    return { sent:false as const,errorCode:failure.code,uncertain };
  }
}

export {markCheckoutDelivered} from "./checkout-delivery";

async function enqueueCheckoutCancellation(env: CheckoutWorkerEnv,checkoutId: string,now: string) {
  const outboxId = crypto.randomUUID();
  const dedupeKey = `checkout.cancel:${checkoutId}`;
  await env.DB.prepare("INSERT OR IGNORE INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,created_at) VALUES (?,'checkout.cancel',?,?,?,0,?)")
    .bind(outboxId,checkoutId,dedupeKey,JSON.stringify({ checkoutId }),now).run();
  const stored = await env.DB.prepare("SELECT id FROM outbox_events WHERE dedupe_key=?").bind(dedupeKey).first<{ id:string }>();
  if (stored) await publishOutbox(env,{ id:stored.id,type:"checkout.cancel",checkoutId });
}

export async function processCheckoutCancellation(env: CheckoutWorkerEnv,checkoutId: string,fetcher: AsaasFetcher = fetch) {
  const checkout = await env.DB.prepare("SELECT provider_payment_id,provider_installment_id FROM checkouts WHERE id=? AND status IN ('CANCELLED','OVERDUE')")
    .bind(checkoutId).first<{ provider_payment_id:string|null;provider_installment_id:string|null }>();
  if (!checkout) return { processed:false as const };
  let payments = await findPaymentsByExternalReference(env,checkoutId,fetcher);
  if (!payments.length && checkout.provider_payment_id) {
    try {
      const payment = await getAsaasPayment(env,checkout.provider_payment_id,fetcher);
      payments = [payment];
    } catch (error) {
      if (error instanceof HttpError && error.code === "ASAAS_RESOURCE_NOT_FOUND") return { processed:true as const,alreadyMissing:true };
      throw error;
    }
  }
  if (!payments.length) return { processed:true as const,noProviderCharge:true };
  const paid = payments.filter((payment) => normalizeAsaasPaymentStatus(payment.status) === "PAID");
  if (paid.length) {
    for (const payment of paid) await applyAsaasPayment(env,asaasStatusEvent(payment.status),payment,{ source:"checkout_cancellation",payment });
    return { processed:true as const,paid:true };
  }
  const first = payments[0];
  await cancelAsaasPayment(env,{ paymentId:first.id,installmentId:first.installment ?? checkout.provider_installment_id },fetcher);
  return { processed:true as const,cancelled:true };
}

export async function expireCheckoutReservations(env: CheckoutWorkerEnv,limit = 50) {
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(`SELECT id,edition_id,lead_id,status FROM checkouts
    WHERE expires_at<=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','CANCELLED','REFUNDED','OVERDUE') ORDER BY expires_at LIMIT ?`)
    .bind(now,limit).all<{ id:string;edition_id:string;lead_id:string;status:string }>();
  let expired = 0;
  for (const checkout of rows.results) {
    const [released] = await env.DB.batch([
      env.DB.prepare("UPDATE availability SET reserved=max(0,reserved-1),version=version+1,updated_at=? WHERE edition_id=? AND EXISTS (SELECT 1 FROM checkouts WHERE id=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','CANCELLED','REFUNDED','OVERDUE'))")
        .bind(now,checkout.edition_id,checkout.id),
      env.DB.prepare("UPDATE checkouts SET status='OVERDUE',financial_status=CASE WHEN financial_status='PAID' THEN financial_status ELSE 'OVERDUE' END,reservation_released_at=?,processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','CANCELLED','REFUNDED','OVERDUE')")
        .bind(now,now,checkout.id),
    ]);
    if ((released.meta.changes ?? 0) === 1) {
      expired += 1;
      await enqueueCheckoutCancellation(env,checkout.id,now);
    }
  }
  return expired;
}

export async function cancelCheckoutReservationsForLead(env: CheckoutWorkerEnv,leadId: string) {
  const rows = await env.DB.prepare(`SELECT id,edition_id FROM checkouts WHERE lead_id=? AND reservation_released_at IS NULL
    AND status NOT IN ('PAID','CANCELLED','REFUNDED','OVERDUE')`).bind(leadId).all<{ id:string;edition_id:string }>();
  const now = new Date().toISOString();
  let cancelled = 0;
  for (const checkout of rows.results) {
    const [updated] = await env.DB.batch([
      env.DB.prepare(`UPDATE checkouts SET status='CANCELLED',financial_status=CASE WHEN financial_status='NOT_STARTED' THEN 'CANCELLED' ELSE financial_status END,
        reservation_released_at=?,cancelled_at=coalesce(cancelled_at,?),processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1
        WHERE id=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','CANCELLED','REFUNDED','OVERDUE')`).bind(now,now,now,checkout.id),
      env.DB.prepare("UPDATE availability SET reserved=max(0,reserved-1),version=version+1,updated_at=? WHERE edition_id=? AND changes()=1")
        .bind(now,checkout.edition_id),
    ]);
    if ((updated.meta.changes ?? 0) === 1) {
      cancelled += 1;
      await enqueueCheckoutCancellation(env,checkout.id,now);
    }
  }
  return cancelled;
}
