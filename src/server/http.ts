import { ZodError } from "zod";
import { isDatabaseUnavailable, isDailyQuotaError } from "./database-availability";

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown, requestId?: string) {
  if (isDatabaseUnavailable(error)) {
    const quota=isDailyQuotaError(error);
    console.error(JSON.stringify({event:"database.unavailable",reason:quota?"DAILY_QUOTA":"TRANSIENT",requestId}));
    if(quota) {
      const now=new Date();
      const retryAt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
      return json({code:"DATABASE_UNAVAILABLE",reason:"DAILY_QUOTA",retryAt:retryAt.toISOString(),message:"O limite diário do banco foi atingido. Aguarde a renovação da cota para tentar novamente."},{status:503,headers:{"retry-after":String(Math.max(1,Math.ceil((retryAt.getTime()-now.getTime())/1000)))}});
    }
    return json({code:"DATABASE_UNAVAILABLE",message:"Serviço temporariamente indisponível. Tente novamente em instantes."},{status:503,headers:{"retry-after":"60"}});
  }
  if (error instanceof ZodError) {
    return json({ code: "VALIDATION_ERROR", message: "Dados inválidos.", fields: error.flatten().fieldErrors }, { status: 422 });
  }
  if (error instanceof HttpError) {
    return json({ code: error.code, message: error.message }, { status: error.status });
  }
  console.error(JSON.stringify({ level: "error", event: "request.failed", requestId, error: error instanceof Error ? error.message : String(error) }));
  return json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a solicitação." }, { status: 500 });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Envie um Idempotency-Key válido.");
  }
  return key;
}
