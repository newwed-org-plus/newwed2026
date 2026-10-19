import { requiresImmediateHandoff,type AgentResult } from "@/features/conversations/model";
import { markLeadInAttendance,pauseConversationForHandoff,queueConversationSummary } from "@/server/conversation-state";
import { answerWithAgent,summarizeConversation,type OpenAIFetcher } from "@/server/integrations/openai-agent";
import { sendUazapiText } from "@/server/integrations/uazapi";
import { reconcileUazapiReceipt,type UazapiIncoming } from "@/server/uazapi-webhook";
import { sendWhatsAppText,type MetaFetcher } from "@/server/integrations/meta";
import type { RuntimeSecrets } from "@/server/secrets";

type ConversationWorkerEnv = Env & RuntimeSecrets;
type ProcessingDependencies = { openaiFetcher?:OpenAIFetcher;metaFetcher?:MetaFetcher;uazapiFetcher?:typeof fetch };
type ConversationRow = {
  id:string;lead_id:string|null;mode:"AGENT"|"HUMAN";claimed_by:string|null;opted_out_at:string|null;request_id:string|null;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0,1000);
}

async function sendConversationText(env: ConversationWorkerEnv,conversationId: string,phone: string,body: string,fetcher?:typeof fetch) {
  const conversation = await env.DB.prepare("SELECT whatsapp_instance_id,contact_phone FROM conversations WHERE id=?")
    .bind(conversationId).first<{whatsapp_instance_id:string|null;contact_phone:string|null}>();
  if (conversation?.whatsapp_instance_id) return sendUazapiText(env,conversation.whatsapp_instance_id,conversation.contact_phone ?? phone,body,fetcher);
  return sendWhatsAppText(env,phone,body,fetcher);
}

async function storeAndSendReply(env: ConversationWorkerEnv,input: {
  conversation:ConversationRow;phone:string;reply:AgentResult;token:string;
},metaFetcher?:MetaFetcher) {
  const permission = await env.DB.prepare("SELECT mode,claimed_by,agent_processing_token FROM conversations WHERE id=?")
    .bind(input.conversation.id).first<{ mode:string;claimed_by:string|null;agent_processing_token:string|null }>();
  const maySend = permission?.agent_processing_token === input.token
    && !permission.claimed_by
    && (input.reply.handoff ? permission.mode === "HUMAN" : permission.mode === "AGENT");
  if (!maySend) {
    await env.DB.prepare("UPDATE conversations SET agent_processing_token=NULL,agent_processing_started_at=NULL,updated_at=? WHERE id=? AND agent_processing_token=?")
      .bind(new Date().toISOString(),input.conversation.id,input.token).run();
    return { sent:false as const,paused:true };
  }

  const messageId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO messages (id,conversation_id,direction,type,body,status,payload_json,request_id,created_at)
    VALUES (?,?,'OUT','text',?,'SENDING',?,?,?)`)
    .bind(messageId,input.conversation.id,input.reply.reply,JSON.stringify({ source:"agent",confidence:input.reply.confidence,handoff:input.reply.handoff,reason:input.reply.reason }),input.conversation.request_id,startedAt).run();
  try {
    const response = await sendConversationText(env,input.conversation.id,input.phone,input.reply.reply,metaFetcher);
    const externalId = response.messages?.[0]?.id;
    if (!externalId) throw new Error("Meta did not return a message id");
    const acceptedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE messages SET external_id=?,status='ACCEPTED',accepted_at=? WHERE id=? AND status='SENDING'").bind(externalId,acceptedAt,messageId),
      env.DB.prepare("UPDATE conversations SET agent_processing_token=NULL,agent_processing_started_at=NULL,last_message_at=?,updated_at=? WHERE id=? AND agent_processing_token=?")
        .bind(acceptedAt,acceptedAt,input.conversation.id,input.token),
    ]);
    await reconcileUazapiReceipt(env,externalId);
    return { sent:true as const,externalId };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failure = errorMessage(error);
    await env.DB.batch([
      env.DB.prepare("UPDATE messages SET status='FAILED',last_error=?,failed_at=? WHERE id=? AND status='SENDING'").bind(failure,failedAt,messageId),
      env.DB.prepare("UPDATE conversations SET mode='HUMAN',human_active=1,agent_paused_at=coalesce(agent_paused_at,?),agent_error=?,agent_processing_token=NULL,agent_processing_started_at=NULL,updated_at=? WHERE id=? AND agent_processing_token=?")
        .bind(failedAt,failure,failedAt,input.conversation.id,input.token),
    ]);
    if (input.conversation.lead_id) {
      await env.DB.prepare("INSERT INTO activities (id,lead_id,type,title,body,created_at,updated_at) VALUES (?,?,'HANDOFF','Falha no envio do agente',?,?,?)")
        .bind(crypto.randomUUID(),input.conversation.lead_id,failure,failedAt,failedAt).run();
    }
    return { sent:false as const,error:failure };
  }
}

export async function processIncomingWhatsApp(env: ConversationWorkerEnv,externalId: string,dependencies: ProcessingDependencies = {},provider:"meta"|"uazapi" = "meta") {
  const stored = await env.DB.prepare("SELECT id,payload_json,processed_at,request_id FROM webhook_events WHERE provider=? AND external_id=?")
    .bind(provider,externalId).first<{ id:string;payload_json:string;processed_at:string|null;request_id:string|null }>();
  if (!stored || stored.processed_at) return { processed:false as const,duplicate:Boolean(stored?.processed_at) };
  const payload = JSON.parse(stored.payload_json) as { event:{ id:string;from:string;type:string;text?:{ body?:string } };lineId?:string } & Partial<UazapiIncoming>;
  const event = payload.event;
  const phone = event.from.replace(/\D/g,"");
  const lead = await env.DB.prepare("SELECT id FROM leads WHERE replace(normalized_phone,'+','')=?").bind(phone).first<{ id:string }>();
  const eventAt = event.createdAt ?? new Date().toISOString();
  const now = new Date().toISOString();
  const externalContactId = provider === "uazapi" ? `${payload.lineId}:${phone}` : phone;
  const isHistory = event.history === true;
  const outgoing = event.fromMe === true;
  const initialMode = provider === "uazapi" ? "HUMAN" : "AGENT";
  const text = event.text?.body?.trim() ?? "";
  // Upsert, message and processed marker are atomic; failed persistence remains retryable.
  const [,inserted] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO conversations (id,lead_id,channel,external_id,whatsapp_instance_id,contact_phone,contact_name,mode,human_active,last_message_at,request_id,created_at,updated_at)
      VALUES (?,?,'whatsapp',?,?,?,?,?,?,?, ?,?,?) ON CONFLICT(channel,external_id) DO UPDATE SET
      lead_id=coalesce(conversations.lead_id,excluded.lead_id),contact_name=coalesce(excluded.contact_name,conversations.contact_name),
      last_message_at=max(coalesce(conversations.last_message_at,''),excluded.last_message_at),request_id=excluded.request_id,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),lead?.id ?? null,externalContactId,payload.lineId ?? null,phone,event.contactName ?? null,initialMode,initialMode === "HUMAN" ? 1 : 0,eventAt,stored.request_id,eventAt,now),
    env.DB.prepare(`INSERT OR IGNORE INTO messages (id,conversation_id,external_id,direction,type,body,status,payload_json,request_id,created_at)
      SELECT ?,id,?,?,?,?,?,?,?,? FROM conversations WHERE channel='whatsapp' AND external_id=?`)
      .bind(crypto.randomUUID(),event.id,outgoing ? "OUT" : "IN",event.type,text || null,outgoing ? "SENT" : "RECEIVED",JSON.stringify(event),stored.request_id,eventAt,externalContactId),
    ...(outgoing && !isHistory ? [env.DB.prepare("UPDATE conversations SET mode='HUMAN',human_active=1,agent_paused_at=coalesce(agent_paused_at,?),updated_at=? WHERE channel='whatsapp' AND external_id=?")
      .bind(now,now,externalContactId)] : []),
    env.DB.prepare("UPDATE webhook_events SET processed_at=?,error=NULL WHERE id=?").bind(now,stored.id),
  ]);
  const duplicate = (inserted.meta.changes ?? 0) !== 1;
  const conversation = await env.DB.prepare("SELECT id,lead_id,mode,claimed_by,opted_out_at,request_id FROM conversations WHERE channel='whatsapp' AND external_id=?")
    .bind(externalContactId).first<ConversationRow>();
  if (!conversation) throw new Error("Conversation upsert failed");
  if (outgoing || isHistory) {
    if (outgoing) {
      await reconcileUazapiReceipt(env,event.id);
      if (!isHistory) await pauseConversationForHandoff(env,{conversationId:conversation.id,leadId:conversation.lead_id,reason:"Mensagem enviada pelo celular; atendimento humano em andamento"});
    }
    return { processed:true as const,answered:false,duplicate };
  }
  if (duplicate) return { processed:true as const,duplicate:true };
  if (!text) {
    await queueConversationSummary(env,conversation.id);
    return { processed:true as const,answered:false };
  }

  if (/^(sair|parar|cancelar mensagens|n[aã]o quero receber)$/i.test(text)) {
    await env.DB.prepare("UPDATE conversations SET mode='HUMAN',human_active=1,opted_out_at=coalesce(opted_out_at,?),agent_paused_at=coalesce(agent_paused_at,?),agent_processing_token=NULL,agent_processing_started_at=NULL,updated_at=? WHERE id=?")
      .bind(now,now,now,conversation.id).run();
    await queueConversationSummary(env,conversation.id);
    return { processed:true as const,optedOut:true };
  }
  if (conversation.mode !== "AGENT" || conversation.claimed_by || conversation.opted_out_at) {
    await markLeadInAttendance(env,conversation.lead_id,conversation.claimed_by,"Primeiro atendimento humano");
    await queueConversationSummary(env,conversation.id);
    return { processed:true as const,answered:false };
  }

  const token = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const claimed = await env.DB.prepare(`UPDATE conversations SET agent_processing_token=?,agent_processing_started_at=?,updated_at=? WHERE id=?
    AND mode='AGENT' AND claimed_by IS NULL AND opted_out_at IS NULL AND (agent_processing_token IS NULL OR agent_processing_started_at IS NULL OR agent_processing_started_at<=?)`)
    .bind(token,now,now,conversation.id,staleBefore).run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    await queueConversationSummary(env,conversation.id);
    return { processed:true as const,answered:false,busy:true };
  }
  await markLeadInAttendance(env,conversation.lead_id,null,"Primeiro atendimento do agente");

  let reply: AgentResult;
  if (requiresImmediateHandoff(text)) {
    reply = { reply:"Entendi. Vou transferir seu atendimento para uma pessoa da equipe New Wed.",confidence:1,handoff:true,reason:"Intenção sensível detectada pela política local" };
  } else {
    try {
      reply = await answerWithAgent(env,{ message:text,leadId:conversation.lead_id,conversationId:conversation.id },dependencies.openaiFetcher);
    } catch (error) {
      const failure = errorMessage(error);
      await pauseConversationForHandoff(env,{ conversationId:conversation.id,leadId:conversation.lead_id,reason:"Falha no agente; atendimento encaminhado ao humano",error:failure,processingToken:token });
      await env.DB.prepare("UPDATE conversations SET agent_processing_token=NULL,agent_processing_started_at=NULL,updated_at=? WHERE id=? AND agent_processing_token=?")
        .bind(new Date().toISOString(),conversation.id,token).run();
      await queueConversationSummary(env,conversation.id);
      return { processed:true as const,answered:false,handoff:true,error:failure };
    }
  }
  if (reply.handoff) {
    await pauseConversationForHandoff(env,{ conversationId:conversation.id,leadId:conversation.lead_id,reason:reply.reason || "Handoff solicitado pelo agente",processingToken:token });
  }
  const result = await storeAndSendReply(env,{ conversation,phone,reply,token },provider === "uazapi" ? dependencies.uazapiFetcher : dependencies.metaFetcher);
  await queueConversationSummary(env,conversation.id);
  return { processed:true as const,answered:result.sent,handoff:reply.handoff };
}

export async function processManualConversationMessage(env: ConversationWorkerEnv,messageId: string,metaFetcher?:MetaFetcher) {
  const claimed = await env.DB.prepare(`UPDATE messages SET status='SENDING' WHERE id=? AND status='SEND_PENDING' AND EXISTS (
    SELECT 1 FROM conversations c WHERE c.id=messages.conversation_id AND c.mode='HUMAN' AND c.claimed_by=messages.actor_id
      AND c.agent_processing_token IS NULL AND c.opted_out_at IS NULL)`)
    .bind(messageId).run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare("SELECT status FROM messages WHERE id=?").bind(messageId).first<{ status:string }>();
    if (existing && ["ACCEPTED","DELIVERED","READ"].includes(existing.status)) return { sent:true as const,idempotent:true };
    if (existing?.status === "SEND_PENDING") {
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE messages SET status='FAILED',last_error='A conversa não está disponível para resposta humana.',failed_at=? WHERE id=? AND status='SEND_PENDING'")
        .bind(now,messageId).run();
    }
    return { sent:false as const };
  }
  const message = await env.DB.prepare(`SELECT m.body,m.conversation_id,c.external_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND m.status='SENDING'`)
    .bind(messageId).first<{ body:string;conversation_id:string;external_id:string }>();
  if (!message) return { sent:false as const };
  try {
    const response = await sendConversationText(env,message.conversation_id,message.external_id,message.body,metaFetcher);
    const externalId = response.messages?.[0]?.id;
    if (!externalId) throw new Error("Meta did not return a message id");
    const acceptedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE messages SET external_id=?,status='ACCEPTED',accepted_at=? WHERE id=? AND status='SENDING'").bind(externalId,acceptedAt,messageId),
      env.DB.prepare("UPDATE conversations SET last_message_at=?,updated_at=? WHERE id=?").bind(acceptedAt,acceptedAt,message.conversation_id),
    ]);
    await reconcileUazapiReceipt(env,externalId);
    await queueConversationSummary(env,message.conversation_id);
    return { sent:true as const,externalId };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failure = errorMessage(error);
    await env.DB.prepare("UPDATE messages SET status='FAILED',last_error=?,failed_at=? WHERE id=? AND status='SENDING'")
      .bind(failure,failedAt,messageId).run();
    return { sent:false as const,error:failure };
  }
}

export async function processConversationSummary(env: ConversationWorkerEnv,conversationId: string,targetCount: number,fetcher?:OpenAIFetcher) {
  return summarizeConversation(env,conversationId,targetCount,fetcher);
}
