import {requireCapability} from "@/server/capabilities";
import { env } from "cloudflare:workers";
import { checkoutExpiresAt,currentDateInRecife,installmentsAreAllowed,resolveCheckoutDueDate } from "@/features/billing/checkout-request";
import { checkoutSchema } from "@/features/leads/schemas";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,HttpError,json,requireIdempotencyKey } from "@/server/http";
import { publishOutbox } from "@/server/outbox";
import { enforceRateLimit } from "@/server/rate-limit";
import { requestIdFrom,responseWithRequestId,readJsonWithLimit } from "@/server/request-context";

type StoredResponse = { response_json:string };

async function priorResponse(key:string,leadId:string) {
  const prior=await env.DB.prepare("SELECT response_json FROM idempotency_keys WHERE key=? AND scope='checkout'").bind(key).first<StoredResponse>();
  if(prior){const stored=JSON.parse(prior.response_json) as {checkoutId:string};if(!await env.DB.prepare("SELECT id FROM checkouts WHERE id=? AND lead_id=?").bind(stored.checkoutId,leadId).first())throw new HttpError(409,"IDEMPOTENCY_KEY_REUSED","Esta chave pertence a outro checkout.");}
  return prior;
}

export async function POST(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  const requestId = requestIdFrom(request);
  try {
    const actor = await requireAccessUser(request,["admin","gestor"]);
    requireCapability(env,"checkout");
    const { id:leadId } = await params;
    const idempotencyKey = requireIdempotencyKey(request);
    const prior = await priorResponse(idempotencyKey,leadId);
    if (prior) return responseWithRequestId(json(JSON.parse(prior.response_json),{ status:202 }),requestId);
    await enforceRateLimit(env,{scope:"checkout.create",identity:`${actor.id}:${leadId}`,limit:5,windowSeconds:600});

    const input = checkoutSchema.parse(await readJsonWithLimit(request,8192));
    const useUazapi=String(env.CHECKOUT_CHANNEL??"uazapi")!=="meta";
    if(useUazapi&&!input.conversationId)throw new HttpError(422,"CHECKOUT_CONVERSATION_REQUIRED","Selecione uma conversa UAZAPI deste lead.");
    const conversation=input.conversationId ? await env.DB.prepare("SELECT id,whatsapp_instance_id,opted_out_at,contact_phone FROM conversations WHERE id=? AND lead_id=? AND channel='whatsapp'").bind(input.conversationId,leadId).first<{id:string;whatsapp_instance_id:string|null;opted_out_at:string|null;contact_phone:string|null}>() : null;
    if(useUazapi&&(!conversation?.whatsapp_instance_id||conversation.opted_out_at))throw new HttpError(422,"CHECKOUT_CONVERSATION_INVALID","Escolha uma conversa UAZAPI válida e sem opt-out deste lead.");
    const lead = await env.DB.prepare("SELECT id,stage,edition_id FROM leads WHERE id=?").bind(leadId)
      .first<{ id:string;stage:string;edition_id:string|null }>();
    if (!lead) throw new HttpError(404,"LEAD_NOT_FOUND","Lead não encontrado.");
    if (lead.stage !== "QUALIFICADO") throw new HttpError(409,"LEAD_NOT_QUALIFIED","O checkout só pode ser criado para um lead qualificado.");
    if (lead.edition_id !== input.editionId) throw new HttpError(422,"EDITION_MISMATCH","A edição não corresponde ao interesse do lead.");

    const offer = await env.DB.prepare(`SELECT p.id,p.amount_cents,p.installment_count,p.name,e.name AS edition_name,e.capacity,a.reserved,a.sold
      FROM price_batches p JOIN editions e ON e.id=p.edition_id JOIN availability a ON a.edition_id=e.id
      WHERE p.id=? AND p.edition_id=? AND p.active=1 AND e.status='OPEN'`)
      .bind(input.priceBatchId,input.editionId)
      .first<{ id:string;amount_cents:number;installment_count:number;name:string;edition_name:string;capacity:number;reserved:number;sold:number }>();
    if (!offer) throw new HttpError(422,"PRICE_UNAVAILABLE","Preço ou edição indisponível.");
    if (!installmentsAreAllowed(input.method,input.installmentCount,offer.installment_count)) {
      throw new HttpError(422,"INSTALLMENTS_NOT_ALLOWED",`Esta edição permite cartão em até ${offer.installment_count} parcelas e Pix em parcela única.`);
    }

    const dueDate = resolveCheckoutDueDate(input.dueDate);
    if (dueDate < currentDateInRecife()) throw new HttpError(422,"INVALID_DUE_DATE","O vencimento não pode estar no passado.");
    const checkoutId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = checkoutExpiresAt(dueDate);
    const responseBody = {
      checkoutId,status:"CREATING",financialStatus:"NOT_STARTED",sendStatus:"NOT_REQUESTED",
      method:input.method,installmentCount:input.installmentCount,amountCents:offer.amount_cents,dueDate,expiresAt,
    };
    const payload = JSON.stringify({ checkoutId });

    let results: D1Result[];
    try {
      results = await env.DB.batch([
        env.DB.prepare(`UPDATE availability SET reserved=reserved+1,version=version+1,updated_at=?
          WHERE edition_id=? AND reserved+sold<(SELECT capacity FROM editions WHERE id=?)
          AND EXISTS (SELECT 1 FROM leads WHERE id=? AND stage='QUALIFICADO' AND edition_id=?)
          AND NOT EXISTS (SELECT 1 FROM checkouts WHERE lead_id=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','OVERDUE','CANCELLED','REFUNDED'))`)
          .bind(now,input.editionId,input.editionId,leadId,input.editionId,leadId),
        env.DB.prepare(`INSERT INTO checkouts (id,lead_id,edition_id,price_batch_id,provider,method,installment_count,amount_cents,status,financial_status,send_status,idempotency_key,authorized_by,expires_at,request_id,created_at,updated_at,conversation_id,whatsapp_instance_id,delivery_channel)
          SELECT ?,?,?,?,'asaas',?,?,?,'CREATING','NOT_STARTED','NOT_REQUESTED',?,?,?,?,?,?,?,?,? WHERE changes()=1`)
          .bind(checkoutId,leadId,input.editionId,input.priceBatchId,input.method,input.installmentCount,offer.amount_cents,idempotencyKey,actor.id,expiresAt,requestId,now,now,conversation?.id??null,conversation?.whatsapp_instance_id??null,useUazapi?"uazapi":"meta"),
        env.DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at) SELECT ?,'checkout.create',? ,?,?,0,?,? WHERE changes()=1")
          .bind(outboxId,checkoutId,`checkout.create:${checkoutId}`,payload,requestId,now),
        env.DB.prepare("INSERT INTO idempotency_keys (key,scope,resource_id,response_json,created_at) SELECT ?,'checkout',?,?,? WHERE changes()=1")
          .bind(idempotencyKey,checkoutId,JSON.stringify(responseBody),now),
        env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,after_json,ip,request_id,created_at) SELECT ?,?,'checkout.reserve','checkout',?,?,?,?,? WHERE changes()=1")
          .bind(crypto.randomUUID(),actor.id,checkoutId,JSON.stringify(responseBody),request.headers.get("cf-connecting-ip"),requestId,now),
      ]);
    } catch (error) {
      const concurrent = await priorResponse(idempotencyKey,leadId);
      if (concurrent) return responseWithRequestId(json(JSON.parse(concurrent.response_json),{ status:202 }),requestId);
      const reused = await env.DB.prepare("SELECT scope FROM idempotency_keys WHERE key=?").bind(idempotencyKey).first<{ scope:string }>();
      if (reused) throw new HttpError(409,"IDEMPOTENCY_KEY_REUSED","A chave de idempotência já foi usada em outra operação.");
      throw error;
    }

    if ((results[0].meta.changes ?? 0) !== 1) {
      const concurrent = await priorResponse(idempotencyKey,leadId);
      if (concurrent) return responseWithRequestId(json(JSON.parse(concurrent.response_json),{ status:202 }),requestId);
      const active = await env.DB.prepare("SELECT id FROM checkouts WHERE lead_id=? AND reservation_released_at IS NULL AND status NOT IN ('PAID','OVERDUE','CANCELLED','REFUNDED') LIMIT 1")
        .bind(leadId).first();
      if (active) throw new HttpError(409,"ACTIVE_CHECKOUT_EXISTS","Já existe um checkout ativo para este lead.");
      const availability = await env.DB.prepare("SELECT a.reserved,a.sold,e.capacity FROM availability a JOIN editions e ON e.id=a.edition_id WHERE a.edition_id=?")
        .bind(input.editionId).first<{ reserved:number;sold:number;capacity:number }>();
      if (availability && availability.reserved + availability.sold >= availability.capacity) throw new HttpError(409,"SOLD_OUT","Não há vagas disponíveis.");
      throw new HttpError(409,"CHECKOUT_CONFLICT","O lead ou a disponibilidade mudaram. Atualize a tela e tente novamente.");
    }

    await publishOutbox(env,{ id:outboxId,type:"checkout.create",checkoutId,requestId });
    return responseWithRequestId(json(responseBody,{ status:202 }),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
