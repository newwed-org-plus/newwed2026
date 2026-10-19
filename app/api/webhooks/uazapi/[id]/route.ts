import { env } from "cloudflare:workers";
import { getSecrets } from "@/server/secrets";
import { acceptUazapiWebhook } from "@/server/uazapi-webhook";
import { errorResponse,json } from "@/server/http";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";

export async function POST(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  const requestId = requestIdFrom(request);
  try {
    const { id } = await params;
    const payload = await readJsonWithLimit(request,1024*1024);
    const result = await acceptUazapiWebhook({ ...env,...getSecrets() },id,payload,requestId);
    return responseWithRequestId(json(result),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
