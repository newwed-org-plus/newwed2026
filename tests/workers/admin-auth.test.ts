import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "../../app/api/auth/login/route";
import { POST as logout } from "../../app/api/auth/logout/route";
import { GET as me } from "../../app/api/admin/me/route";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { requireAccessUser } from "@/server/auth/access";
import { sha256 } from "@/server/normalization";

const origin = "https://newwed.test";
const email = "admin@example.test";
const password = "Synthetic-test-password!";
let passwordHash: string;
beforeAll(async () => { passwordHash = await hashPassword(password); });
beforeEach(() => { env.ALLOW_LOCAL_ACCESS = "false"; });
afterEach(() => { env.ALLOW_LOCAL_ACCESS = "true" as Env["ALLOW_LOCAL_ACCESS"]; });

async function seed() {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,email,name,active,created_at,updated_at) VALUES ('password-admin',?,'Admin teste',1,?,?)").bind(email, now, now),
    env.DB.prepare("INSERT INTO roles (id,user_id,role,created_at) VALUES ('password-admin-role','password-admin','admin',?)").bind(now),
    env.DB.prepare("INSERT INTO admin_credentials (user_id,password_hash,updated_at) VALUES ('password-admin',?,?)").bind(passwordHash, now),
  ]);
}

function loginRequest(body: unknown = { email, password }, extra: Record<string, string> = {}) {
  return new Request(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1", ...extra }, body: JSON.stringify(body) });
}

async function signedIn() {
  const response = await login(loginRequest());
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

describe("login administrativo com senha no runtime Workers e D1", () => {
  it("persiste limite por identidade no Durable Object e isola outras identidades", async () => {
    const blocked = env.ADMIN_PASSWORD_VERIFIER.getByName("synthetic-limited-account");
    for (let index = 0; index < 30; index++) expect(await blocked.verify("wrong", "malformed")).toEqual({ limited: false, valid: false });
    expect(await blocked.verify(password, passwordHash)).toEqual({ limited: true, valid: false });
    const other = env.ADMIN_PASSWORD_VERIFIER.getByName("synthetic-independent-account");
    expect(await other.verify(password, passwordHash)).toEqual({ limited: false, valid: true });
  });
  it("limita IP no Durable Object sem gravar buckets no D1",async()=>{
    const first=env.ADMIN_IP_LIMITER.getByName("synthetic-ip-one");
    for(let i=0;i<10;i++)expect((await first.consume()).limited).toBe(false);
    expect((await first.consume()).limited).toBe(true);
    expect((await env.ADMIN_IP_LIMITER.getByName("synthetic-ip-two").consume()).limited).toBe(false);
    expect(await env.DB.prepare("SELECT count(*) AS total FROM rate_limit_buckets").first()).toEqual({total:0});
  });
  it("usa scrypt compatível com workerd e rejeita senha errada e hash malformado", async () => {
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("wrong", passwordHash)).toBe(false);
    expect(await verifyPassword(password, "invalid")).toBe(false);
    expect(await hashPassword(password)).not.toBe(passwordHash);
  });

  it("autentica sem Access, mantém apenas hash do token e preserva papéis", async () => {
    await seed();
    const response = await login(loginRequest({ email: email.toUpperCase(), password }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly; SameSite=Strict; Max-Age=28800");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const token = cookie.split(";")[0].split("=")[1];
    const session = await env.DB.prepare("SELECT token_hash FROM admin_sessions").first<{ token_hash: string }>();
    expect(session?.token_hash).toBe(await sha256(token));
    expect(session?.token_hash).not.toBe(token);
    const user = await me(new Request(`${origin}/api/admin/me`, { headers: { cookie: cookie.split(";")[0] } }));
    expect(user.status).toBe(200);
    expect(await user.json()).toMatchObject({ id: "password-admin", roles: ["admin"] });
  });

  it("não revela se e-mail existe e não cria sessão em falhas", async () => {
    await seed();
    const wrong = await login(loginRequest({ email, password: "wrong" }));
    const unknown = await login(loginRequest({ email: "unknown@example.test", password }));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_sessions").first()).toEqual({ n: 0 });
  });

  it("bloqueia usuário desativado e revoga sessão imediatamente no logout", async () => {
    await seed();
    const cookie = await signedIn();
    const request = new Request(`${origin}/api/admin/me`, { headers: { cookie } });
    await env.DB.prepare("UPDATE users SET active=0 WHERE id='password-admin'").run();
    expect((await me(request)).status).toBe(401);
    expect((await login(loginRequest())).status).toBe(401);
    await env.DB.prepare("UPDATE users SET active=1 WHERE id='password-admin'").run();
    const response = await logout(new Request(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie, origin } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await me(request)).status).toBe(401);
  });

  it("rejeita sessão expirada, token inventado e respeita alteração de papéis", async () => {
    await seed();
    const cookie = await signedIn();
    const request = new Request(`${origin}/api/admin/me`, { headers: { cookie } });
    await env.DB.prepare("UPDATE roles SET role='vendedor' WHERE user_id='password-admin'").run();
    await expect(requireAccessUser(request, ["admin"])).rejects.toMatchObject({ status: 403 });
    await env.DB.prepare("UPDATE admin_sessions SET expires_at='2000-01-01T00:00:00Z'").run();
    expect((await me(request)).status).toBe(401);
    expect((await me(new Request(`${origin}/api/admin/me`, { headers: { cookie: `newwed_admin_session=${"a".repeat(64)}` } }))).status).toBe(401);
  });

  it("rejeita CSRF no login, logout e APIs autenticadas que alteram dados", async () => {
    await seed();
    const cookie = await signedIn();
    expect((await login(loginRequest(undefined, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await logout(new Request(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie } }))).status).toBe(403);
    await expect(requireAccessUser(new Request(`${origin}/api/admin/leads`, { method: "POST", headers: { cookie, origin: "https://evil.test" } })))
      .rejects.toMatchObject({ status: 403, code: "INVALID_ORIGIN" });
    await expect(requireAccessUser(new Request(`${origin}/api/admin/leads`, { method: "POST", headers: { cookie, origin } }), ["admin"]))
      .resolves.toMatchObject({ roles: ["admin"] });
  });

  it("limita tentativas por IP antes da derivação e rejeita payload grande", async () => {
    for (let index = 0; index < 10; index++) expect((await login(loginRequest({}))).status).toBe(422);
    expect((await login(loginRequest())).status).toBe(429);
    const large = await login(loginRequest({ email, password: "a".repeat(3000) }, { "cf-connecting-ip": "192.0.2.2" }));
    expect(large.status).toBe(413);
  });
});
