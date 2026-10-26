import { env } from "cloudflare:workers";
import { applyD1Migrations,reset } from "cloudflare:test";
import { beforeEach } from "vitest";

beforeEach(async()=>{
  await reset();
  Object.assign(env,{CHECKOUT_CHANNEL:"meta",ENABLE_PUBLIC_LEADS:"true",ENABLE_MANUAL_SEND:"true",ENABLE_AGENT:"true",ENABLE_CHECKOUT:"true",ENABLE_CONFIRMATION:"true",ENABLE_EMAIL:"true"});
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
});
