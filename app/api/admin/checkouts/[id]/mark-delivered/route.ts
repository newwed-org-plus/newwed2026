import {env} from "cloudflare:workers";
import {z} from "zod";
import {markCheckoutDelivered} from "@/server/checkout-delivery";
import {requireAccessUser} from "@/server/auth/access";
import {errorResponse,HttpError,json} from "@/server/http";
import {readJsonWithLimit} from "@/server/request-context";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const actor=await requireAccessUser(request,['admin','gestor']);const {id}=await params;
  const input=request.body?z.object({messageId:z.string().max(256).optional(),outcome:z.enum(['delivered','not-sent']).default('delivered'),reason:z.string().trim().min(8).max(1000).optional()}).strict().parse(await readJsonWithLimit(request,4096)):{outcome:'delivered' as const,reason:undefined,messageId:undefined};
  const checkout=await env.DB.prepare("SELECT status,send_status FROM checkouts WHERE id=?").bind(id).first<{status:string;send_status:string}>();
  if(!checkout)throw new HttpError(404,'CHECKOUT_NOT_FOUND','Checkout não encontrado.');
  const message=input.messageId?await env.DB.prepare("SELECT id,type,status FROM messages WHERE id=? AND checkout_id=?").bind(input.messageId,id).first<{id:string;type:string;status:string}>():null;
  if(input.messageId&&(!message||message.status!=='SEND_UNKNOWN'))throw new HttpError(409,'MESSAGE_NOT_UNCERTAIN','A mensagem não possui resultado incerto.');
  const uncertain=Boolean(message)||checkout.send_status==='UNKNOWN';
  if((uncertain||input.outcome==='not-sent')&&!input.reason)throw new HttpError(422,'REASON_REQUIRED','Descreva a evidência após conferir o resultado no WhatsApp.');
  if(!message&&checkout.send_status==='DELIVERED')return json({checkoutId:id,changed:false});
  if(!message&&!['ACCEPTED','UNKNOWN'].includes(checkout.send_status))throw new HttpError(409,'CHECKOUT_NOT_DELIVERABLE','Não há envio aceito ou incerto para conciliar.');
  const now=new Date().toISOString();const confirmation=message?.type==='payment_confirmation';
  if(!confirmation) {
    if(input.outcome==='delivered')await markCheckoutDelivered(env,id,actor.id,input.reason??'Entrega confirmada manualmente');
    else await env.DB.prepare("UPDATE checkouts SET status=CASE WHEN status IN ('PAID','REFUNDED','CANCELLED','OVERDUE') THEN status ELSE 'FAILED' END,send_status='FAILED',last_error_code='DELIVERY_NOT_SENT',last_error='Envio não realizado, conferido pelo operador.',processing_token=NULL,processing_started_at=NULL,updated_at=? WHERE id=?").bind(now,id).run();
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET status=?,last_error=NULL WHERE checkout_id=? AND status='SEND_UNKNOWN' AND ((? IS NOT NULL AND id=?) OR (? IS NULL AND type!='payment_confirmation'))").bind(input.outcome==='delivered'?'DELIVERED':'FAILED',id,input.messageId??null,input.messageId??null,input.messageId??null),
    env.DB.prepare("UPDATE outbox_events SET dispatch_state='DONE',processed_at=?,hold_reason=NULL WHERE aggregate_id=? AND type=? AND dispatch_state='HELD'").bind(now,id,confirmation?'checkout.confirmation.send':'checkout.send'),
    env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,'checkout.delivery.reconcile','checkout',?,?,?,?)").bind(crypto.randomUUID(),actor.id,id,JSON.stringify(checkout),JSON.stringify(input),now),
  ]);
  return json({checkoutId:id,changed:true});
 }catch(error){return errorResponse(error);}
}
