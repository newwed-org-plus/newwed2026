import {capabilityEnabled,eventCapability} from "./capabilities";
export type QueueEvent = { id:string;type:string;checkoutId?:string;leadId?:string;externalId?:string;providerPaymentId?:string;resend?:boolean;conversationId?:string;messageId?:string;targetCount?:number;notificationId?:string;userId?:string;requestId?:string;provider?:"meta"|"uazapi" };

type OutboxEnv = Pick<Env,"DB"|"EVENTS_QUEUE"> & { UAZAPI_EVENTS_QUEUE?: Queue;ENABLE_MANUAL_SEND?:string;ENABLE_AGENT?:string;ENABLE_CHECKOUT?:string;ENABLE_CONFIRMATION?:string;ENABLE_EMAIL?:string };

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0,1000);
}

export function retryAt(attempt: number,now = new Date()) {
  const delaySeconds = Math.min(3600,30 * (2 ** Math.min(Math.max(attempt,0),7)));
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

export async function publishOutbox(env: OutboxEnv,event: QueueEvent) {
  const feature=eventCapability(event.type);
  const state=await env.DB.prepare("SELECT dispatch_state FROM outbox_events WHERE id=?").bind(event.id).first<{dispatch_state:string}>();
  if(state && ['HELD','DONE','FAILED','PROCESSING'].includes(state.dispatch_state))return false;
  if(feature&&!capabilityEnabled(env,feature)) {
    await env.DB.prepare("UPDATE outbox_events SET dispatch_state='HELD',hold_reason='CAPABILITY_DISABLED' WHERE id=? AND dispatch_state IN ('PENDING','PUBLISHED')").bind(event.id).run();return false;
  }
  try {
    const queue = event.type.startsWith("uazapi.") ? env.UAZAPI_EVENTS_QUEUE ?? env.EVENTS_QUEUE : env.EVENTS_QUEUE;
    await queue.send(event);
    await env.DB.prepare("UPDATE outbox_events SET published_at=?,dispatch_state=CASE WHEN dispatch_state='PENDING' THEN 'PUBLISHED' ELSE dispatch_state END,attempts=attempts+1,next_attempt_at=NULL,last_error=NULL WHERE id=?")
      .bind(new Date().toISOString(),event.id).run();
    return true;
  } catch (error) {
    const row = await env.DB.prepare("SELECT attempts FROM outbox_events WHERE id=?").bind(event.id).first<{ attempts:number }>();
    await env.DB.prepare("UPDATE outbox_events SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE id=?")
      .bind(retryAt(row?.attempts ?? 0),errorMessage(error),event.id).run();
    return false;
  }
}

export async function deferOutbox(env: Pick<Env,"DB">,eventId: string,error: unknown,attempt: number) {
  await env.DB.prepare("UPDATE outbox_events SET published_at=NULL,dispatch_state='PENDING',processing_token=NULL,processing_started_at=NULL,next_attempt_at=?,last_error=? WHERE id=?")
    .bind(retryAt(attempt),errorMessage(error),eventId).run();
}
