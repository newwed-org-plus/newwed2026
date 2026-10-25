import {capabilityEnabled,eventCapability} from "./capabilities";
import {retryAt,type QueueEvent} from "./outbox";
type DispatchEnv=Pick<Env,'DB'> & Partial<Pick<Env,'ENABLE_MANUAL_SEND'|'ENABLE_AGENT'|'ENABLE_CHECKOUT'|'ENABLE_CONFIRMATION'|'ENABLE_EMAIL'>>;
type Stored={id:string;type:string;payload_json:string;dispatch_state:string;processing_attempts:number};
export async function dispatchEvent(env:DispatchEnv,event:QueueEvent,handle:(event:QueueEvent)=>Promise<unknown>) {
 if(!event.id)throw new Error('Durable event identifier required');
 const stored=await env.DB.prepare("SELECT id,type,payload_json,dispatch_state,processing_attempts FROM outbox_events WHERE id=?").bind(event.id).first<Stored>();
 if(!stored)throw new Error('Durable event not found');
 if(['HELD','DONE','FAILED','PROCESSING'].includes(stored.dispatch_state))return;
 const feature=eventCapability(stored.type);
 if(feature&&!capabilityEnabled(env,feature)) {
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='HELD',hold_reason='CAPABILITY_DISABLED' WHERE id=? AND dispatch_state IN ('PENDING','PUBLISHED')").bind(stored.id).run();return;
 }
 const token=crypto.randomUUID();const now=new Date().toISOString();
 const claim=await env.DB.prepare("UPDATE outbox_events SET dispatch_state='PROCESSING',processing_token=?,processing_started_at=?,processing_attempts=processing_attempts+1 WHERE id=? AND dispatch_state IN ('PENDING','PUBLISHED') AND processing_attempts<10").bind(token,now,stored.id).run();
 if(!claim.meta.changes){if(stored.processing_attempts>=10)await env.DB.prepare("UPDATE outbox_events SET dispatch_state='FAILED',last_error='Limite de tentativas atingido.' WHERE id=? AND dispatch_state IN ('PENDING','PUBLISHED')").bind(stored.id).run();return;}
 try {
  const result=await handle({...JSON.parse(stored.payload_json),id:stored.id,type:stored.type}) as {sent?:boolean;duplicate?:boolean;status?:string;uncertain?:boolean;paused?:boolean}|undefined;
  const state=result?.uncertain?'HELD':result?.status==='FAILED'||(result?.sent===false&&!result.duplicate&&!result.paused)?'FAILED':'DONE';
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state=?,hold_reason=?,processed_at=?,processing_token=NULL,processing_started_at=NULL WHERE id=? AND processing_token=? AND dispatch_state='PROCESSING'")
   .bind(state,result?.uncertain?'SEND_UNKNOWN':null,now,stored.id,token).run();
 } catch {
  // External-effect handlers persist their own uncertain outcome. An unclassified
  // crash cannot prove that the provider rejected the action: retain for review.
  const safe=!feature||stored.type==='checkout.create';
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state=?,hold_reason=?,published_at=NULL,next_attempt_at=?,last_error='Falha no processamento; conferir requestId.',processing_token=NULL,processing_started_at=NULL WHERE id=? AND processing_token=?")
   .bind(safe?'PENDING':'HELD',safe?null:'PROCESSING_RESULT_UNKNOWN',safe?retryAt(stored.processing_attempts):null,stored.id,token).run();
  if(safe)throw new Error('Durable processing failed');
 }
}
