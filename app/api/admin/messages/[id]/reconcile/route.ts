import {env} from "cloudflare:workers";
import {z} from "zod";
import {requireAccessUser} from "@/server/auth/access";
import {errorResponse,HttpError,json} from "@/server/http";
import {readJsonWithLimit} from "@/server/request-context";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const actor=await requireAccessUser(request,['admin','gestor']);const {id}=await params;
  const input=z.object({outcome:z.enum(['delivered','not-sent']),reason:z.string().trim().min(8).max(1000)}).strict().parse(await readJsonWithLimit(request,4096));
  const row=await env.DB.prepare("SELECT id,checkout_id FROM messages WHERE id=? AND status='SEND_UNKNOWN'").bind(id).first<{id:string;checkout_id:string|null}>();
  if(!row)throw new HttpError(409,'MESSAGE_NOT_UNCERTAIN','A mensagem não possui resultado incerto.');
  // Checkout delivery must also reconcile its delivery axis; that path is handled
  // by the checkout-specific audited delivery action.
  if(row.checkout_id)throw new HttpError(409,'CHECKOUT_RECONCILIATION_REQUIRED','Concilie a entrega pelo checkout vinculado.');
  const now=new Date().toISOString();
  const [changed]=await env.DB.batch([
   env.DB.prepare("UPDATE messages SET status=?,last_error=NULL WHERE id=? AND status='SEND_UNKNOWN'").bind(input.outcome==='delivered'?'DELIVERED':'FAILED',id),
   env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,after_json,created_at) SELECT ?,?,'message.reconcile','message',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),actor.id,id,JSON.stringify(input),now),
  ]);
  if(!changed.meta.changes)throw new HttpError(409,'MESSAGE_CHANGED','A mensagem mudou. Atualize a tela.');
  await env.DB.prepare("UPDATE outbox_events SET dispatch_state='DONE',processed_at=?,hold_reason=NULL WHERE type='conversation.manual.send' AND json_extract(payload_json,'$.messageId')=? AND dispatch_state='HELD'").bind(now,id).run();
  return json({id,status:input.outcome==='delivered'?'DELIVERED':'FAILED'});
 } catch(error){return errorResponse(error);}
}
