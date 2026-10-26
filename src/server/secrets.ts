import { env } from "cloudflare:workers";

export type RuntimeSecrets = {
  ENABLE_FREE_AI_RETRY?:string;
  LOCAL_TEST_MODE?: string;
  LOCAL_ALLOW_MANUAL_SEND_ANY?: string;
  LOCAL_CRON_TOKEN?: string;
  LOCAL_WHATSAPP_ALLOWED_RECIPIENTS?: string;
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  OPENROUTER_API_KEY?: string;
  UAZAPI_INSTANCES?: string;
  UAZAPI_WEBHOOK_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  META_APP_SECRET?: string;
  META_ACCESS_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  BILLING_ENCRYPTION_KEY?: string;
  ASAAS_API_KEY?: string;
  ASAAS_SANDBOX_TEST_DOCUMENT?: string;
  ASAAS_WEBHOOK_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export function getSecrets(): RuntimeSecrets {
  return env as unknown as RuntimeSecrets;
}
