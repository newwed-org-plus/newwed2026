import { env } from "cloudflare:workers";
import { z } from "zod";
import { famtourPaymentMethods } from "@/content/famtour-editions";
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
  paymentMethod:z.enum(famtourPaymentMethods).optional(),
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
    const existing = await existingPublicCheckout(env,key,input.editionSlug,input.paymentMethod);
    if (existing) return responseWithRequestId(json(publicCheckoutResponse(existing,env.ASAAS_API_URL)),requestId);

    if (!input.paymentMethod) throw new HttpError(422,"PAYMENT_METHOD_REQUIRED","Atualize a página e escolha Pix ou cartão para continuar.");

    await enforceRateLimit(env,{scope:"public.checkout",identity:clientIp(request),limit:3,windowSeconds:900});
    await verifyTurnstile(input.turnstileToken,request.headers.get("cf-connecting-ip"),"public_checkout");
    const {checkout,event} = await reservePublicCheckout(env,{key,editionSlug:input.editionSlug,paymentMethod:input.paymentMethod,requestId});
    if (event) await publishOutbox(env,event);
    return responseWithRequestId(json(publicCheckoutResponse(checkout,env.ASAAS_API_URL),{status:event ? 202 : 200}),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
