import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {requireAccessUser} from '@/server/auth/access';
import {readJsonWithLimit} from '@/server/request-context';
import {errorResponse,HttpError,json} from '@/server/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const actor=await requireAccessUser(request,['admin','gestor']);const {id}=await params;
  const input=z.object({outcome:z.enum(['sent','not-sent']),reason:z.string().trim().min(8).max(1000),providerMessageId:z.string().trim().min(1).max(256).optional()}).strict().parse(await readJsonWithLimit(request,4096));
  const row=await env.DB.prepare("SELECT payload_json FROM outbox_events WHERE id=? AND type='notification.email' AND dispatch_state='HELD' AND hold_reason IN ('SEND_UNKNOWN','PROCESSING_RESULT_UNKNOWN')").bind(id).first<{payload_json:string}>();
  if(!row)throw new HttpError(409,'OPERATION_NOT_UNCERTAIN','Não existe e-mail incerto para conciliar.');
  const payload=JSON.parse(row.payload_json) as {notificationId:string;userId:string};const now=new Date().toISOString();
  const [changed]=await env.DB.batch([
   env.DB.prepare("UPDATE notification_recipients SET delivery_status=?,provider_message_id=coalesce(?,provider_message_id),sent_at=CASE WHEN ?='sent' THEN coalesce(sent_at,?) ELSE sent_at END,last_error=NULL,updated_at=? WHERE notification_id=? AND user_id=? AND channel='EMAIL' AND delivery_status IN ('SEND_UNKNOWN','PENDING')").bind(input.outcome==='sent'?'SENT':'FAILED',input.providerMessageId??null,input.outcome,now,now,payload.notificationId,payload.userId),
   env.DB.prepare("UPDATE outbox_events SET dispatch_state=?,hold_reason=NULL,processed_at=? WHERE id=? AND changes()=1").bind(input.outcome==='sent'?'DONE':'FAILED',now,id),
   env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,after_json,created_at) SELECT ?,?,'operation.email.reconcile','outbox',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify(input),now),
  ]);
  if(!changed.meta.changes)throw new HttpError(409,'OPERATION_CHANGED','A operação mudou. Atualize a tela.');return json({reconciled:true});
 }catch(error){return errorResponse(error);}
}
