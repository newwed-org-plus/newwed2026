import {requireCapability} from "@/server/capabilities";
import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,HttpError,json } from "@/server/http";
import { getLineAgent } from "@/server/whatsapp-agents";
import { getSecrets } from "@/server/secrets";

export async function POST(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  try {
    const actor = await requireAccessUser(request);
    requireCapability(env,"agent");
    const { id } = await params;
    const before = await env.DB.prepare("SELECT mode,claimed_by,agent_processing_token,opted_out_at,agent_error FROM conversations WHERE id=?")
      .bind(id).first<{ mode:string;claimed_by:string|null;agent_processing_token:string|null;opted_out_at:string|null;agent_error:string|null }>();
    if (!before) throw new HttpError(404,"CONVERSATION_NOT_FOUND","Conversa não encontrada.");
    const line = await env.DB.prepare("SELECT whatsapp_instance_id FROM conversations WHERE id=?").bind(id).first<{whatsapp_instance_id:string|null}>();
    if (line?.whatsapp_instance_id && (!(await getLineAgent(env,line.whatsapp_instance_id))?.enabled || !getSecrets().OPENROUTER_API_KEY)) throw new HttpError(409,"AGENT_NOT_READY","Ative o atendente desta linha e configure o OpenRouter antes de devolver a conversa.");
    if (before.mode === "AGENT" && !before.claimed_by) return json({ conversationId:id,mode:"AGENT",changed:false });
    const elevated = actor.roles.includes("admin") || actor.roles.includes("gestor");
    if (before.claimed_by && before.claimed_by !== actor.id && !elevated) throw new HttpError(403,"CONVERSATION_NOT_OWNED","Somente o responsável ou a gestão pode devolver esta conversa.");
    if (before.opted_out_at) throw new HttpError(409,"CONVERSATION_OPTED_OUT","O contato recusou mensagens automáticas.");
    if (before.agent_processing_token) throw new HttpError(409,"AGENT_REPLY_IN_PROGRESS","A pausa do agente ainda está sendo concluída. Tente novamente em instantes.");
    if(await env.DB.prepare("SELECT id FROM messages WHERE conversation_id=? AND status IN ('SENDING','SEND_UNKNOWN') LIMIT 1").bind(id).first())throw new HttpError(409,"MESSAGE_SEND_IN_PROGRESS","Confira o envio em andamento antes de devolver ao agente.");
    const now = new Date().toISOString();
    const [updated] = await env.DB.batch([
      env.DB.prepare("UPDATE conversations SET mode='AGENT',human_active=0,claimed_by=NULL,released_at=?,agent_paused_at=NULL,agent_error=NULL,updated_at=? WHERE id=? AND mode='HUMAN' AND agent_processing_token IS NULL AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id=? AND status IN ('SENDING','SEND_UNKNOWN'))")
        .bind(now,now,id,id),
      env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,ip,created_at) SELECT ?,?,'conversation.release','conversation',?,?,?,?,? WHERE changes()=1")
        .bind(crypto.randomUUID(),actor.id,id,JSON.stringify(before),JSON.stringify({ mode:"AGENT" }),request.headers.get("cf-connecting-ip"),now),
    ]);
    if ((updated.meta.changes ?? 0) !== 1) throw new HttpError(409,"CONVERSATION_RELEASE_CONFLICT","A conversa mudou. Atualize a inbox e tente novamente.");
    return json({ conversationId:id,mode:"AGENT",changed:true });
  } catch (error) { return errorResponse(error); }
}
