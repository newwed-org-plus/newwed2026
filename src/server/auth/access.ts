import { env } from "cloudflare:workers";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { HttpError } from "@/server/http";
import { sessionEmail } from "@/server/auth/session";

export type AppRole = "admin" | "gestor" | "vendedor";
export type AccessUser = { id: string; email: string; name: string; roles: AppRole[] };

function accessConfiguration() {
  const raw = String(env.ACCESS_TEAM_DOMAIN || "").trim();
  const audience = String(env.ACCESS_AUD || "").trim();
  if (!raw || !audience) throw new HttpError(503, "ACCESS_NOT_CONFIGURED", "Cloudflare Access ainda não foi configurado.");
  const issuer = raw.startsWith("https://") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
  return { issuer, audience };
}

export async function requireAccessUser(request: Request, allowed?: readonly AppRole[]): Promise<AccessUser> {
  let email: string | undefined;
  if (env.ENVIRONMENT === "development" && String(env.ALLOW_LOCAL_ACCESS) === "true") {
    email = request.headers.get("x-dev-access-email") ?? "admin@newwed.local";
  } else if (!(email = await sessionEmail(request))) {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Acesso não autenticado.");
    const { issuer, audience } = accessConfiguration();
    const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    try {
      const verified = await jwtVerify(token, jwks, { issuer, audience });
      email = typeof verified.payload.email === "string" ? verified.payload.email : undefined;
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        throw new HttpError(401, "UNAUTHENTICATED", "Sessão inválida ou expirada. Entre novamente.");
      }
      throw error;
    }
  }
  if (!email) throw new HttpError(401, "IDENTITY_MISSING", "Identidade não encontrada.");

  let user = await env.DB.prepare("SELECT id,email,name FROM users WHERE lower(email)=lower(?) AND active=1")
    .bind(email).first<{ id: string; email: string; name: string }>();
  if (!user && env.ENVIRONMENT === "development" && String(env.ALLOW_LOCAL_ACCESS) === "true") {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,email,name,active,created_at,updated_at) VALUES (?,?,?,1,?,?)").bind(id,email,"Administrador local",now,now),
      env.DB.prepare("INSERT INTO roles (id,user_id,role,created_at) VALUES (?,?,'admin',?)").bind(crypto.randomUUID(),id,now),
    ]);
    user = { id, email, name: "Administrador local" };
  }
  if (!user) throw new HttpError(403, "USER_NOT_PROVISIONED", "Usuário não provisionado no dashboard.");
  const roleRows = await env.DB.prepare("SELECT role FROM roles WHERE user_id=?").bind(user.id).all<{ role: AppRole }>();
  const roles = roleRows.results.map((row) => row.role).filter(role => ["admin", "gestor", "vendedor"].includes(role));
  if (!roles.length || (allowed && !allowed.some((role) => roles.includes(role)))) {
    throw new HttpError(403, "FORBIDDEN", "Você não tem permissão para esta operação.");
  }
  return { ...user, roles };
}
