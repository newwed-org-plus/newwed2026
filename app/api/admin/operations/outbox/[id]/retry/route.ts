import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {requireAccessUser} from '@/server/auth/access';
import {requireCapability} from '@/server/capabilities';
import {readJsonWithLimit} from '@/server/request-context';
import {errorResponse,HttpError,json} from '@/server/http';
import {publishOutbox} from '@/server/outbox';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const actor=await requireAccessUser(request,['admin','gestor']);const {id}=await params;
  const {reason}=z.object({reason:z.string().trim().min(8).max(1000)}).strict().parse(await readJsonWithLimit(request,4096));
  const row=await env.DB.prepare('SELECT type,payload_json,dispatch_state FROM outbox_events WHERE id=?').bind(id).first<{type:string;payload_json:string;dispatch_state:string}>();
  if(!row||row.type!=='notification.email'||!['FAILED','DONE'].includes(row.dispatch_state))throw new HttpError(409,'OPERATION_NOT_RETRYABLE','Somente e-mails com falha conhecida podem ser reenviados por esta ação.');
  requireCapability(env,'email');const payload=JSON.parse(row.payload_json) as {notificationId:string;userId:string};const now=new Date().toISOString();
  const [changed]=await env.DB.batch([
   env.DB.prepare("UPDATE notification_recipients SET delivery_status='PENDING',last_error=NULL,updated_at=? WHERE notification_id=? AND user_id=? AND channel='EMAIL' AND delivery_status='FAILED'").bind(now,payload.notificationId,payload.userId),
   env.DB.prepare("UPDATE outbox_events SET dispatch_state='PENDING',published_at=NULL,processed_at=NULL,hold_reason=NULL,next_attempt_at=NULL,processing_attempts=0,last_error=NULL WHERE id=? AND changes()=1").bind(id),
   env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,after_json,created_at) SELECT ?,?,'operation.email.retry','outbox',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify({reason}),now),
  ]);
  if(!changed.meta.changes)throw new HttpError(409,'EMAIL_NOT_FAILED','Confirme primeiro o resultado do envio anterior.');
  await publishOutbox(env,{...payload,id,type:row.type});return json({queued:true},{status:202});
 }catch(error){return errorResponse(error);}
}
