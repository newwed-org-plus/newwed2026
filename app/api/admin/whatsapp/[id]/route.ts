import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireAccessUser } from "@/server/auth/access";
import { requireSameOrigin } from "@/server/auth/session";
import { errorResponse,json } from "@/server/http";
import { getSecrets } from "@/server/secrets";
import { operateWhatsAppLine } from "@/server/whatsapp-lines";
import { enforceRateLimit } from "@/server/rate-limit";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";

export async function POST(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  const requestId = requestIdFrom(request);
  try {
    const actor = await requireAccessUser(request,["admin","gestor"]);
    requireSameOrigin(request);
    const { id } = await params;
    const { action } = z.object({ action:z.enum(["refresh","connect","disconnect","restart"]) }).parse(await readJsonWithLimit(request,2048));
    await enforceRateLimit(env,{ scope:`whatsapp.${action}`,identity:`${actor.id}:${id}`,limit:action === "refresh" ? 30 : 5,windowSeconds:60 });
    return responseWithRequestId(json(await operateWhatsAppLine({ ...env,...getSecrets() },id,action,actor.id)),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
