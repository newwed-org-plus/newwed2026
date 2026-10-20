import { env } from "cloudflare:workers";
import { conversationModeSchema } from "@/features/conversations/model";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,json } from "@/server/http";

export async function GET(request: Request) {
  try {
    await requireAccessUser(request);
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0,120) ?? "";
    const modeValue = url.searchParams.get("mode")?.trim();
    const mode = modeValue ? conversationModeSchema.parse(modeValue) : null;
    const failure = url.searchParams.get("failure") === "true";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50),1),100);
    const cursor = url.searchParams.get("cursor");
    const rows = await env.DB.prepare(`SELECT c.id,c.whatsapp_instance_id,c.contact_phone,c.contact_name,wi.name AS line_name,c.channel,c.external_id,c.mode,c.claimed_by,c.claimed_at,c.released_at,c.agent_paused_at,c.agent_error,
      c.last_message_at,c.opted_out_at,c.updated_at,l.id AS lead_id,l.name AS lead_name,l.stage AS lead_stage,e.name AS edition_name,u.name AS claimed_by_name,
      (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT direction FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_direction,
      (SELECT status FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_status
      FROM conversations c LEFT JOIN whatsapp_instances wi ON wi.id=c.whatsapp_instance_id LEFT JOIN leads l ON l.id=c.lead_id LEFT JOIN editions e ON e.id=l.edition_id LEFT JOIN users u ON u.id=c.claimed_by
      WHERE (? IS NULL OR c.mode=?) AND (?=0 OR c.agent_error IS NOT NULL OR EXISTS (SELECT 1 FROM messages fm WHERE fm.conversation_id=c.id AND fm.status='FAILED'))
      AND (?='' OR l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR c.external_id LIKE ? OR c.contact_name LIKE ?)
      AND (? IS NULL OR coalesce(c.last_message_at,c.updated_at)<?)
      ORDER BY coalesce(c.last_message_at,c.updated_at) DESC LIMIT ?`)
      .bind(mode,mode,failure ? 1 : 0,q,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,cursor,cursor,limit + 1).all<Record<string,unknown>>();
    const items = rows.results.slice(0,limit);
    return json({ items,nextCursor:rows.results.length > limit ? String(items.at(-1)?.last_message_at ?? items.at(-1)?.updated_at) : null });
  } catch (error) { return errorResponse(error); }
}
