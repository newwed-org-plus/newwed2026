import {env} from 'cloudflare:workers';
import {destinosEbook} from '@/content/destinos-ebook';
import {ebookLeadSchema} from '@/features/leads/ebook-schema';
import {requireCapability} from '@/server/capabilities';
import {errorResponse, HttpError, json} from '@/server/http';
import {verifyTurnstile} from '@/server/integrations/turnstile';
import {normalizeEmail, normalizePhone, sha256} from '@/server/normalization';
import {clientIp, enforceRateLimit} from '@/server/rate-limit';
import {readJsonWithLimit, requestIdFrom, responseWithRequestId} from '@/server/request-context';

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireCapability(env, 'publicLeads');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'INVALID_ORIGIN', 'Origem não permitida.');
    await enforceRateLimit(env, {scope: 'public.ebook', identity: clientIp(request), limit: 5, windowSeconds: 60});
    const input = ebookLeadSchema.parse(await readJsonWithLimit(request, 8192));
    await verifyTurnstile(input.turnstileToken, request.headers.get('cf-connecting-ip'));
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.telefone);
    const dedupeKey = await sha256(`${email}|${phone}`);
    const captureKey = await sha256(`${destinosEbook.id}|${dedupeKey}`);
    const now = new Date().toISOString();
    const leadId = crypto.randomUUID();
    const source = 'ebook-destinos';
    const landingUrl = `${new URL(request.url).origin}/destinos`;
    // A captura não altera cadastro/edição/etapa de um lead existente e não cria outbox.
    // As chaves determinísticas impedem duplicação até em requisições simultâneas.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO leads
        (id,name,email,normalized_email,phone,normalized_phone,company,stage,consent_version,consent_at,source_system,dedupe_key,request_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'NOVO',?,?,'ebook',?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`)
        .bind(leadId,input.nome,input.email,email,input.telefone,phone,input.empresa,destinosEbook.consentVersion,now,dedupeKey,requestId,now,now),
      env.DB.prepare(`INSERT INTO lead_answers (id,lead_id,answers_json,created_at)
        SELECT ?,id,?,? FROM leads WHERE dedupe_key=? ON CONFLICT(id) DO NOTHING`)
        .bind(`ebook:${captureKey}`,JSON.stringify({origem: source, ebook: destinosEbook.title, nome: input.nome, empresa: input.empresa, email: input.email, telefone: input.telefone, consent: input.consent, finalidade: 'Receber o e-book solicitado', requestedAt: now}),now,dedupeKey),
      env.DB.prepare(`INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at)
        SELECT ?,id,NULL,'NOVO',NULL,?,? FROM leads WHERE id=? ON CONFLICT(id) DO NOTHING`)
        .bind(`ebook-history:${captureKey}`,`Solicitação de e-book: ${destinosEbook.title}`,now,leadId),
      env.DB.prepare(`INSERT INTO lead_attribution (id,lead_id,touch_type,landing_url,utm_source,utm_campaign,created_at)
        SELECT ?,id,'FIRST',?,?,?,? FROM leads WHERE dedupe_key=? ON CONFLICT(lead_id,touch_type) DO NOTHING`)
        .bind(`ebook-first:${captureKey}`,landingUrl,source,destinosEbook.id,now,dedupeKey),
      env.DB.prepare(`INSERT INTO lead_attribution (id,lead_id,touch_type,landing_url,utm_source,utm_campaign,created_at)
        SELECT ?,id,'LAST',?,?,?,? FROM leads WHERE dedupe_key=? ON CONFLICT(lead_id,touch_type) DO NOTHING`)
        .bind(`ebook-last:${captureKey}`,landingUrl,source,destinosEbook.id,now,dedupeKey),
    ]);
    return responseWithRequestId(json({accepted: true, downloadUrl: destinosEbook.downloadUrl}), requestId);
  } catch (error) {
    return responseWithRequestId(errorResponse(error, requestId), requestId);
  }
}
