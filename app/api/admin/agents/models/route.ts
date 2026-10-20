import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,json } from "@/server/http";
import { listFreeModels } from "@/server/integrations/openrouter";
import { enforceRateLimit } from "@/server/rate-limit";

export async function GET(request:Request) {
  try {
    const actor=await requireAccessUser(request,["admin","gestor"]);
    await enforceRateLimit(env,{scope:"agents.models",identity:actor.id,limit:15,windowSeconds:60});
    return json({items:await listFreeModels()});
  } catch (error) { return errorResponse(error); }
}
