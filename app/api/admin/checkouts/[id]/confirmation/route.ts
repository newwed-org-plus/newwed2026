import {env} from "cloudflare:workers";
import {z} from "zod";
import {requireAccessUser} from "@/server/auth/access";
import {requireCapability} from "@/server/capabilities";
import {errorResponse,HttpError,json} from "@/server/http";
import {readJsonWithLimit} from "@/server/request-context";
import {publishOutbox} from "@/server/outbox";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const actor=await requireAccessUser(request,['admin','gestor']);requireCapability(env,'confirmation');const {id}=await params;
  const {reason}=z.object({reason:z.string().trim().min(8).max(1000)}).strict().parse(await readJsonWithLimit(request,4096));
  const eventId=`confirmation:${id}`;const now=new Date().toISOString();
  const result=await env.DB.batch([
   env.DB.prepare(`UPDATE messages SET status='SEND_PENDING',last_error=NULL WHERE id=? AND status='FAILED'
    AND EXISTS(SELECT 1 FROM checkouts WHERE id=? AND status='PAID' AND delivery_channel='uazapi')
    AND EXISTS(SELECT 1 FROM outbox_events WHERE id=? AND dispatch_state IN ('FAILED','DONE'))`).bind(eventId,id,eventId),
   env.DB.prepare("UPDATE outbox_events SET dispatch_state='PENDING',published_at=NULL,processed_at=NULL,processing_attempts=0,hold_reason=NULL,next_attempt_at=NULL WHERE id=? AND changes()=1").bind(eventId),
   env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,after_json,created_at) SELECT ?,?,'checkout.confirmation.retry','checkout',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify({reason}),now),
  ]);
  if(!result[0].meta.changes)throw new HttpError(409,'CONFIRMATION_NOT_RETRYABLE','Confirme primeiro que a mensagem não foi enviada. Somente falhas conhecidas podem ser reenviadas.');
  await publishOutbox(env,{id:eventId,type:'checkout.confirmation.send',checkoutId:id});return json({queued:true},{status:202});
 }catch(error){return errorResponse(error);}
}
