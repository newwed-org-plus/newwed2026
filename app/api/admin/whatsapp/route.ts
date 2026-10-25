import { env } from "cloudflare:workers";
import { requireAccessUser } from "@/server/auth/access";
import { errorResponse,json } from "@/server/http";
import { listWhatsAppLines } from "@/server/whatsapp-lines";
import { getSecrets } from "@/server/secrets";

export async function GET(request: Request) {
  try {
    await requireAccessUser(request,["admin","gestor"]);
    return json({localTestMode:getSecrets().LOCAL_TEST_MODE==="true",historySyncEnabled:String(env.ENABLE_HISTORY_SYNC)==="true", items:await listWhatsAppLines({ ...env,...getSecrets() }) });
  } catch (error) { return errorResponse(error); }
}
