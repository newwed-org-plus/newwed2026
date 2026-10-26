import { env } from "cloudflare:workers";
import { leadPatchSchema } from "@/features/leads/schemas";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse, HttpError, json } from "@/server/http";
import { normalizeEmail, normalizePhone, sha256 } from "@/server/normalization";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAccessUser(request);
    const { id } = await params;
    const lead = await env.DB.prepare("SELECT l.*,e.name AS edition_name FROM leads l LEFT JOIN editions e ON e.id=l.edition_id WHERE l.id=?").bind(id).first();
    if (!lead) throw new HttpError(404, "LEAD_NOT_FOUND", "Lead não encontrado.");
    const [answers, history, activities, conversations, checkouts] = await Promise.all([
      env.DB.prepare("SELECT * FROM lead_answers WHERE lead_id=? ORDER BY created_at DESC").bind(id).all(),
      env.DB.prepare("SELECT * FROM pipeline_history WHERE lead_id=? ORDER BY created_at DESC").bind(id).all(),
      env.DB.prepare("SELECT a.*,u.name AS assignee_name FROM activities a LEFT JOIN users u ON u.id=a.assigned_to WHERE a.lead_id=? ORDER BY a.completed_at IS NOT NULL,a.due_at IS NULL,a.due_at,a.created_at DESC").bind(id).all(),
      env.DB.prepare("SELECT * FROM conversations WHERE lead_id=? ORDER BY updated_at DESC").bind(id).all(),
      env.DB.prepare("SELECT c.*,(SELECT status FROM messages WHERE id='confirmation:'||c.id) AS confirmation_status FROM checkouts c WHERE lead_id=? ORDER BY created_at DESC").bind(id).all(),
    ]);
    return json({ lead, answers: answers.results, history: history.results, activities: activities.results, conversations: conversations.results, checkouts: checkouts.results.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=="billing_document_ciphertext"))) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAccessUser(request);
    const { id } = await params;
    const input = leadPatchSchema.parse(await request.json());
    const before = await env.DB.prepare("SELECT * FROM leads WHERE id=?").bind(id).first<Record<string, unknown>>();
    if (!before) throw new HttpError(404, "LEAD_NOT_FOUND", "Lead não encontrado.");
    const email = input.email ? normalizeEmail(input.email) : String(before.normalized_email);
    const phone = input.phone ? normalizePhone(input.phone) : String(before.normalized_phone);
    const dedupeKey = await sha256(`${email}|${phone}`);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE leads SET name=coalesce(?,name),email=coalesce(?,email),normalized_email=?,phone=coalesce(?,phone),normalized_phone=?,instagram=coalesce(?,instagram),company=coalesce(?,company),city_state=coalesce(?,city_state),dedupe_key=?,updated_at=? WHERE id=?`)
        .bind(input.name ?? null,input.email ?? null,email,input.phone ?? null,phone,input.instagram ?? null,input.company ?? null,input.cityState ?? null,dedupeKey,now,id),
      env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,before_json,after_json,ip,created_at) VALUES (?,?,'lead.update','lead',?,?,?,?,?)")
        .bind(crypto.randomUUID(),actor.id,id,JSON.stringify(before),JSON.stringify(input),request.headers.get("cf-connecting-ip"),now),
    ]);
    return json({ id, updatedAt: now });
  } catch (error) { return errorResponse(error); }
}
