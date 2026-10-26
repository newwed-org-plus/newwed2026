import { z } from "zod";
import { applyAsaasPayment } from "@/server/integrations/asaas-payment";
import { retryAt } from "@/server/outbox";

const optionalProviderString=z.string().nullish().transform(value=>value??undefined);

export const asaasWebhookSchema = z.object({
  id:z.string().min(1).optional(),
  event:z.string().min(1),
  dateCreated:optionalProviderString,
  payment:z.object({
    id:z.string().min(1),
    externalReference:optionalProviderString,
    customer:optionalProviderString,
    installment:optionalProviderString,
    installmentNumber:z.number().int().positive().nullish().transform(value=>value??undefined),
    invoiceUrl:z.string().url().nullish().transform(value=>value??undefined),
    billingType:optionalProviderString,
    value:z.number().positive(),
    dueDate:optionalProviderString,
    status:z.string().min(1),
    paymentDate:optionalProviderString,
    confirmedDate:optionalProviderString,
  }).passthrough(),
}).passthrough();

export type AsaasWebhook = z.infer<typeof asaasWebhookSchema>;
export type StoredAsaasWebhook = { id:string;external_id:string;payload_json:string;attempts:number;request_id?:string|null };

export async function processStoredAsaasWebhook(env: Pick<Env,"DB"|"EVENTS_QUEUE">,stored: StoredAsaasWebhook) {
  const now = new Date().toISOString();
  try {
    const input = asaasWebhookSchema.parse(JSON.parse(stored.payload_json));
    const result = await applyAsaasPayment(env,input.event,input.payment,input,stored.request_id ?? crypto.randomUUID());
    const divergence = "divergence" in result ? result.divergence : undefined;
    if (!result.found || divergence) {
      const error = divergence ?? "CHECKOUT_NOT_FOUND";
      await env.DB.prepare("UPDATE webhook_events SET attempts=attempts+1,last_attempt_at=?,next_retry_at=?,error=? WHERE id=? AND processed_at IS NULL")
        .bind(now,retryAt(stored.attempts),error,stored.id).run();
      return { processed:false as const,error };
    }
    await env.DB.prepare("UPDATE webhook_events SET attempts=attempts+1,last_attempt_at=?,next_retry_at=NULL,error=NULL,processed_at=? WHERE id=? AND processed_at IS NULL")
      .bind(now,now,stored.id).run();
    return { processed:true as const };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0,1000);
    await env.DB.prepare("UPDATE webhook_events SET attempts=attempts+1,last_attempt_at=?,next_retry_at=?,error=? WHERE id=? AND processed_at IS NULL")
      .bind(now,retryAt(stored.attempts),message,stored.id).run();
    return { processed:false as const,error:message };
  }
}
