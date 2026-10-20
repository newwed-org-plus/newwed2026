import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireAccessUser } from "@/server/auth/access";
import { requireSameOrigin } from "@/server/auth/session";
import { agentConfigSchema } from "@/features/conversations/agent-config";
import { errorResponse,json } from "@/server/http";
import { getSecrets } from "@/server/secrets";
import { enforceRateLimit } from "@/server/rate-limit";
import { readJsonWithLimit,requestIdFrom,responseWithRequestId } from "@/server/request-context";
import { previewLineAgent,saveLineAgent } from "@/server/whatsapp-agents";

const inputSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),config:agentConfigSchema}).strict(),
  z.object({action:z.literal("preview"),message:z.string().trim().min(1).max(1000)}).strict(),
]);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const requestId=requestIdFrom(request);
  try {
    const actor=await requireAccessUser(request,["admin","gestor"]);
    requireSameOrigin(request);
    const {id}=await params;
    const input=inputSchema.parse(await readJsonWithLimit(request,48*1024));
    await enforceRateLimit(env,{scope:`agents.${input.action}`,identity:actor.id,limit:input.action==="preview"?5:20,windowSeconds:60});
    const runtime={...env,...getSecrets()};
    const result=input.action==="save" ? {agent:await saveLineAgent(runtime,id,input.config,actor.id)} : {result:await previewLineAgent(runtime,id,input.message)};
    return responseWithRequestId(json(result),requestId);
  } catch (error) { return responseWithRequestId(errorResponse(error,requestId),requestId); }
}
