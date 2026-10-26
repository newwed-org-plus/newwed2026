import {confirmationText} from './local-checkout-policy';
import {publishOutbox} from "./outbox";
import {sendUazapiText} from "./integrations/uazapi";
import {reconcileUazapiReceipt} from "./uazapi-webhook";
import {uncertainSend} from "./send-outcome";
import type {RuntimeSecrets} from "./secrets";
export async function ensurePaidConfirmation(env:Pick<Env,'DB'|'EVENTS_QUEUE'>,checkoutId:string,requestId:string) {
 const row=await env.DB.prepare("SELECT id FROM checkouts WHERE id=? AND status='PAID' AND delivery_channel='uazapi' AND conversation_id IS NOT NULL AND whatsapp_instance_id IS NOT NULL").bind(checkoutId).first();
 if(!row)return;
 const id=`confirmation:${checkoutId}`;const now=new Date().toISOString();
 await env.DB.prepare("INSERT OR IGNORE INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at) VALUES (?,'checkout.confirmation.send',?,?,?,0,?,?)").bind(id,checkoutId,id,JSON.stringify({checkoutId,requestId}),requestId,now).run();
 const state=await env.DB.prepare("SELECT published_at FROM outbox_events WHERE id=?").bind(id).first<{published_at:string|null}>();
 if(state&&!state.published_at)await publishOutbox(env,{id,type:'checkout.confirmation.send',checkoutId,requestId});
}
export async function sendPaidConfirmation(env:Env & RuntimeSecrets,checkoutId:string,eventId:string,fetcher:typeof fetch=fetch) {
 const checkout=await env.DB.prepare(`SELECT c.conversation_id,c.whatsapp_instance_id,c.status,e.name AS edition_name,v.contact_phone,v.opted_out_at FROM checkouts c
  JOIN editions e ON e.id=c.edition_id JOIN conversations v ON v.id=c.conversation_id AND v.whatsapp_instance_id=c.whatsapp_instance_id WHERE c.id=? AND c.delivery_channel='uazapi'`)
  .bind(checkoutId).first<{conversation_id:string;whatsapp_instance_id:string;status:string;edition_name:string;contact_phone:string;opted_out_at:string|null}>();
 if(!checkout||checkout.status!=='PAID')return {sent:false as const,paused:true};
 if(checkout.opted_out_at)return {sent:false as const,errorCode:'CONVERSATION_OPTED_OUT'};
 const prior=await env.DB.prepare("SELECT status FROM messages WHERE id=?").bind(eventId).first<{status:string}>();
 if(prior&&['ACCEPTED','DELIVERED','READ'].includes(prior.status))return {sent:true as const,duplicate:true};
 if(prior&&['SEND_UNKNOWN','SENDING'].includes(prior.status))return {sent:false as const,uncertain:true};
 const now=new Date().toISOString();const text=confirmationText(env,checkout.edition_name);
 await env.DB.prepare("INSERT OR IGNORE INTO messages (id,conversation_id,checkout_id,direction,type,body,status,request_id,created_at) VALUES (?,?,?,'OUT','payment_confirmation',?,'SEND_PENDING',?,?)").bind(eventId,checkout.conversation_id,checkoutId,text,eventId,now).run();
 const claimed=await env.DB.prepare("UPDATE messages SET status='SENDING',send_started_at=? WHERE id=? AND status='SEND_PENDING'").bind(now,eventId).run();
 if(!claimed.meta.changes)return {sent:false as const,paused:true};
 try {
  const response=await sendUazapiText(env,checkout.whatsapp_instance_id,checkout.contact_phone,text,fetcher);
  const id=response.messages[0].id;
  await env.DB.prepare("UPDATE messages SET external_id=?,status='ACCEPTED',accepted_at=? WHERE id=? AND status='SENDING'").bind(id,new Date().toISOString(),eventId).run();
  await reconcileUazapiReceipt(env,id);return {sent:true as const};
 } catch(error) {
  const uncertain=uncertainSend(error);
  await env.DB.prepare("UPDATE messages SET status=?,last_error='Confirmação não concluída; conferir o resultado.',failed_at=? WHERE id=? AND status='SENDING'").bind(uncertain?'SEND_UNKNOWN':'FAILED',new Date().toISOString(),eventId).run();
  return {sent:false as const,uncertain};
 }
}
