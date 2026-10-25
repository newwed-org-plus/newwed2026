import {env} from 'cloudflare:workers';
import {requireAccessUser} from '@/server/auth/access';
import {requireSameOrigin} from '@/server/auth/session';
import {requireCapability} from '@/server/capabilities';
import {recoveryEnabled} from '@/server/ai-availability';
import {getSecrets} from '@/server/secrets';
import {localRecipientAllowed} from '@/server/integrations/uazapi';
import {getLineAgent} from '@/server/whatsapp-agents';
import {processUazapiBatch} from '@/server/uazapi-webhook';
import {errorResponse,HttpError,json} from '@/server/http';

// Explicit local recovery only. Releasing a conversation never replays its backlog.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await requireAccessUser(request,['admin','gestor']);requireSameOrigin(request);requireCapability(env,'agent');
  const runtime={...env,...getSecrets()};
  if(runtime.ENVIRONMENT!=='development'||runtime.LOCAL_TEST_MODE!=='true'||!recoveryEnabled(runtime))throw new HttpError(409,'LOCAL_RECOVERY_DISABLED','Recuperação disponível apenas no teste local autorizado.');
  const {id}=await params;
  const c=await env.DB.prepare('SELECT mode,claimed_by,opted_out_at,agent_processing_token,whatsapp_instance_id,contact_phone FROM conversations WHERE id=?').bind(id).first<{mode:string;claimed_by:string|null;opted_out_at:string|null;agent_processing_token:string|null;whatsapp_instance_id:string|null;contact_phone:string|null}>();
  if(!c||c.mode!=='AGENT'||c.claimed_by||c.opted_out_at||c.agent_processing_token)throw new HttpError(409,'AGENT_NOT_AVAILABLE','Devolva a conversa ao agente e aguarde o processamento atual antes de retomar.');
  if(!c.contact_phone||!localRecipientAllowed(runtime,c.contact_phone)||!c.whatsapp_instance_id||!(await getLineAgent(runtime,c.whatsapp_instance_id))?.enabled||!runtime.OPENROUTER_API_KEY)throw new HttpError(409,'AGENT_NOT_READY','Confira o atendente e o destinatário autorizado.');
  const latest=await env.DB.prepare("SELECT external_id,created_at FROM messages WHERE conversation_id=? AND direction='IN' ORDER BY created_at DESC,id DESC LIMIT 1").bind(id).first<{external_id:string;created_at:string}>();
  if(!latest||Date.now()-Date.parse(latest.created_at)>48*3600000||await env.DB.prepare("SELECT id FROM messages WHERE conversation_id=? AND direction='OUT' AND (created_at>=? OR status IN ('SENDING','SEND_UNKNOWN')) LIMIT 1").bind(id,latest.created_at).first())throw new HttpError(409,'REPLY_RECOVERY_UNSAFE','Não há pergunta recente sem resposta que possa ser retomada com segurança.');
  // Replay only the persisted authenticated live envelope when a cache pull won
  // its race. This never fabricates a live event from imported history.
  const liveBatch=await env.DB.prepare(`SELECT w.external_id FROM webhook_events w,json_each(w.payload_json) item
    WHERE w.provider='uazapi' AND w.event_type='uazapi.batch' AND json_extract(item.value,'$.payload.event.id')=?
    AND json_extract(item.value,'$.payload.lineId')=? AND json_extract(item.value,'$.payload.event.history')=0
    AND EXISTS(SELECT 1 FROM webhook_events p WHERE p.external_id=json_extract(item.value,'$.externalId') AND json_extract(p.payload_json,'$.event.history')=1) LIMIT 1`)
    .bind(latest.external_id,c.whatsapp_instance_id).first<{external_id:string}>();
  if(liveBatch)await processUazapiBatch(runtime,liveBatch.external_id);
  const event=await env.DB.prepare("SELECT external_id,payload_json FROM webhook_events WHERE provider='uazapi' AND event_type='uazapi.incoming' AND json_extract(payload_json,'$.event.id')=? AND json_extract(payload_json,'$.lineId')=? AND json_extract(payload_json,'$.event.history')=0 LIMIT 1").bind(latest.external_id,c.whatsapp_instance_id).first<{external_id:string;payload_json:string}>();
  const input=event?JSON.parse(event.payload_json).event:null;
  if(!event||!input?.text?.body||input.history||input.fromMe)throw new HttpError(409,'REPLY_RECOVERY_UNSAFE','Somente uma pergunta recebida ao vivo pode ser retomada.');
  const key=`reply:uazapi:${latest.external_id}`;const now=new Date().toISOString();
  const [changed]=await env.DB.batch([
   env.DB.prepare(`INSERT INTO outbox_events(id,type,aggregate_id,dedupe_key,payload_json,dispatch_state,created_at)
    SELECT ?,'conversation.reply.requested',id,?,?,'PENDING',? FROM conversations WHERE id=? AND mode='AGENT' AND claimed_by IS NULL AND opted_out_at IS NULL AND agent_processing_token IS NULL
    ON CONFLICT(id) DO UPDATE SET dispatch_state='PENDING',published_at=NULL,processed_at=NULL,next_attempt_at=NULL,last_error=NULL,attempts=0,processing_attempts=0
    WHERE outbox_events.dispatch_state IN ('DONE','FAILED') AND NOT EXISTS(SELECT 1 FROM messages WHERE in_reply_to=?)`)
    .bind(key,key,JSON.stringify({externalId:event.external_id,provider:'uazapi'}),now,id,event.external_id),
   env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,after_json,created_at) SELECT ?,?,'conversation.agent.retry','conversation',?,?,? WHERE changes()=1")
    .bind(crypto.randomUUID(),actor.id,id,JSON.stringify({eventId:key}),now),
  ]);
  return json({queued:Boolean(changed.meta.changes),eventId:key},{status:202});
 }catch(error){return errorResponse(error);}
}
