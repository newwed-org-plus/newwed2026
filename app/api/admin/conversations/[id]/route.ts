import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,HttpError,json } from "@/server/http";

export async function GET(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  try {
    await requireAccessUser(request);
    const { id } = await params;
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100),1),100);
    const conversation = await env.DB.prepare(`SELECT c.id,c.whatsapp_instance_id,c.contact_phone,c.contact_name,wi.name AS line_name,c.channel,c.external_id,c.mode,c.claimed_by,c.claimed_at,c.released_at,c.agent_paused_at,c.agent_error,c.summary,
      c.summarized_message_count,c.summary_updated_at,c.last_message_at,c.opted_out_at,c.created_at,c.updated_at,
      l.id AS lead_id,l.name AS lead_name,l.email AS lead_email,l.phone AS lead_phone,l.company,l.city_state,l.stage AS lead_stage,e.name AS edition_name,u.name AS claimed_by_name
      FROM conversations c LEFT JOIN whatsapp_instances wi ON wi.id=c.whatsapp_instance_id LEFT JOIN leads l ON l.id=c.lead_id LEFT JOIN editions e ON e.id=l.edition_id LEFT JOIN users u ON u.id=c.claimed_by WHERE c.id=?`)
      .bind(id).first<Record<string,unknown>>();
    if (!conversation) throw new HttpError(404,"CONVERSATION_NOT_FOUND","Conversa não encontrada.");
    const messages = await env.DB.prepare(`SELECT m.id,m.external_id,m.direction,m.type,m.body,m.status,m.actor_id,m.last_error,m.accepted_at,m.failed_at,m.created_at,u.name AS actor_name
      FROM messages m LEFT JOIN users u ON u.id=m.actor_id WHERE m.conversation_id=? AND (? IS NULL OR m.created_at<?)
      ORDER BY m.created_at DESC LIMIT ?`).bind(id,before,before,limit + 1).all<Record<string,unknown>>();
    const page = messages.results.slice(0,limit);
    return json({ conversation,messages:page.reverse(),nextCursor:messages.results.length > limit ? String(page[0]?.created_at) : null });
  } catch (error) { return errorResponse(error); }
}
