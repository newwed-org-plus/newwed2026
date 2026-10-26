import {sameWhatsAppRecipient} from './whatsapp-phone';
export {sameWhatsAppRecipient} from './whatsapp-phone';
import {z} from 'zod';
import {markCheckoutDelivered} from './checkout-delivery';
import {configuredInstance,uazapiMessageId,uazapiRequest,type UazapiEnv} from './integrations/uazapi';
import {acquireLease,releaseLease} from './operation-lease';
import {HttpError} from './http';

export type DeliveryStatus='SENT'|'DELIVERED'|'READ'|'FAILED';
export function normalizeDeliveryStatus(value:unknown):DeliveryStatus|null {
 if(typeof value!=='string')return null;
 const status=value.toUpperCase();
 if(status==='PLAYED')return 'READ';
 if(status==='CANCELED'||status==='CANCELLED')return 'FAILED';
 return ['SENT','DELIVERED','READ','FAILED'].includes(status)?status as DeliveryStatus:null;
}
export function receiptTime(timestamp:unknown) {
 if(typeof timestamp==='number'&&Number.isFinite(timestamp)&&timestamp>0){
  const milliseconds=timestamp<100_000_000_000?timestamp*1000:timestamp;
  if(milliseconds<Date.now()+86400000)return new Date(milliseconds).toISOString();
 }
 return new Date().toISOString();
}
export async function applyUazapiDelivery(env:Pick<Env,'DB'>,messageId:string,status:DeliveryStatus,observedAt=new Date().toISOString()) {
 const result=await env.DB.prepare(`UPDATE messages SET
  status=CASE WHEN status='READ' THEN 'READ' WHEN status='DELIVERED' AND ?!='READ' THEN 'DELIVERED'
   WHEN status='FAILED' AND ?='SENT' THEN 'FAILED' ELSE ? END,
  sent_at=CASE WHEN ? IN ('SENT','DELIVERED','READ') THEN coalesce(sent_at,accepted_at,?) ELSE sent_at END,
  delivered_at=CASE WHEN ? IN ('DELIVERED','READ') THEN min(coalesce(delivered_at,?),?) ELSE delivered_at END,
  read_at=CASE WHEN ?='READ' THEN min(coalesce(read_at,?),?) ELSE read_at END,
  status_updated_at=CASE WHEN status!=? AND status!='READ' AND NOT(status='DELIVERED' AND ?!='READ') AND NOT(status='FAILED' AND ?='SENT') THEN ? ELSE status_updated_at END,
  status_check_error=CASE WHEN ? IN ('SENT','DELIVERED','READ') THEN NULL ELSE status_check_error END,
  last_error=CASE WHEN ? IN ('DELIVERED','READ') THEN NULL WHEN ?='FAILED' AND status NOT IN ('DELIVERED','READ') THEN 'A UAZAPI informou falha no envio.' ELSE last_error END,
  failed_at=CASE WHEN ? IN ('DELIVERED','READ') THEN NULL WHEN ?='FAILED' AND status NOT IN ('DELIVERED','READ') THEN coalesce(failed_at,?) ELSE failed_at END
  WHERE external_id=? AND direction='OUT'`)
  .bind(
   status,status,status,
   status,observedAt,
   status,observedAt,observedAt,
   status,observedAt,observedAt,
   status,status,status,observedAt,
   status,
   status,status,
   status,status,observedAt,messageId,
  ).run();
 const delivered=await env.DB.prepare("SELECT checkout_id,type FROM messages WHERE external_id=? AND status IN ('DELIVERED','READ')").bind(messageId).first<{checkout_id:string|null;type:string}>();
 if(delivered?.checkout_id&&delivered.type!=='payment_confirmation')await markCheckoutDelivered(env,delivered.checkout_id,null,'Entrega confirmada pela UAZAPI');
 return result.meta.changes??0;
}
export async function observeUazapiDelivery(env:Pick<Env,'DB'>,lineId:string,messageId:string,status:DeliveryStatus,observedAt=new Date().toISOString()) {
 await env.DB.prepare("INSERT OR IGNORE INTO webhook_events(id,provider,external_id,event_type,payload_json,processed_at,created_at) VALUES (?,'uazapi',?,'uazapi.status',?,?,?)")
  .bind(crypto.randomUUID(),`status:${messageId}:${status}`,JSON.stringify({lineId,messageId,status,observedAt,source:'provider-snapshot'}),observedAt,observedAt).run();
 return applyUazapiDelivery(env,messageId,status,observedAt);
}
const storedMessage=z.object({id:z.string().optional(),messageid:z.string().optional(),chatid:z.string(),fromMe:z.boolean(),status:z.string().optional()});
type SyncEnv=UazapiEnv & {ENABLE_MESSAGE_STATUS_SYNC?:string};
export async function syncUazapiDelivery(env:SyncEnv,options:{conversationId?:string;force?:boolean;limit?:number}={},fetcher:typeof fetch=fetch) {
 if(String(env.ENABLE_MESSAGE_STATUS_SYNC)!=='true')return {checked:0,updated:0,unavailable:0,paused:true};
 const leaseId=`delivery:${options.conversationId??'cron'}`;const lease=await acquireLease(env,leaseId,180);
 if(!lease)return {checked:0,updated:0,unavailable:0,busy:true};
 let checked=0,updated=0,unavailable=0;const started=Date.now();
 try{
  const since=new Date(Date.now()-7*86400000).toISOString();const due=new Date(Date.now()-60000).toISOString();
  const rows=await env.DB.prepare(`SELECT m.id,m.external_id,m.status,c.whatsapp_instance_id,c.contact_phone FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN whatsapp_instances w ON w.id=c.whatsapp_instance_id
   WHERE m.direction='OUT' AND m.external_id LIKE 'uazapi:%' AND m.status IN ('ACCEPTED','SENT','DELIVERED','SEND_UNKNOWN') AND m.created_at>=?
   AND w.state='connected' AND (? IS NULL OR c.id=?) AND (?=1 OR m.status_checked_at IS NULL OR m.status_checked_at<=?)
   ORDER BY m.status_checked_at,m.created_at DESC LIMIT ?`).bind(since,options.conversationId??null,options.conversationId??null,options.force?1:0,due,Math.min(10,Math.max(1,options.limit??10)))
   .all<{id:string;external_id:string;status:string;whatsapp_instance_id:string;contact_phone:string}>();
  for(const row of rows.results){
   if(Date.now()-started>30000)break;
   const now=new Date().toISOString();checked++;
   try{
    const prefix=`uazapi:${row.whatsapp_instance_id}:`;if(!row.external_id.startsWith(prefix))throw new HttpError(502,'UAZAPI_MESSAGE_LINE_MISMATCH','Linha divergente.');
    const value=await uazapiRequest(configuredInstance(env,row.whatsapp_instance_id),'/message/find',{id:row.external_id.slice(prefix.length),limit:1,offset:0},fetcher);
    const page=z.object({messages:z.array(storedMessage).max(1)}).parse(value);const message=page.messages[0];
    if(!message||message.fromMe!==true||!sameWhatsAppRecipient(row.contact_phone,message.chatid)||![message.messageid,message.id].some(id=>id&&uazapiMessageId(row.whatsapp_instance_id,id)===row.external_id))throw new HttpError(502,'UAZAPI_MESSAGE_UNCONFIRMED','Estado ainda não confirmado.');
    const status=normalizeDeliveryStatus(message.status);
    if(status){await observeUazapiDelivery(env,row.whatsapp_instance_id,row.external_id,status,now);const after=await env.DB.prepare('SELECT status FROM messages WHERE id=?').bind(row.id).first<{status:string}>();if(after?.status!==row.status)updated++;}
    await env.DB.prepare('UPDATE messages SET status_checked_at=?,status_check_error=NULL WHERE id=?').bind(now,row.id).run();
   }catch(error){unavailable++;await env.DB.prepare('UPDATE messages SET status_checked_at=?,status_check_error=? WHERE id=? AND status!=\'READ\'').bind(now,error instanceof HttpError?error.code:'UAZAPI_STATUS_UNAVAILABLE',row.id).run();if(error instanceof HttpError&&['UAZAPI_UNAVAILABLE','UAZAPI_HTTP_429','UAZAPI_HTTP_500','UAZAPI_HTTP_502','UAZAPI_HTTP_503','UAZAPI_HTTP_504'].includes(error.code))break;}
  }
  return {checked,updated,unavailable};
 }finally{await releaseLease(env,leaseId,lease);}
}
