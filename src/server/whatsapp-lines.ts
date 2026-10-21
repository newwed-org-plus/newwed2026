import { configuredInstance,configuredInstances,parseUazapiSession,uazapiRequest,webhookUrl,type UazapiEnv } from "@/server/integrations/uazapi";
import { HttpError } from "@/server/http";

type LineEnv = UazapiEnv;
export async function ensureWhatsAppLines(env: LineEnv) {
  const instances = configuredInstances(env);
  if (instances.length) {
    const now = new Date().toISOString();
    await env.DB.batch(instances.map(instance => env.DB.prepare(`INSERT INTO whatsapp_instances (id,name,provider,state,created_at,updated_at)
      VALUES (?,?,'uazapi','disconnected',?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`)
      .bind(instance.id,instance.name,now,now)));
  }
  return instances;
}

export async function listWhatsAppLines(env: LineEnv) {
  const configured = await ensureWhatsAppLines(env);
  const rows = await env.DB.prepare("SELECT id,name,provider,state,phone,profile_name,last_error,updated_at FROM whatsapp_instances ORDER BY name").all();
  return rows.results.filter(row => configured.some(instance => instance.id === row.id))
    .map(row=>({...row,serverConfigured:Boolean(configured.find(instance=>instance.id===row.id)?.baseUrl)}));
}

export async function operateWhatsAppLine(env: LineEnv,id: string,action:"refresh"|"connect"|"disconnect"|"restart",actorId: string,fetcher: typeof fetch = fetch) {
  const instance = configuredInstance(env,id);
  const callbackUrl = action === "connect" || action === "restart" ? webhookUrl(env,id) : null;
  await ensureWhatsAppLines(env);
  const now = new Date().toISOString();
  const lease = crypto.randomUUID();
  const acquired = await env.DB.prepare(`UPDATE whatsapp_instances SET operation_token=?,operation_started_at=? WHERE id=?
    AND (operation_token IS NULL OR operation_started_at<?)`)
    .bind(lease,now,id,new Date(Date.now()-120_000).toISOString()).run();
  if (!acquired.meta.changes) throw new HttpError(409,"WHATSAPP_LINE_BUSY","Uma operação já está em andamento nesta linha.");
  try {
    let session;
    if (action === "disconnect") {
      await uazapiRequest(instance,"/instance/disconnect",{},fetcher);
      session = parseUazapiSession(await uazapiRequest(instance,"/instance/status",undefined,fetcher));
    } else {
      session = parseUazapiSession(await uazapiRequest(instance,"/instance/status",undefined,fetcher));
      if (action === "restart") {
        if (session.state !== "connecting") throw new HttpError(409,"WHATSAPP_QR_RESTART_NOT_AVAILABLE","Gere um QR Code novo somente quando houver uma tentativa de conexão em andamento.");
        await uazapiRequest(instance,"/instance/disconnect",{},fetcher);
        session = parseUazapiSession(await uazapiRequest(instance,"/instance/status",undefined,fetcher));
        if (session.state !== "disconnected") throw new HttpError(409,"WHATSAPP_QR_RESTART_FAILED","A tentativa anterior ainda não foi encerrada. Atualize o estado e tente novamente.");
      }
      if (action === "connect" || action === "restart") {
        await uazapiRequest(instance,"/webhook",{ enabled:true,url:callbackUrl,events:["connection","messages","messages_update","history"],excludeMessages:["wasSentByApi","isGroupYes"],addUrlEvents:false,addUrlTypesMessages:false },fetcher);
        if (action === "restart" || (session.state !== "connected" && session.state !== "connecting")) {
          await uazapiRequest(instance,"/instance/connect",{},fetcher);
          session = parseUazapiSession(await uazapiRequest(instance,"/instance/status",undefined,fetcher));
        }
      }
    }
    const updatedAt = new Date().toISOString();
    const [updated] = await env.DB.batch([
      env.DB.prepare("UPDATE whatsapp_instances SET state=?,phone=?,profile_name=?,last_error=NULL,updated_at=?,operation_token=NULL,operation_started_at=NULL WHERE id=? AND operation_token=?")
        .bind(session.state,session.phone,session.profileName,updatedAt,id,lease),
      env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,created_at) SELECT ?,?,?,'whatsapp_instance',?,? WHERE changes()=1 AND ?!='refresh'")
        .bind(crypto.randomUUID(),actorId,`whatsapp.${action}`,id,updatedAt,action),
    ]);
    if (!updated.meta.changes) throw new HttpError(409,"WHATSAPP_LINE_CHANGED","A operação expirou. Atualize o estado da linha.");
    return { id,name:instance.name,provider:"uazapi",...session,updatedAt };
  } catch (error) {
    await env.DB.prepare("UPDATE whatsapp_instances SET last_error=?,operation_token=NULL,operation_started_at=NULL WHERE id=? AND operation_token=?")
      .bind(error instanceof HttpError ? error.message : "Não foi possível consultar a linha.",id,lease).run();
    throw error;
  }
}
