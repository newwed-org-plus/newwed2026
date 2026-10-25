import {requireCapability} from "@/server/capabilities";
import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,HttpError,json,requireIdempotencyKey } from "@/server/http";
import { publishOutbox } from "@/server/outbox";

type StoredResponse = { response_json:string };

async function priorResponse(key: string) {
  return env.DB.prepare("SELECT response_json FROM idempotency_keys WHERE key=? AND scope='checkout_send'").bind(key).first<StoredResponse>();
}

export async function POST(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  try {
    const actor = await requireAccessUser(request,["admin","gestor"]);
    requireCapability(env,"checkout");
    const key = requireIdempotencyKey(request);
    const prior = await priorResponse(key);
    if (prior) {const body=JSON.parse(prior.response_json);if(body.checkoutId!==(await params).id)throw new HttpError(409,"IDEMPOTENCY_KEY_REUSED","Esta chave pertence a outro checkout.");return json(body,{status:202});}

    const { id } = await params;
    const checkout = await env.DB.prepare("SELECT id,status,send_status,url,expires_at FROM checkouts WHERE id=?")
      .bind(id).first<{ id:string;status:string;send_status:string;url:string|null;expires_at:string|null }>();
    if (!checkout) throw new HttpError(404,"CHECKOUT_NOT_FOUND","Checkout não encontrado.");
    if(checkout.send_status==="UNKNOWN")throw new HttpError(409,"RECONCILIATION_REQUIRED","Confira o resultado do envio anterior antes de reenviar.");
    if (!checkout.url || !["READY","SENT","PENDING","FAILED"].includes(checkout.status)) {
      throw new HttpError(409,"CHECKOUT_NOT_SENDABLE","Este checkout ainda não está pronto ou já foi encerrado.");
    }
    const now = new Date().toISOString();
    if (checkout.expires_at && checkout.expires_at <= now) throw new HttpError(409,"CHECKOUT_EXPIRED","Este checkout expirou.");

    const resend = checkout.status !== "READY";
    const outboxId = crypto.randomUUID();
    const dedupeKey = `checkout.send:manual:${id}:${key}`;
    const responseBody = { checkoutId:id,status:resend ? checkout.status : "SEND_PENDING",sendStatus:"PENDING",queued:true,resend };
    try {
      const [updated] = await env.DB.batch([
        env.DB.prepare(`UPDATE checkouts SET status=CASE WHEN status='READY' THEN 'SEND_PENDING' ELSE status END,send_status='PENDING',send_requested_at=?,last_error_code=NULL,last_error=NULL,last_error_at=NULL,updated_at=?,version=version+1
          WHERE id=? AND send_status!='UNKNOWN' AND NOT EXISTS (SELECT 1 FROM messages WHERE checkout_id=checkouts.id AND status IN ('SEND_UNKNOWN','SENDING')) AND url IS NOT NULL AND expires_at>? AND status IN ('READY','SENT','PENDING','FAILED')`).bind(now,now,id,now),
        env.DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,created_at) SELECT ?,'checkout.send',?,?,?,0,? WHERE changes()=1")
          .bind(outboxId,id,dedupeKey,JSON.stringify({ checkoutId:id,resend }),now),
        env.DB.prepare("INSERT INTO idempotency_keys (key,scope,resource_id,response_json,created_at) SELECT ?,'checkout_send',?,?,? WHERE changes()=1")
          .bind(key,id,JSON.stringify(responseBody),now),
        env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,ip,created_at) SELECT ?,?,'checkout.send.queue','checkout',?,?,?,?,? WHERE changes()=1")
          .bind(crypto.randomUUID(),actor.id,id,JSON.stringify({ status:checkout.status,sendStatus:checkout.send_status }),JSON.stringify(responseBody),request.headers.get("cf-connecting-ip"),now),
      ]);
      if ((updated.meta.changes ?? 0) !== 1) throw new HttpError(409,"CHECKOUT_SEND_CONFLICT","O checkout mudou. Atualize a tela e tente novamente.");
    } catch (error) {
      const concurrent = await priorResponse(key);
      if (concurrent) return json(JSON.parse(concurrent.response_json),{ status:202 });
      const reused = await env.DB.prepare("SELECT scope FROM idempotency_keys WHERE key=?").bind(key).first<{ scope:string }>();
      if (reused) throw new HttpError(409,"IDEMPOTENCY_KEY_REUSED","A chave de idempotência já foi usada em outra operação.");
      throw error;
    }
    await publishOutbox(env,{ id:outboxId,type:"checkout.send",checkoutId:id,resend });
    return json(responseBody,{ status:202 });
  } catch (error) { return errorResponse(error); }
}
