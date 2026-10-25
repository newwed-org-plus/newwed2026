import path from "node:path";
import { cloudflareTest,readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve:{alias:{"@":path.join(import.meta.dirname,"src")}},
  plugins:[cloudflareTest(async()=>({
    main:"./tests/workers/entry.ts",
    miniflare:{
      compatibilityDate:"2026-09-11",compatibilityFlags:["nodejs_compat"],
      d1Databases:["DB","LEGACY_DB"],r2Buckets:["MEDIA"],queueProducers:{EVENTS_QUEUE:{queueName:"new-wed-events-test"}},
      durableObjects:{ADMIN_IP_LIMITER:{className:"AdminIpLimiter",useSQLite:true},ADMIN_PASSWORD_VERIFIER:{className:"AdminPasswordVerifier",useSQLite:true}},
      bindings:{
        ENABLE_PUBLIC_LEADS:"true",ENABLE_MANUAL_SEND:"true",ENABLE_AGENT:"true",ENABLE_CHECKOUT:"true",ENABLE_CONFIRMATION:"true",ENABLE_EMAIL:"true",
        UAZAPI_INSTANCES:JSON.stringify([{id:"vendas",name:"Vendas",baseUrl:"https://vendas.uazapi.test",token:"synthetic-vendas-token"},{id:"eventos",name:"Eventos",baseUrl:"https://eventos.uazapi.test",token:"synthetic-eventos-token"}]),
        UAZAPI_WEBHOOK_BASE_URL:"https://newwed.test",
        TEST_MIGRATIONS:await readD1Migrations(path.join(import.meta.dirname,"migrations")),
        ENVIRONMENT:"development",ACCESS_TEAM_DOMAIN:"",ACCESS_AUD:"",ALLOW_LOCAL_ACCESS:"true",OPENAI_MODEL:"gpt-5-mini",
        OPENAI_API_KEY:"test-openai-key",ASAAS_API_URL:"https://api-sandbox.asaas.com/v3",ASAAS_API_KEY:"test-asaas-key",ASAAS_WEBHOOK_TOKEN:"test-asaas-webhook-token",
        META_GRAPH_VERSION:"v23.0",META_CHECKOUT_TEMPLATE:"checkout_famtour",META_APP_SECRET:"test-meta-secret",META_ACCESS_TOKEN:"test-meta-token",META_PHONE_NUMBER_ID:"test-phone-id",
      },
    },
  }))],
  test:{include:["tests/workers/**/*.test.ts"],setupFiles:["./tests/workers/setup.ts"],testTimeout:20_000},
});
