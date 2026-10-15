import { DurableObject } from "cloudflare:workers";
import { hashPassword, verifyPassword } from "./password";

// One object per hashed identity: durable account throttling and enough CPU for scrypt
// on Workers Free. Only the private binding exposes this RPC, never an HTTP route.
export class AdminPasswordVerifier extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL, started_at INTEGER NOT NULL)");
  }

  async verify(password: string, passwordHash: string | null): Promise<{ limited: boolean; valid: boolean }> {
    if (password.length > 256) return { limited: false, valid: false };
    const now = Date.now();
    const row = this.ctx.storage.sql.exec<{ count: number }>(`INSERT INTO attempts (id,count,started_at) VALUES (1,1,?)
      ON CONFLICT(id) DO UPDATE SET count=CASE WHEN started_at<=? THEN 1 ELSE count+1 END,
      started_at=CASE WHEN started_at<=? THEN excluded.started_at ELSE started_at END RETURNING count`, now, now - 900_000, now - 900_000).one();
    if (row.count > 30) return { limited: true, valid: false };
    // Equal derivation cost for unknown identities without persisting credentials here.
    const valid = passwordHash ? await verifyPassword(password, passwordHash) : (await hashPassword(password), false);
    return { limited: false, valid };
  }
}
