import { env } from "cloudflare:workers";
import { z } from "zod";
import { errorResponse,HttpError,json } from "@/server/http";
import { publicCheckoutResponse,readPublicCheckout } from "@/server/public-checkout";
import { requestIdFrom,responseWithRequestId } from "@/server/request-context";

export async function GET(request: Request,{params}:{params:Promise<{id:string}>}) {
  const requestId = requestIdFrom(request);
  try {
    const id = z.string().uuid().parse((await params).id);
    const checkout = await readPublicCheckout(env,id);
    if (!checkout) throw new HttpError(404,"CHECKOUT_NOT_FOUND","Pedido não encontrado.");
    return responseWithRequestId(json(publicCheckoutResponse(checkout,env.ASAAS_API_URL)),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
