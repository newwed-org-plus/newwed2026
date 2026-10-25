import {requireCapability} from "@/server/capabilities";
import {publishOutbox} from "@/server/outbox";
import { env } from "cloudflare:workers";
import { publicLeadSchema } from "@/features/leads/schemas";
import { errorResponse, HttpError, json, requireIdempotencyKey } from "@/server/http";
import { normalizeEmail, normalizePhone, sha256 } from "@/server/normalization";
import { verifyTurnstile } from "@/server/integrations/turnstile";
import { clientIp,enforceRateLimit } from "@/server/rate-limit";
import { requestIdFrom,responseWithRequestId,readJsonWithLimit } from "@/server/request-context";

type StoredResponse = { leadId: string; stage: "NOVO"; duplicated: boolean };

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireCapability(env,"publicLeads");
    const idempotencyKey = requireIdempotencyKey(request);
    const prior = await env.DB.prepare("SELECT response_json FROM idempotency_keys WHERE key = ? AND scope = 'public_lead'")
      .bind(idempotencyKey).first<{ response_json: string }>();
    if (prior) return responseWithRequestId(json(JSON.parse(prior.response_json)),requestId);

    await enforceRateLimit(env,{scope:"public.lead",identity:clientIp(request),limit:5,windowSeconds:60});

    const input = publicLeadSchema.parse(await readJsonWithLimit(request,65536));
    await verifyTurnstile(input.turnstileToken, request.headers.get("cf-connecting-ip"));

    const normalizedEmail = normalizeEmail(input.email);
    const normalizedPhone = normalizePhone(input.telefone);
    const dedupeKey = await sha256(`${normalizedEmail}|${normalizedPhone}`);
    const existing = await env.DB.prepare("SELECT id, stage FROM leads WHERE dedupe_key = ?")
      .bind(dedupeKey).first<{ id: string; stage: string }>();
    const edition = await env.DB.prepare("SELECT id FROM editions WHERE slug = ? AND status = 'OPEN'")
      .bind(input.editionSlug).first<{ id: string }>();
    if (!edition) throw new HttpError(422, "EDITION_UNAVAILABLE", "Esta edição não está disponível.");

    const now = new Date().toISOString();
    const leadId = existing?.id ?? crypto.randomUUID();
    const answerId = crypto.randomUUID();
    const firstAttributionId = crypto.randomUUID();
    const lastAttributionId = crypto.randomUUID();
    const pipelineId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const responseBody: StoredResponse = { leadId, stage: "NOVO", duplicated: Boolean(existing) };
    const utm = input.utm;

    const statements = [
      env.DB.prepare(`INSERT INTO leads
        (id,name,email,normalized_email,phone,normalized_phone,instagram,company,city_state,edition_id,stage,consent_version,consent_at,source_system,external_id,dedupe_key,request_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'NOVO',?,?,'platform',NULL,?,?,?,?)
        ON CONFLICT(dedupe_key) DO UPDATE SET name=excluded.name,email=excluded.email,normalized_email=excluded.normalized_email,phone=excluded.phone,normalized_phone=excluded.normalized_phone,instagram=excluded.instagram,company=excluded.company,city_state=excluded.city_state,edition_id=excluded.edition_id,consent_version=excluded.consent_version,consent_at=excluded.consent_at,request_id=excluded.request_id,updated_at=excluded.updated_at`)
        .bind(leadId,input.nome,input.email,normalizedEmail,input.telefone,normalizedPhone,input.instagram ?? "",input.empresa,input.cidade_estado,edition.id,input.consent.version,now,dedupeKey,requestId,now,now),
      env.DB.prepare("INSERT INTO lead_answers (id,lead_id,answers_json,created_at) VALUES (?,?,?,?)")
        .bind(answerId,leadId,JSON.stringify(input.respostas_brutas),now),
      env.DB.prepare(`INSERT INTO lead_attribution
        (id,lead_id,touch_type,landing_url,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_at)
        VALUES (?,?,'FIRST',?,?,?,?,?,?,?,?) ON CONFLICT(lead_id,touch_type) DO NOTHING`)
        .bind(firstAttributionId,leadId,input.landingUrl,input.referrer ?? null,utm.utm_source ?? null,utm.utm_medium ?? null,utm.utm_campaign ?? null,utm.utm_content ?? null,utm.utm_term ?? null,now),
      env.DB.prepare(`INSERT INTO lead_attribution
        (id,lead_id,touch_type,landing_url,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_at)
        VALUES (?,?,'LAST',?,?,?,?,?,?,?,?) ON CONFLICT(lead_id,touch_type) DO UPDATE SET landing_url=excluded.landing_url,referrer=excluded.referrer,utm_source=excluded.utm_source,utm_medium=excluded.utm_medium,utm_campaign=excluded.utm_campaign,utm_content=excluded.utm_content,utm_term=excluded.utm_term,created_at=excluded.created_at`)
        .bind(lastAttributionId,leadId,input.landingUrl,input.referrer ?? null,utm.utm_source ?? null,utm.utm_medium ?? null,utm.utm_campaign ?? null,utm.utm_content ?? null,utm.utm_term ?? null,now),
      env.DB.prepare("INSERT INTO outbox_events (id,type,aggregate_id,payload_json,attempts,request_id,created_at) VALUES (?,'lead.submitted',?,?,0,?,?)")
        .bind(outboxId,leadId,JSON.stringify({ leadId, editionId: edition.id,requestId }),requestId,now),
      env.DB.prepare("INSERT INTO idempotency_keys (key,scope,resource_id,response_json,created_at) VALUES (?,'public_lead',?,?,?) ON CONFLICT(key) DO NOTHING")
        .bind(idempotencyKey,leadId,JSON.stringify(responseBody),now),
    ];
    if (!existing) {
      statements.splice(2, 0, env.DB.prepare("INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at) VALUES (?,?,NULL,'NOVO',NULL,'Pré-inscrição pública',?)").bind(pipelineId,leadId,now));
    }
    await env.DB.batch(statements);

    await publishOutbox(env,{id:outboxId,type:"lead.submitted",leadId,requestId});

    return responseWithRequestId(json(responseBody, { status: existing ? 200 : 201 }),requestId);
  } catch (error) {
    return responseWithRequestId(errorResponse(error,requestId),requestId);
  }
}
