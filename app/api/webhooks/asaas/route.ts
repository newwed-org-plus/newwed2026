import { env } from "cloudflare:workers";
import { timingSafeEqual } from "@/server/crypto";
import { errorResponse,HttpError,json } from "@/server/http";
import { locateAsaasCheckout } from "@/server/integrations/asaas-payment";
import { asaasWebhookSchema,processStoredAsaasWebhook,type StoredAsaasWebhook } from "@/server/integrations/asaas-webhook";
import { getSecrets } from "@/server/secrets";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const expected = getSecrets().ASAAS_WEBHOOK_TOKEN;
    const received = request.headers.get("asaas-access-token") ?? "";
    if (!expected || !timingSafeEqual(expected,received)) throw new HttpError(401,"INVALID_SIGNATURE","Webhook não autorizado.");
    const input = asaasWebhookSchema.parse(await readJsonWithLimit(request,128 * 1024));
    // Asaas delivers account-wide events. Our checkout exists before we request the payment.
    if (!await locateAsaasCheckout(env,input.payment)) {
      return responseWithRequestId(json({ received:true,ignored:true }),requestId);
    }
    const externalId = input.id ?? `${input.event}:${input.payment.id}:${input.dateCreated ?? ""}`;
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (id,provider,external_id,event_type,payload_json,attempts,request_id,created_at) VALUES (?,'asaas',?,?,?,0,?,?)")
      .bind(crypto.randomUUID(),externalId,input.event,JSON.stringify(input),requestId,now).run();
    const stored = await env.DB.prepare("SELECT id,external_id,payload_json,attempts,processed_at,request_id FROM webhook_events WHERE provider='asaas' AND external_id=?")
      .bind(externalId).first<StoredAsaasWebhook & { processed_at:string|null }>();
    if (!stored) throw new Error("Webhook upsert failed");
    if (stored.processed_at) return responseWithRequestId(json({ received:true,duplicate:true }),requestId);

    const result = await processStoredAsaasWebhook(env,stored);
    // Asaas only acknowledges HTTP 200. The stored event can be retried by the worker.
    return responseWithRequestId(result.processed
      ? json({ received:true })
      : json({ received:true,pendingReconciliation:true }),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
