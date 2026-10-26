import { deferOutbox,publishOutbox } from "@/server/outbox";

type NotificationEnv = Pick<Env,"DB"|"EVENTS_QUEUE">;
export type EmailEnv = NotificationEnv & {
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_ALLOWED_RECIPIENT_DOMAINS?: string;
};

type Recipient = { id:string;email:string;name:string };

function safeText(value:string) { return value.replace(/[\r\n]+/g," ").trim(); }
function escapeHtml(value:string) { return value.replace(/[&<>"']/g,(char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!)); }

export async function ensurePaidNotification(env:NotificationEnv,checkoutId:string,requestId:string) {
  const checkout = await env.DB.prepare(`SELECT c.id,c.lead_id,l.name AS lead_name,e.name AS edition_name
    FROM checkouts c JOIN leads l ON l.id=c.lead_id JOIN editions e ON e.id=c.edition_id WHERE c.id=? AND c.status='PAID'`)
    .bind(checkoutId).first<{id:string;lead_id:string;lead_name:string;edition_name:string}>();
  if (!checkout) return { created:false,recipientCount:0 };

  const assigned = await env.DB.prepare(`SELECT u.id,u.email,u.name FROM assignments a JOIN users u ON u.id=a.user_id
    WHERE a.lead_id=? AND a.active=1 AND u.active=1 ORDER BY a.created_at DESC LIMIT 1`)
    .bind(checkout.lead_id).first<Recipient>();
  const recipients = assigned ? [assigned] : (await env.DB.prepare(`SELECT DISTINCT u.id,u.email,u.name FROM users u JOIN roles r ON r.user_id=u.id
    WHERE u.active=1 AND r.role IN ('admin','gestor') ORDER BY u.name`).all<Recipient>()).results;
  if (!recipients.length) return { created:false,recipientCount:0 };

  const now = new Date().toISOString();
  const notificationId = crypto.randomUUID();
  const dedupeKey = `checkout.paid:${checkout.id}`;
  const insert = await env.DB.prepare(`INSERT OR IGNORE INTO notifications
    (id,type,entity_type,entity_id,title,body,dedupe_key,payload_json,request_id,created_at)
    VALUES (?,'CHECKOUT_PAID','checkout',?,'Pagamento confirmado',?,?,?, ?,?)`)
    .bind(notificationId,checkout.id,`${checkout.lead_name} confirmou o pagamento de ${checkout.edition_name}.`,dedupeKey,JSON.stringify({checkoutId,leadId:checkout.lead_id}),requestId,now).run();
  const notification = await env.DB.prepare("SELECT id FROM notifications WHERE dedupe_key=?").bind(dedupeKey).first<{id:string}>();
  if (!notification) throw new Error("Paid notification could not be persisted");

  for (const recipient of recipients) {
    const emailOutboxId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO notification_recipients
        (id,notification_id,user_id,channel,delivery_status,sent_at,created_at,updated_at)
        VALUES (?,?,?,'IN_APP','SENT',?,?,?)`).bind(crypto.randomUUID(),notification.id,recipient.id,now,now,now),
      env.DB.prepare(`INSERT OR IGNORE INTO notification_recipients
        (id,notification_id,user_id,channel,delivery_status,created_at,updated_at)
        VALUES (?,?,?,'EMAIL','PENDING',?,?)`).bind(crypto.randomUUID(),notification.id,recipient.id,now,now),
      env.DB.prepare(`INSERT OR IGNORE INTO outbox_events
        (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at)
        VALUES (?,'notification.email',?,?,?,0,?,?)`)
        .bind(emailOutboxId,notification.id,`notification.email:${notification.id}:${recipient.id}`,JSON.stringify({notificationId:notification.id,userId:recipient.id,requestId}),requestId,now),
    ]);
    const pending = await env.DB.prepare("SELECT id,published_at FROM outbox_events WHERE dedupe_key=?")
      .bind(`notification.email:${notification.id}:${recipient.id}`).first<{id:string;published_at:string|null}>();
    if (pending && !pending.published_at) await publishOutbox(env,{id:pending.id,type:"notification.email",notificationId:notification.id,userId:recipient.id,requestId});
  }
  return { created:(insert.meta.changes ?? 0) === 1,recipientCount:recipients.length };
}

function recipientAllowed(email:string,domains:string|undefined) {
  const allowed = (domains ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.split("@").at(-1)?.toLowerCase() ?? "");
}

export async function processNotificationEmail(env:EmailEnv,eventId:string,notificationId:string,userId:string) {
  const row = await env.DB.prepare(`SELECT nr.delivery_status,nr.attempts,u.email,u.name,n.title,n.body
    FROM notification_recipients nr JOIN users u ON u.id=nr.user_id JOIN notifications n ON n.id=nr.notification_id
    WHERE nr.notification_id=? AND nr.user_id=? AND nr.channel='EMAIL'`)
    .bind(notificationId,userId).first<{delivery_status:string;attempts:number;email:string;name:string;title:string;body:string}>();
  if (!row || ["SENT","SEND_UNKNOWN"].includes(row.delivery_status)) return { sent:false,duplicate:true };
  const now = new Date().toISOString();
  let attempted=false;
  try {
    const from = safeText(env.EMAIL_FROM ?? "");
    if (!env.EMAIL || !from) throw new Error("Cloudflare Email binding or EMAIL_FROM is not configured");
    if (!recipientAllowed(row.email,env.EMAIL_ALLOWED_RECIPIENT_DOMAINS)) throw new Error("Email recipient domain is not allowed");
    attempted=true;
    const accepted=await env.EMAIL.send({
      from,to:safeText(row.email),subject:safeText(row.title),replyTo:env.EMAIL_REPLY_TO ? safeText(env.EMAIL_REPLY_TO) : undefined,
      text:`Olá, ${row.name}.\n\n${row.body}\n\nAcesse o dashboard comercial New Wed para conferir os detalhes.`,
      html:`<p>Olá, ${escapeHtml(row.name)}.</p><p>${escapeHtml(row.body)}</p><p>Acesse o dashboard comercial New Wed para conferir os detalhes.</p>`,
    });
    if(!accepted?.messageId)throw new Error("O serviço de e-mail não confirmou o aceite.");
    await env.DB.batch([
      env.DB.prepare("UPDATE notification_recipients SET provider_message_id=?,delivery_status='SENT',sent_at=?,attempts=attempts+1,last_error=NULL,updated_at=? WHERE notification_id=? AND user_id=? AND channel='EMAIL' AND delivery_status!='SENT'").bind(accepted.messageId,now,now,notificationId,userId),
      env.DB.prepare("UPDATE outbox_events SET last_error=NULL WHERE id=?").bind(eventId),
    ]);
    return { sent:true,duplicate:false };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0,1000);
    await env.DB.prepare("UPDATE notification_recipients SET delivery_status=?,attempts=attempts+1,last_error=?,updated_at=? WHERE notification_id=? AND user_id=? AND channel='EMAIL'")
      .bind(attempted?"SEND_UNKNOWN":"FAILED",message,now,notificationId,userId).run();
    if(!attempted)await deferOutbox(env,eventId,error,row.attempts);
    return { sent:false,duplicate:false,error:message,uncertain:attempted };
  }
}
