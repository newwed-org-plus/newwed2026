import { env } from "cloudflare:workers";
import { z } from "zod";
import { timingSafeEqual } from "@/server/crypto";
import { errorResponse,HttpError,json } from "@/server/http";
import { applyAsaasPublicCheckoutEvent,publicCheckoutEventSchema,publicCheckoutEventType } from "@/server/public-checkout";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";
import { getSecrets } from "@/server/secrets";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const expected = getSecrets().ASAAS_CHECKOUT_WEBHOOK_TOKEN;
    const token = request.headers.get("asaas-access-token") ?? "";
    if (!expected || !timingSafeEqual(expected,token)) throw new HttpError(401,"INVALID_SIGNATURE","Webhook não autorizado.");
    const payload = await readJsonWithLimit(request,128 * 1024);
    const {event} = z.object({event:z.string()}).parse(payload);
    if (!publicCheckoutEventType.safeParse(event).success) return responseWithRequestId(json({received:true,ignored:true}),requestId);
    const matched = await applyAsaasPublicCheckoutEvent(env,publicCheckoutEventSchema.parse(payload));
    return responseWithRequestId(json({received:true,ignored:!matched}),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
