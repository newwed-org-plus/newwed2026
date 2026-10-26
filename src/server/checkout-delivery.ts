import {checkoutStateSchema} from "@/features/billing/checkout-state";
export async function markCheckoutDelivered(env: Pick<Env,"DB">,checkoutId: string,actorId: string|null,reason: string) {
  const now = new Date().toISOString();
  const checkout = await env.DB.prepare("SELECT lead_id,status FROM checkouts WHERE id=?").bind(checkoutId).first<{ lead_id:string;status:string }>();
  if (!checkout) return { found:false as const };
  checkoutStateSchema.parse(checkout.status);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE checkouts SET status=CASE WHEN status IN ('SENT','FAILED','SEND_PENDING') THEN 'PENDING' ELSE status END,send_status='DELIVERED',delivered_at=coalesce(delivered_at,?),pending_at=coalesce(pending_at,?),updated_at=?,version=version+1 WHERE id=? AND (status IN ('SENT','PENDING','PAID') OR (status IN ('FAILED','SEND_PENDING') AND send_status='UNKNOWN')) AND send_status!='DELIVERED'")
      .bind(now,now,now,checkoutId),
    env.DB.prepare("UPDATE leads SET stage='AGUARDANDO_PAGAMENTO',updated_at=? WHERE id=? AND stage='CHECKOUT_ENVIADO' AND EXISTS (SELECT 1 FROM checkouts WHERE id=? AND send_status='DELIVERED' AND status IN ('PENDING','PAID'))").bind(now,checkout.lead_id,checkoutId),
    env.DB.prepare("INSERT INTO pipeline_history (id,lead_id,from_stage,to_stage,actor_id,reason,created_at) SELECT ?,?,'CHECKOUT_ENVIADO','AGUARDANDO_PAGAMENTO',?,?,? WHERE changes()=1")
      .bind(crypto.randomUUID(),checkout.lead_id,actorId,reason,now),
  ];
  const [updated] = await env.DB.batch(statements);
  return { found:true as const,changed:(updated.meta.changes ?? 0) === 1 };
}

