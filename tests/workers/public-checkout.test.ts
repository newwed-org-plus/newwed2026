import { env } from "cloudflare:workers";
import { expect,it,vi } from "vitest";
import { POST as reserve } from "../../app/api/public/checkouts/route";
import { GET as status } from "../../app/api/public/checkouts/[id]/route";
import { POST as webhook } from "../../app/api/webhooks/asaas/checkout/route";
import { createAsaasPublicCheckout,expireUnissuedPublicCheckouts } from "@/server/public-checkout";
import type { AsaasEnvironment } from "@/server/integrations/asaas";

const slug = "famtour-test";
const workerEnv = env as Env & AsaasEnvironment;
const providerId = "2bd251f0-09b2-44ff-8a0c-a5cb29e5bbda";
const hookUrl = "https://newwed.test/api/webhooks/asaas/checkout";

async function seedOffer() {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO editions (id,slug,name,destination,starts_at,ends_at,status,capacity,created_at,updated_at)
      VALUES (?,?,'Famtour Teste','Recife','2027-03-01','2027-03-04','OPEN',1,?,?)`).bind(slug,slug,now,now),
    env.DB.prepare("INSERT INTO availability (edition_id,reserved,sold,version,updated_at) VALUES (?,0,0,1,?)").bind(slug,now),
    env.DB.prepare(`INSERT INTO price_batches (id,edition_id,name,amount_cents,installment_count,active,created_at,updated_at)
      VALUES ('test-current',?,'Lote atual',769700,12,1,?,?)`).bind(slug,now,now),
  ]);
}

function reserveRequest(key = crypto.randomUUID(),ip = "198.51.100.42") {
  return new Request("https://newwed.test/api/public/checkouts",{
    method:"POST",
    headers:{"content-type":"application/json","idempotency-key":key,"cf-connecting-ip":ip},
    body:JSON.stringify({editionSlug:slug,amountCents:1}),
  });
}

function hook(event: string,checkout: Record<string,unknown>,token = "test-asaas-checkout-webhook-token") {
  return webhook(new Request(hookUrl,{method:"POST",headers:{"asaas-access-token":token},
    body:JSON.stringify({event,checkout:{id:providerId,...checkout}})}));
}

const inventory = () => env.DB.prepare("SELECT reserved,sold FROM availability WHERE edition_id=?").bind(slug).first();
const readStatus = (id: string) => status(new Request(`https://newwed.test/api/public/checkouts/${id}`),{params:Promise.resolve({id})});

it("protege a última vaga, envia o preço do lote e confirma somente pelo webhook",async () => {
  await seedOffer();
  const key = crypto.randomUUID();
  const [initial,concurrent] = await Promise.all([reserve(reserveRequest(key)),reserve(reserveRequest(key))]);
  expect([initial.status,concurrent.status].sort()).toEqual([200,202]);
  const {checkoutId} = await initial.json() as {checkoutId:string};
  expect(await concurrent.json()).toMatchObject({checkoutId,status:"QUEUED",checkoutUrl:null});
  expect((await reserve(reserveRequest())).status).toBe(409);
  expect(await inventory()).toEqual({reserved:1,sold:0});
  expect(await env.DB.prepare("SELECT count(*) AS count FROM outbox_events WHERE type='publicCheckout.create'").first()).toEqual({count:1});

  const fetcher = vi.fn<typeof fetch>(async () => Response.json({id:providerId}));
  await Promise.all([createAsaasPublicCheckout(workerEnv,checkoutId,fetcher),createAsaasPublicCheckout(workerEnv,checkoutId,fetcher)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("https://api-sandbox.asaas.com/v3/checkouts");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
    externalReference:checkoutId,
    billingTypes:["PIX","CREDIT_CARD"],
    chargeTypes:["DETACHED","INSTALLMENT"],
    installment:{maxInstallmentCount:12},
    items:[{quantity:1,value:7697}],
  });
  expect(await (await readStatus(checkoutId)).json()).toMatchObject({
    status:"READY",checkoutUrl:`https://sandbox.asaas.com/checkoutSession/show?id=${providerId}`,
  });
  expect((await hook("CHECKOUT_PAID",{},"wrong-token")).status).toBe(401);
  expect(await inventory()).toEqual({reserved:1,sold:0});

  const paid = {items:[{quantity:1,value:7697}],customerData:{cpfCnpj:"unused"}};
  expect((await hook("CHECKOUT_PAID",paid)).status).toBe(200);
  expect((await hook("CHECKOUT_PAID",paid)).status).toBe(200);
  expect((await hook("CHECKOUT_EXPIRED",{})).status).toBe(200);
  expect(await inventory()).toEqual({reserved:0,sold:1});
  expect(await (await readStatus(checkoutId)).json()).toMatchObject({status:"PAID",checkoutUrl:null});
});

it("recupera criação incerta pelo callback e devolve a vaga ao expirar",async () => {
  await seedOffer();
  const response = await reserve(reserveRequest());
  const {checkoutId} = await response.json() as {checkoutId:string};
  const transportFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
  expect(await createAsaasPublicCheckout(workerEnv,checkoutId,transportFailure)).toEqual({uncertain:true});
  await createAsaasPublicCheckout(workerEnv,checkoutId,transportFailure);
  expect(transportFailure).toHaveBeenCalledTimes(1);
  const callback = JSON.parse(String(transportFailure.mock.calls[0][1]?.body)).callback;
  expect((await hook("CHECKOUT_CREATED",{callback})).status).toBe(200);
  expect(await (await readStatus(checkoutId)).json()).toMatchObject({status:"READY"});
  expect((await hook("CHECKOUT_EXPIRED",{})).status).toBe(200);
  expect((await hook("CHECKOUT_EXPIRED",{})).status).toBe(200);
  expect(await inventory()).toEqual({reserved:0,sold:0});
  expect((await reserve(reserveRequest())).status).toBe(202);
  expect((await hook("CHECKOUT_PAID",{items:[{quantity:1,value:7697}]})).status).toBe(200);
  expect(await (await readStatus(checkoutId)).json()).toMatchObject({status:"PAYMENT_REVIEW"});
  expect(await inventory()).toEqual({reserved:1,sold:0});
});

it("recolhe reservas de sessões que nunca receberam link",async () => {
  await seedOffer();
  const response = await reserve(reserveRequest());
  const {checkoutId} = await response.json() as {checkoutId:string};
  await expireUnissuedPublicCheckouts(env,new Date(Date.now()+20*60_000));
  expect(await inventory()).toEqual({reserved:0,sold:0});
  expect(await (await readStatus(checkoutId)).json()).toMatchObject({status:"EXPIRED"});
});
