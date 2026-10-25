import { DurableObject } from "cloudflare:workers";

// One object per hashed IP. No raw address or password is stored here.
export class AdminIpLimiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS bucket (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL, started_at INTEGER NOT NULL)");
  }

  consume(): { limited: boolean; retryAfter: number } {
    const now = Date.now();
    const row = this.ctx.storage.sql.exec<{ count:number;started_at:number }>(`INSERT INTO bucket VALUES (1,1,?)
      ON CONFLICT(id) DO UPDATE SET count=CASE WHEN started_at<=? THEN 1 ELSE count+1 END,
      started_at=CASE WHEN started_at<=? THEN excluded.started_at ELSE started_at END RETURNING count,started_at`,now,now-900_000,now-900_000).one();
    return {limited:row.count>10,retryAfter:Math.max(1,Math.ceil((row.started_at+900_000-now)/1000))};
  }
}
