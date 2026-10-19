import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,json } from "@/server/http";
import { getSecrets } from "@/server/secrets";
import { listLineAgents } from "@/server/whatsapp-agents";

export async function GET(request:Request) {
  try {
    await requireAccessUser(request,["admin","gestor"]);
    return json(await listLineAgents({...env,...getSecrets()}));
  } catch (error) { return errorResponse(error); }
}
