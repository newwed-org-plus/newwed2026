import {capabilityEnabled} from "@/server/capabilities";
import { env } from "cloudflare:workers";
import { json } from "@/server/http";
import { getSecrets } from "@/server/secrets";

export async function GET() {
  return json({
    turnstileSiteKey:String(env.TURNSTILE_SITE_KEY || ""),
    leadSubmissionEnabled:capabilityEnabled(env,"publicLeads"),
    publicCheckoutEnabled:capabilityEnabled(env,"publicCheckout") && Boolean(getSecrets().ASAAS_CHECKOUT_WEBHOOK_TOKEN),
  });
}
