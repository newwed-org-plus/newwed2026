import {capabilityEnabled} from "@/server/capabilities";
import { env } from "cloudflare:workers";
import { json } from "@/server/http";

export async function GET() {
  return json({ turnstileSiteKey: String(env.TURNSTILE_SITE_KEY || ""),leadSubmissionEnabled:capabilityEnabled(env,"publicLeads") });
}
