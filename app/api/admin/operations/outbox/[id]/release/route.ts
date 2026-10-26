import {env} from "cloudflare:workers";
import {z} from "zod";
import {requireAccessUser} from "@/server/auth/access";
import {errorResponse,HttpError,json} from "@/server/http";
import {eventCapability,requireCapability} from "@/server/capabilities";
import {publishOutbox} from "@/server/outbox";
import {readJsonWithLimit} from "@/server/request-context";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const actor=await requireAccessUser(request,['admin','gestor']);const {id}=await params;
  const {reason}=z.object({reason:z.string().trim().min(8).max(1000)}).strict().parse(await readJsonWithLimit(request,4096));
  const row=await env.DB.prepare("SELECT type,payload_json,hold_reason FROM outbox_events WHERE id=? AND dispatch_state='HELD'").bind(id).first<{type:string;payload_json:string;hold_reason:string|null}>();
  if(!row)throw new HttpError(409,'OUTBOX_NOT_HELD','A operação não está retida.');
  if(!['PRE_ACTIVATION_REVIEW','CAPABILITY_DISABLED'].includes(row.hold_reason??''))throw new HttpError(409,'RECONCILIATION_REQUIRED','Confira o resultado no provedor antes de liberar qualquer novo envio.');
  if(row.type==='conversation.reply.requested')throw new HttpError(409,'AGENT_REQUEST_EXPIRED','Uma solicitação antiga do agente não pode ser reenviada. Retome pela Inbox.');
  const feature=eventCapability(row.type);if(!feature)throw new HttpError(422,'UNSUPPORTED_OPERATION','Operação não liberável por esta rota.');requireCapability(env,feature);
  const now=new Date().toISOString();
  const [changed]=await env.DB.batch([
   env.DB.prepare("UPDATE outbox_events SET dispatch_state='PENDING',hold_reason=NULL,published_at=NULL,next_attempt_at=NULL,attempts=0,processing_attempts=0 WHERE id=? AND dispatch_state='HELD' AND hold_reason=?").bind(id,row.hold_reason),
   env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,after_json,created_at) SELECT ?,?,'outbox.release','outbox',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify({reason}),now),
  ]);
  if(!changed.meta.changes)throw new HttpError(409,'OUTBOX_CHANGED','A operação mudou. Atualize a tela.');
  await publishOutbox(env,{...JSON.parse(row.payload_json),id,type:row.type});return json({id,state:'PENDING'},{status:202});
 } catch(error){return errorResponse(error);}
}
