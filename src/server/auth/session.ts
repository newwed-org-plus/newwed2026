import { env } from "cloudflare:workers";
import { HttpError } from "@/server/http";
import { sha256 } from "@/server/normalization";

export const sessionSeconds = 8 * 60 * 60;

function cookieName() {
  return env.ENVIRONMENT === "development" ? "newwed_admin_session" : "__Host-newwed_admin_session";
}

export function sessionToken(request: Request) {
  const name = cookieName();
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim());
  const token = cookies.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export function sessionCookie(token: string, maxAge = sessionSeconds) {
  const secure = env.ENVIRONMENT === "development" ? "" : "; Secure";
  return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "INVALID_ORIGIN", "Solicitação de origem não permitida.");
  }
}

export async function sessionEmail(request: Request) {
  const token = sessionToken(request);
  if (!token) return undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) requireSameOrigin(request);
  const session = await env.DB.prepare(`SELECT u.email FROM admin_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`)
    .bind(await sha256(token), new Date().toISOString()).first<{ email: string }>();
  if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
  return session.email;
}

export async function createSession(userId: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, "0")).join("");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionSeconds * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at<=?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO admin_sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
      .bind(await sha256(token), userId, expiresAt, now.toISOString()),
  ]);
  return token;
}

export async function revokeSession(request: Request) {
  requireSameOrigin(request);
  const token = sessionToken(request);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?").bind(await sha256(token)).run();
}
