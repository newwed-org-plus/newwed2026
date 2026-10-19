import { z } from "zod";
import { HttpError } from "@/server/http";
import type { RuntimeSecrets } from "@/server/secrets";

const instanceSchema = z.object({
  id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name:z.string().trim().min(1).max(80),
  baseUrl:z.url().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  }),
  token:z.string().min(8).max(512),
});
export type UazapiInstance = z.infer<typeof instanceSchema>;
export type UazapiEnv = Pick<Env,"DB"> & RuntimeSecrets;
export type UazapiState = "disconnected"|"connecting"|"connected"|"hibernated";
export type UazapiSession = { state:UazapiState;qrCode:string|null;phone:string|null;profileName:string|null };

export function configuredInstances(env: RuntimeSecrets): UazapiInstance[] {
  if (!env.UAZAPI_INSTANCES?.trim()) return [];
  try {
    const values = z.array(instanceSchema).max(20).parse(JSON.parse(env.UAZAPI_INSTANCES));
    if (new Set(values.map(value => value.id)).size !== values.length || new Set(values.map(value => value.token)).size !== values.length) throw new Error();
    return values;
  } catch { throw new HttpError(503,"UAZAPI_CONFIG_INVALID","A configuração das linhas UAZAPI precisa ser revisada pelo administrador."); }
}

export function configuredInstance(env: RuntimeSecrets,id: string) {
  const instance = configuredInstances(env).find(item => item.id === id);
  if (!instance) throw new HttpError(404,"WHATSAPP_LINE_NOT_FOUND","Linha de WhatsApp não configurada.");
  return instance;
}

export function uazapiMessageId(lineId: string,id: string) {
  return `uazapi:${lineId}:${id.replace(/^\d+:/,"")}`;
}

export async function uazapiRequest(instance: UazapiInstance,path: string,body?: unknown,fetcher: typeof fetch = fetch): Promise<unknown> {
  let response:Response;
  try {
    response = await fetcher(new URL(path,instance.baseUrl),{
      method:body === undefined ? "GET" : "POST",
      headers:{ token:instance.token,"content-type":"application/json" },
      body:body === undefined ? undefined : JSON.stringify(body),
      signal:AbortSignal.timeout(15_000),redirect:"manual",
    });
  } catch { throw new HttpError(502,"UAZAPI_UNAVAILABLE","A UAZAPI não respondeu. Atualize o estado antes de tentar novamente."); }
  if (!response.ok) {
    // Provider bodies may contain credentials. Never include them in errors or logs.
    await response.body?.cancel();
    const status = response.status;
    throw new HttpError(status === 409 || status === 429 ? status : 502,`UAZAPI_HTTP_${status}`,
      status === 401 ? "A credencial da linha foi recusada pela UAZAPI." : status === 429 ? "A UAZAPI atingiu o limite de chamadas. Aguarde e atualize o estado." : status === 409 ? "Uma conexão já está em andamento. Atualize o estado da linha." : "Não foi possível concluir a operação na UAZAPI.");
  }
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks:Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done,value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 512 * 1024) { await reader.cancel();throw new Error(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset);offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { throw new HttpError(502,"UAZAPI_INVALID_RESPONSE","A UAZAPI devolveu uma resposta inválida."); }
}

export function parseUazapiSession(value: unknown): UazapiSession {
  const result = z.object({ instance:z.object({ status:z.enum(["disconnected","connecting","connected","hibernated"]),qrcode:z.string().nullish(),profileName:z.string().nullish() }),
    status:z.object({ jid:z.object({ user:z.string() }).nullish() }).optional() }).safeParse(value);
  if (!result.success) throw new HttpError(502,"UAZAPI_INVALID_RESPONSE","O estado da instância não pôde ser reconhecido.");
  const { instance,status } = result.data;
  const rawQr = instance.qrcode ?? "";
  const qrCode = /^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(rawQr) ? rawQr : /^[A-Za-z0-9+/=\r\n]{32,}$/.test(rawQr) ? `data:image/png;base64,${rawQr}` : null;
  return { state:instance.status,qrCode:instance.status === "connecting" ? qrCode : null,
    phone:instance.status === "connected" && /^\d{10,15}$/.test(status?.jid?.user ?? "") ? status!.jid!.user : null,
    profileName:instance.profileName?.slice(0,120) ?? null };
}

export function webhookUrl(env: RuntimeSecrets,id: string) {
  let url:URL;
  try { url = new URL(env.UAZAPI_WEBHOOK_BASE_URL ?? ""); } catch { throw new HttpError(503,"UAZAPI_WEBHOOK_NOT_CONFIGURED","Configure o endereço público do webhook antes de conectar a linha."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new HttpError(503,"UAZAPI_WEBHOOK_NOT_CONFIGURED","O endereço público do webhook deve ser uma origem HTTPS.");
  return new URL(`/api/webhooks/uazapi/${id}`,url).href;
}

export async function sendUazapiText(env: UazapiEnv,lineId: string,phone: string,body: string,fetcher: typeof fetch = fetch) {
  const instance = configuredInstance(env,lineId);
  const line = await env.DB.prepare("SELECT state FROM whatsapp_instances WHERE id=?").bind(lineId).first<{ state:string }>();
  if (line?.state !== "connected") throw new HttpError(409,"WHATSAPP_DISCONNECTED","Conecte a linha de WhatsApp antes de responder.");
  const value = await uazapiRequest(instance,"/send/text",{ number:phone,text:body,linkPreview:false,async:false },fetcher);
  const parsed = z.object({ id:z.string().min(1).optional(),messageid:z.string().min(1).optional() }).safeParse(value);
  const id = parsed.success ? parsed.data.messageid ?? parsed.data.id : undefined;
  if (!id) throw new HttpError(502,"UAZAPI_MESSAGE_UNCONFIRMED","A UAZAPI não confirmou o identificador do envio. Confira o histórico antes de reenviar.");
  return { messages:[{ id:uazapiMessageId(lineId,id) }] };
}
