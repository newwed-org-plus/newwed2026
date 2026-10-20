import { env } from "cloudflare:workers";
import { getSecrets } from "@/server/secrets";
import { acceptUazapiWebhook } from "@/server/uazapi-webhook";
import { errorResponse,json } from "@/server/http";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";
import { configuredInstance } from "@/server/integrations/uazapi";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    configuredInstance(getSecrets(),id);
    // Check the migrated receiver schema without exposing line identity or credentials.
    await env.DB.prepare("SELECT id FROM whatsapp_instances WHERE id=?").bind(id).first();
    return json({provider:"uazapi",line:id,status:"ready",method:"POST",authentication:"instance-token"});
  } catch(error){return errorResponse(error);}
}

export async function POST(request: Request,{ params }:{ params:Promise<{ id:string }> }) {
  const requestId = requestIdFrom(request);
  try {
    const { id } = await params;
    const payload = await readJsonWithLimit(request,1024*1024);
    const result = await acceptUazapiWebhook({ ...env,...getSecrets() },id,payload,requestId);
    return responseWithRequestId(json(result),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
