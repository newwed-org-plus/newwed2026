export async function acquireLease(env:Pick<Env,"DB">,id:string,seconds=120) {
  const token=crypto.randomUUID();
  const now=new Date().toISOString();
  const lease=await env.DB.prepare(`INSERT INTO operation_leases (id,token,expires_at) VALUES (?,?,?)
    ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<=? RETURNING token`)
    .bind(id,token,new Date(Date.now()+seconds*1000).toISOString(),now).first<{token:string}>();
  return lease?.token===token ? token : null;
}

export async function releaseLease(env:Pick<Env,"DB">,id:string,token:string) {
  await env.DB.prepare("DELETE FROM operation_leases WHERE id=? AND token=?").bind(id,token).run();
}
