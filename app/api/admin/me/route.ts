import {capabilities} from "@/server/capabilities";
import {getSecrets} from "@/server/secrets";
import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse, json } from "@/server/http";

export async function GET(request: Request) {
  try {
    let inboundHost="";try{inboundHost=new URL(getSecrets().UAZAPI_WEBHOOK_BASE_URL??"").hostname;}catch{/* Not configured. */}
    return json({...await requireAccessUser(request),environment:env.ENVIRONMENT,capabilities:capabilities(env),inboundHost}); }
  catch (error) { return errorResponse(error); }
}
