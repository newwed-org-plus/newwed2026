import { env } from "cloudflare:workers";

export type RuntimeSecrets = {
  UAZAPI_INSTANCES?: string;
  UAZAPI_WEBHOOK_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  META_APP_SECRET?: string;
  META_ACCESS_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  ASAAS_API_KEY?: string;
  ASAAS_WEBHOOK_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export function getSecrets(): RuntimeSecrets {
  return env as unknown as RuntimeSecrets;
}
