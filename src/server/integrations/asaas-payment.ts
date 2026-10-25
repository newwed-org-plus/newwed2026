import {ensurePaidConfirmation} from "../checkout-confirmation";
import { resolveCheckoutStatus,type PaymentStatus } from "@/features/billing/payment-state";
import { HttpError } from "@/server/http";
import type { AsaasPaymentSnapshot } from "@/server/integrations/asaas";
import { ensurePaidNotification } from "@/server/notifications";

type CheckoutSnapshot = {
  id:string;
  lead_id:string;
  edition_id:string;
  price_batch_id:string;
  method:string;
  installment_count:number;
  provider_installment_id:string|null;
  amount_cents:number;
  status:string;
  financial_status:string;
  reservation_released_at:string|null;
  batch_edition_id:string;
  batch_amount_cents:number;
  stored_payment_amount:number|null;
};

export function asaasStatusEvent(status: string): string {
  const normalized = status.toUpperCase();
  if (["RECEIVED","CONFIRMED","RECEIVED_IN_CASH"].includes(normalized)) return "PAYMENT_RECEIVED";
  if (normalized === "REFUNDED") return "PAYMENT_REFUNDED";
  if (normalized === "OVERDUE") return "PAYMENT_OVERDUE";
  if (["DELETED","CANCELLED","CREDIT_CARD_CAPTURE_REFUSED"].includes(normalized)) return "PAYMENT_DELETED";
  return `PAYMENT_${normalized}`;
}

export function normalizeAsaasPaymentStatus(status: string): PaymentStatus {
  const event = asaasStatusEvent(status);
  if (event === "PAYMENT_RECEIVED") return "PAID";
  if (event === "PAYMENT_REFUNDED") return "REFUNDED";
  if (event === "PAYMENT_OVERDUE") return "OVERDUE";
  if (event === "PAYMENT_DELETED") return "CANCELLED";
  return "PENDING";
}

function validatePayment(checkout: CheckoutSnapshot,payment: AsaasPaymentSnapshot) {
  if (checkout.batch_edition_id !== checkout.edition_id || checkout.batch_amount_cents !== checkout.amount_cents) {
    throw new HttpError(422,"CHECKOUT_SNAPSHOT_MISMATCH","Edição ou preço do checkout não corresponde ao catálogo autorizado.");
  }
  if (payment.externalReference && payment.externalReference !== checkout.id) {
    throw new HttpError(422,"PAYMENT_REFERENCE_MISMATCH","A cobrança não corresponde ao checkout informado.");
  }
  if (payment.billingType && payment.billingType !== checkout.method) {
    throw new HttpError(422,"PAYMENT_METHOD_MISMATCH","A forma da cobrança não corresponde ao checkout.");
  }
  if (checkout.provider_installment_id && payment.installment && payment.installment !== checkout.provider_installment_id) {
    throw new HttpError(422,"PAYMENT_INSTALLMENT_MISMATCH","A cobrança pertence a outro parcelamento.");
  }
  const amountCents = Math.round(payment.value * 100);
  if (checkout.stored_payment_amount !== null && checkout.stored_payment_amount !== amountCents) {
    throw new HttpError(422,"PAYMENT_AMOUNT_MISMATCH","O valor da cobrança diverge da parcela registrada.");
  }
  if (checkout.installment_count === 1 && amountCents !== checkout.amount_cents) {
    throw new HttpError(422,"PAYMENT_AMOUNT_MISMATCH","O valor da cobrança diverge do checkout.");
  }
  if (checkout.installment_count > 1 && checkout.stored_payment_amount === null) {
    const regular = Math.floor(checkout.amount_cents / checkout.installment_count);
    const last = checkout.amount_cents - regular * (checkout.installment_count - 1);
    const expected = payment.installmentNumber === checkout.installment_count ? last : regular;
    if (amountCents !== expected) throw new HttpError(422,"PAYMENT_AMOUNT_MISMATCH","O valor não corresponde a uma parcela do checkout.");
  }
}

function paymentUpsert(env: Pick<Env,"DB">,checkoutId: string,status: PaymentStatus,payment: AsaasPaymentSnapshot,rawPayload: unknown,now: string) {
  return env.DB.prepare(`INSERT INTO payments (id,checkout_id,provider_payment_id,provider_installment_id,installment_number,status,amount_cents,due_date,paid_at,payload_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_payment_id) DO UPDATE SET provider_installment_id=coalesce(excluded.provider_installment_id,payments.provider_installment_id),installment_number=coalesce(excluded.installment_number,payments.installment_number),status=CASE WHEN payments.status='REFUNDED' THEN payments.status WHEN payments.status='PAID' AND excluded.status IN ('PENDING','OVERDUE','CANCELLED') THEN payments.status ELSE excluded.status END,amount_cents=excluded.amount_cents,due_date=coalesce(excluded.due_date,payments.due_date),paid_at=coalesce(excluded.paid_at,payments.paid_at),payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),checkoutId,payment.id,payment.installment ?? null,payment.installmentNumber ?? null,status,Math.round(payment.value * 100),payment.dueDate ?? null,payment.paymentDate ?? payment.confirmedDate ?? null,JSON.stringify(rawPayload),now,now);
}

async function locateCheckout(env: Pick<Env,"DB">,payment: AsaasPaymentSnapshot) {
  return env.DB.prepare(`SELECT c.id,c.lead_id,c.edition_id,c.price_batch_id,c.method,c.installment_count,c.provider_installment_id,c.amount_cents,c.status,c.financial_status,c.reservation_released_at,
    b.edition_id AS batch_edition_id,b.amount_cents AS batch_amount_cents,p.amount_cents AS stored_payment_amount
    FROM checkouts c JOIN price_batches b ON b.id=c.price_batch_id
    LEFT JOIN payments p ON p.checkout_id=c.id AND p.provider_payment_id=?
    WHERE p.provider_payment_id IS NOT NULL OR c.provider_payment_id=? OR c.id=? LIMIT 1`)
    .bind(payment.id,payment.id,payment.externalReference ?? "").first<CheckoutSnapshot>();
}

export async function applyAsaasPayment(env: Pick<Env,"DB"|"EVENTS_QUEUE">,event: string,payment: AsaasPaymentSnapshot,rawPayload: unknown,requestId = crypto.randomUUID()) {
  const checkout = await locateCheckout(env,payment);
  if (!checkout) return { found:false as const };
  validatePayment(checkout,payment);

  if(["PAYMENT_REFUND_REQUESTED","PAYMENT_REFUND_IN_PROGRESS","PAYMENT_PARTIALLY_REFUNDED"].includes(event)) {
    await env.DB.prepare("UPDATE checkouts SET last_error_code=?,last_error='Estorno pendente ou parcial; conferir conciliação no Asaas.',last_error_at=?,updated_at=? WHERE id=? AND status!='REFUNDED'").bind(event,new Date().toISOString(),new Date().toISOString(),checkout.id).run();
    return {found:true as const,checkoutId:checkout.id,status:checkout.status,paymentStatus:normalizeAsaasPaymentStatus(payment.status)};
  }
  const paymentStatus = normalizeAsaasPaymentStatus(payment.status);
  const nextStatus = resolveCheckoutStatus(checkout.status,event);
  const now = new Date().toISOString();
  await paymentUpsert(env,checkout.id,paymentStatus,payment,rawPayload,now).run();

  if (nextStatus === checkout.status && (checkout.status === "PAID" || checkout.status === "REFUNDED")) {
    if (checkout.status === "PAID") {await ensurePaidNotification(env,checkout.id,requestId);await ensurePaidConfirmation(env,checkout.id,requestId);}
    return { found:true as const,checkoutId:checkout.id,status:checkout.status,paymentStatus };
  }

  if (nextStatus === "PAID") {
    const [capacity] = await env.DB.batch([
      env.DB.prepare(`UPDATE availability SET
        reserved=CASE WHEN EXISTS (SELECT 1 FROM checkouts WHERE id=? AND reservation_released_at IS NULL) THEN max(0,reserved-1) ELSE reserved END,
        sold=sold+1,version=version+1,updated_at=? WHERE edition_id=?
        AND EXISTS (SELECT 1 FROM checkouts WHERE id=? AND status NOT IN ('PAID','REFUNDED'))
        AND ((EXISTS (SELECT 1 FROM checkouts WHERE id=? AND reservation_released_at IS NULL) AND reserved>0)
          OR (EXISTS (SELECT 1 FROM checkouts WHERE id=? AND reservation_released_at IS NOT NULL) AND reserved+sold<(SELECT capacity FROM editions WHERE id=?)))`)
        .bind(checkout.id,now,checkout.edition_id,checkout.id,checkout.id,checkout.id,checkout.edition_id),
      env.DB.prepare("UPDATE checkouts SET status='PAID',financial_status='PAID',paid_at=coalesce(paid_at,?),reservation_released_at=coalesce(reservation_released_at,?),last_error_code=NULL,last_error=NULL,last_error_at=NULL,processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND changes()=1")
        .bind(now,now,now,checkout.id),
      env.DB.prepare("INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at) SELECT ?,id,stage,'PAGO',NULL,'Pagamento confirmado pelo Asaas',? FROM leads WHERE id=? AND stage!='PAGO' AND changes()=1")
        .bind(crypto.randomUUID(),now,checkout.lead_id),
      env.DB.prepare("UPDATE leads SET stage='PAGO',updated_at=? WHERE id=? AND stage!='PAGO' AND changes()=1").bind(now,checkout.lead_id),
    ]);
    if ((capacity.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare("SELECT status FROM checkouts WHERE id=?").bind(checkout.id).first<{ status:string }>();
      if (current?.status !== "PAID") {
        await env.DB.prepare("UPDATE checkouts SET financial_status='PAID',last_error_code='PAID_WITHOUT_CAPACITY',last_error='Pagamento recebido após liberação da vaga, sem capacidade disponível.',last_error_at=?,updated_at=? WHERE id=?")
          .bind(now,now,checkout.id).run();
        return { found:true as const,checkoutId:checkout.id,status:checkout.status,paymentStatus,divergence:"PAID_WITHOUT_CAPACITY" as const };
      }
    }
    await ensurePaidNotification(env,checkout.id,requestId);
    await ensurePaidConfirmation(env,checkout.id,requestId);
    return { found:true as const,checkoutId:checkout.id,status:"PAID" as const,paymentStatus };
  }

  if (nextStatus === "REFUNDED") {
    await env.DB.batch([
      env.DB.prepare(`UPDATE availability SET
        sold=CASE WHEN EXISTS (SELECT 1 FROM checkouts WHERE id=? AND status='PAID') THEN max(0,sold-1) ELSE sold END,
        reserved=CASE WHEN EXISTS (SELECT 1 FROM checkouts WHERE id=? AND status!='PAID' AND reservation_released_at IS NULL) THEN max(0,reserved-1) ELSE reserved END,
        version=version+1,updated_at=? WHERE edition_id=? AND EXISTS (SELECT 1 FROM checkouts WHERE id=? AND status!='REFUNDED')`)
        .bind(checkout.id,checkout.id,now,checkout.edition_id,checkout.id),
      env.DB.prepare("UPDATE checkouts SET status='REFUNDED',financial_status='REFUNDED',refunded_at=coalesce(refunded_at,?),reservation_released_at=coalesce(reservation_released_at,?),processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND status!='REFUNDED'")
        .bind(now,now,now,checkout.id),
      env.DB.prepare("INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at) SELECT ?,id,stage,'CANCELADO',NULL,'Pagamento estornado pelo Asaas',? FROM leads WHERE id=? AND stage='PAGO'")
        .bind(crypto.randomUUID(),now,checkout.lead_id),
      env.DB.prepare("UPDATE leads SET stage='CANCELADO',updated_at=? WHERE id=? AND stage='PAGO'").bind(now,checkout.lead_id),
      env.DB.prepare("INSERT OR IGNORE INTO refunds (id,payment_id,provider_refund_id,amount_cents,status,created_at,updated_at) SELECT ?,id,?,?,?, ?, ? FROM payments WHERE provider_payment_id=?")
        .bind(crypto.randomUUID(),payment.id,Math.round(payment.value * 100),paymentStatus,now,now,payment.id),
    ]);
    return { found:true as const,checkoutId:checkout.id,status:"REFUNDED" as const,paymentStatus };
  }

  if (nextStatus === "CANCELLED" || nextStatus === "OVERDUE") {
    await env.DB.batch([
      env.DB.prepare("UPDATE availability SET reserved=max(0,reserved-1),version=version+1,updated_at=? WHERE edition_id=? AND EXISTS (SELECT 1 FROM checkouts WHERE id=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','REFUNDED','CANCELLED','OVERDUE'))")
        .bind(now,checkout.edition_id,checkout.id),
      env.DB.prepare("UPDATE checkouts SET status=?,financial_status=?,reservation_released_at=coalesce(reservation_released_at,?),cancelled_at=CASE WHEN ?='CANCELLED' THEN coalesce(cancelled_at,?) ELSE cancelled_at END,processing_token=NULL,processing_started_at=NULL,updated_at=?,version=version+1 WHERE id=? AND status NOT IN ('PAID','REFUNDED','CANCELLED','OVERDUE')")
        .bind(nextStatus,paymentStatus,now,nextStatus,now,now,checkout.id),
    ]);
    if (nextStatus === "CANCELLED") {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at) SELECT ?,id,stage,'CANCELADO',NULL,'Cobrança cancelada pelo Asaas',? FROM leads WHERE id=? AND stage IN ('QUALIFICADO','CHECKOUT_ENVIADO','AGUARDANDO_PAGAMENTO')")
          .bind(crypto.randomUUID(),now,checkout.lead_id),
        env.DB.prepare("UPDATE leads SET stage='CANCELADO',updated_at=? WHERE id=? AND stage IN ('QUALIFICADO','CHECKOUT_ENVIADO','AGUARDANDO_PAGAMENTO')").bind(now,checkout.lead_id),
      ]);
    }
    return { found:true as const,checkoutId:checkout.id,status:nextStatus,paymentStatus };
  }

  await env.DB.prepare("UPDATE checkouts SET status=?,financial_status=CASE WHEN financial_status IN ('PAID','REFUNDED') THEN financial_status ELSE ? END,pending_at=CASE WHEN ?='PENDING' THEN coalesce(pending_at,?) ELSE pending_at END,updated_at=?,version=version+1 WHERE id=? AND status NOT IN ('PAID','REFUNDED')")
    .bind(nextStatus,paymentStatus,nextStatus,now,now,checkout.id).run();
  return { found:true as const,checkoutId:checkout.id,status:nextStatus,paymentStatus };
}

export type { AsaasPaymentSnapshot } from "@/server/integrations/asaas";
