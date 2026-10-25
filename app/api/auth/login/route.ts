import { env } from "cloudflare:workers";
import { z } from "zod";
import { sha256 } from "@/server/normalization";
import { createSession, requireSameOrigin, sessionCookie } from "@/server/auth/session";
import { errorResponse, HttpError, json } from "@/server/http";
import { clientIp } from "@/server/rate-limit";
import { readJsonWithLimit } from "@/server/request-context";

const input = z.object({ email: z.email().max(254).transform(value => value.trim().toLowerCase()), password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "INVALID_CONTENT_TYPE", "Envie os dados em JSON.");
    const limit = await env.ADMIN_IP_LIMITER.getByName(await sha256(clientIp(request))).consume();
    if (limit.limited) return json({code:"RATE_LIMITED",message:"Limite de tentativas atingido. Tente novamente em 15 minutos."},{status:429,headers:{"retry-after":String(limit.retryAfter)}});
    const credentials = input.parse(await readJsonWithLimit(request, 2048));
    const user = await env.DB.prepare(`SELECT u.id,c.password_hash FROM users u JOIN admin_credentials c ON c.user_id=u.id
      WHERE lower(u.email)=? AND u.active=1 AND EXISTS (SELECT 1 FROM roles WHERE user_id=u.id)`).bind(credentials.email)
      .first<{ id: string; password_hash: string }>();
    const verifier = env.ADMIN_PASSWORD_VERIFIER.getByName(await sha256(credentials.email));
    const { valid, limited } = await verifier.verify(credentials.password, user?.password_hash ?? null);
    if (limited) throw new HttpError(429, "RATE_LIMITED", "Limite de tentativas atingido. Tente novamente em 15 minutos.");
    if (!valid || !user) throw new HttpError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
    const token = await createSession(user.id);
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) { return errorResponse(error); }
}
