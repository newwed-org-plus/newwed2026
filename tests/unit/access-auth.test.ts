import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const state = vi.hoisted(() => ({
  ENVIRONMENT: "production", ALLOW_LOCAL_ACCESS: "false", ACCESS_TEAM_DOMAIN: "access-test.cloudflareaccess.com", ACCESS_AUD: "test-admin-audience",
  DB: { prepare: vi.fn() },
}));
vi.mock("cloudflare:workers", () => ({ env: state }));
import { requireAccessUser } from "@/server/auth/access";
import { sessionCookie, sessionToken } from "@/server/auth/session";

const issuer = "https://access-test.cloudflareaccess.com";
let privateKey: CryptoKey;
let jwk: Awaited<ReturnType<typeof exportJWK>>;
const currentUser = { id: "test-admin", email: "admin@example.test", name: "Administrador de teste" };

beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  jwk = { ...await exportJWK(keys.publicKey), kid: "access-test-key", alg: "RS256", use: "sig" };
});
beforeEach(() => {
  vi.unstubAllGlobals();
  state.ENVIRONMENT = "production";
  state.ALLOW_LOCAL_ACCESS = "false";
  state.ACCESS_TEAM_DOMAIN = "access-test.cloudflareaccess.com";
  state.ACCESS_AUD = "test-admin-audience";
  state.DB.prepare.mockReset().mockImplementation((sql: string) => ({
    bind: vi.fn().mockReturnValue(sql.includes("FROM users")
      ? { first: vi.fn().mockResolvedValue(currentUser) }
      : { all: vi.fn().mockResolvedValue({ results: [{ role: "admin" }] }) }),
  }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } })));
});

async function requestWithToken(options: { audience?: string; tokenIssuer?: string; email?: string | null; expires?: string } = {}) {
  const payload = options.email === null ? {} : { email: options.email ?? currentUser.email };
  const token = await new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "access-test-key" })
    .setIssuer(options.tokenIssuer ?? issuer).setAudience(options.audience ?? state.ACCESS_AUD)
    .setSubject("synthetic-user").setIssuedAt().setExpirationTime(options.expires ?? "5m").sign(privateKey);
  return new Request("https://newwed.test/api/admin/me", { headers: { "cf-access-jwt-assertion": token } });
}

describe("autenticação administrativa Cloudflare Access", () => {
  it("protege o cookie de produção com Secure, HttpOnly, SameSite e prefixo Host", () => {
    expect(sessionCookie("a".repeat(64))).toBe(`__Host-newwed_admin_session=${"a".repeat(64)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure`);
    expect(sessionCookie("", 0)).toContain("Max-Age=0; Secure");
    expect(sessionCookie("a")).not.toContain("Domain=");
    expect(sessionToken(new Request("https://newwed.test", { headers: { cookie: `newwed_admin_session=${"a".repeat(64)}` } }))).toBeUndefined();
  });
  it("exige JWT em produção mesmo se o bypass local estiver habilitado", async () => {
    state.ALLOW_LOCAL_ACCESS = "true";
    await expect(requireAccessUser(new Request("https://newwed.test/api/admin/me", { headers: { "x-dev-access-email": currentUser.email } })))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(state.DB.prepare).not.toHaveBeenCalled();
  });
  it("rejeita configuração incompleta sem consultar o banco", async () => {
    state.ACCESS_AUD = "";
    await expect(requireAccessUser(await requestWithToken())).rejects.toMatchObject({ status: 503, code: "ACCESS_NOT_CONFIGURED" });
    expect(state.DB.prepare).not.toHaveBeenCalled();
  });
  it("aceita somente identidade assinada e usuário ativo provisionado", async () => {
    await expect(requireAccessUser(await requestWithToken(), ["admin"])).resolves.toEqual({ ...currentUser, roles: ["admin"] });
    expect(state.DB.prepare.mock.calls[0][0]).toContain("active=1");
  });
  it.each([
    { audience: "another-application" },
    { tokenIssuer: "https://another-team.cloudflareaccess.com" },
    { expires: "-1m" },
  ])("rejeita token de outra aplicação, emissor ou expirado: %o", async (options) => {
    await expect(requireAccessUser(await requestWithToken(options))).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(state.DB.prepare).not.toHaveBeenCalled();
  });
  it("rejeita token malformado sem consultar o banco", async () => {
    await expect(requireAccessUser(new Request("https://newwed.test/api/admin/me", { headers: { "cf-access-jwt-assertion": "invalid" } })))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(state.DB.prepare).not.toHaveBeenCalled();
  });
  it("não usa e-mail de cabeçalho como substituto da identidade assinada", async () => {
    const request = await requestWithToken({ email: null });
    request.headers.set("cf-access-authenticated-user-email", currentUser.email);
    await expect(requireAccessUser(request)).rejects.toMatchObject({ status: 401, code: "IDENTITY_MISSING" });
    expect(state.DB.prepare).not.toHaveBeenCalled();
  });
  it("bloqueia identidade válida sem cadastro ativo", async () => {
    state.DB.prepare.mockImplementation(() => ({ bind: () => ({ first: async () => null }) }));
    await expect(requireAccessUser(await requestWithToken())).rejects.toMatchObject({ status: 403, code: "USER_NOT_PROVISIONED" });
  });
  it("não concede permissões administrativas a vendedor", async () => {
    state.DB.prepare.mockImplementation((sql: string) => ({ bind: () => sql.includes("FROM users")
      ? { first: async () => currentUser } : { all: async () => ({ results: [{ role: "vendedor" }] }) } }));
    await expect(requireAccessUser(await requestWithToken(), ["admin"])).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
  it("bloqueia usuário ativo sem papel reconhecido mesmo em consultas gerais", async () => {
    state.DB.prepare.mockImplementation((sql: string) => ({ bind: () => sql.includes("FROM users")
      ? { first: async () => currentUser } : { all: async () => ({ results: [{ role: "unknown" }] }) } }));
    await expect(requireAccessUser(await requestWithToken())).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
