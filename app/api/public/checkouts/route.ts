import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireCapability } from "@/server/capabilities";
import { errorResponse,HttpError,json,requireIdempotencyKey } from "@/server/http";
import { verifyTurnstile } from "@/server/integrations/turnstile";
import { sha256 } from "@/server/normalization";
import { publishOutbox } from "@/server/outbox";
import { existingPublicCheckout,publicCheckoutResponse,reservePublicCheckout } from "@/server/public-checkout";
import { clientIp,enforceRateLimit } from "@/server/rate-limit";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";
import { getSecrets } from "@/server/secrets";

const inputSchema = z.object({
  editionSlug:z.string().min(1).max(150).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  turnstileToken:z.string().max(2048).optional(),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireCapability(env,"publicCheckout");
    if (!getSecrets().ASAAS_CHECKOUT_WEBHOOK_TOKEN) {
      throw new HttpError(503,"CHECKOUT_NOT_CONFIGURED","O pagamento ainda está indisponível.");
    }
    const idempotency = z.string().uuid().parse(requireIdempotencyKey(request));
    const key = await sha256(idempotency);
    const input = inputSchema.parse(await readJsonWithLimit(request,4096));
    const existing = await existingPublicCheckout(env,key,input.editionSlug);
    if (existing) return responseWithRequestId(json(publicCheckoutResponse(existing,env.ASAAS_API_URL)),requestId);

    await enforceRateLimit(env,{scope:"public.checkout",identity:clientIp(request),limit:3,windowSeconds:900});
    await verifyTurnstile(input.turnstileToken,request.headers.get("cf-connecting-ip"),"public_checkout");
    const {checkout,event} = await reservePublicCheckout(env,{key,editionSlug:input.editionSlug,requestId});
    if (event) await publishOutbox(env,event);
    return responseWithRequestId(json(publicCheckoutResponse(checkout,env.ASAAS_API_URL),{status:event ? 202 : 200}),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
