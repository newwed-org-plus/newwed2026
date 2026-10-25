import { env } from "cloudflare:workers";
import { createExecutionContext,createMessageBatch,getQueueResult } from "cloudflare:test";
import { describe,expect,it,vi } from "vitest";
import eventsWorker from "../../workers/events";
import { POST as createLead } from "../../app/api/public/leads/route";
import { POST as transitionLead } from "../../app/api/admin/leads/[id]/transitions/route";
import { POST as assignLead } from "../../app/api/admin/leads/[id]/assign/route";
import { POST as createCheckout } from "../../app/api/admin/leads/[id]/checkouts/route";
import { POST as receiveAsaasWebhook } from "../../app/api/webhooks/asaas/route";
import { POST as receiveMetaWebhook } from "../../app/api/webhooks/meta/route";
import { processCheckoutCreation,markCheckoutDelivered,sendCheckout } from "@/server/checkout-processing";
import { processIncomingWhatsApp } from "@/server/conversation-processing";
import { processNotificationEmail,type EmailEnv } from "@/server/notifications";
import { hmacSha256Hex } from "@/server/crypto";
import type { RuntimeSecrets } from "@/server/secrets";

type TestEnv = Env & RuntimeSecrets & {TEST_MIGRATIONS:import("cloudflare:test").D1Migration[]};
const workerEnv=env as unknown as TestEnv;
const adminHeaders={"content-type":"application/json","x-dev-access-email":"admin@newwed.local"};

function adminRequest(url:string,body:unknown,headers:Record<string,string>={}) {
  return new Request(`https://newwed.test${url}`,{method:"POST",headers:{...adminHeaders,...headers},body:JSON.stringify(body)});
}

async function seedEdition(capacity=4) {
  const now="2026-09-14T00:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO editions (id,slug,name,destination,starts_at,ends_at,status,capacity,created_at,updated_at) VALUES ('edition-1','recife-2027','FAMTOUR Recife','Recife','2027-03-01','2027-03-04','OPEN',?,?,?)").bind(capacity,now,now),
    env.DB.prepare("INSERT INTO availability (edition_id,reserved,sold,version,updated_at) VALUES ('edition-1',0,0,1,?)").bind(now),
    env.DB.prepare("INSERT INTO price_batches (id,edition_id,name,amount_cents,installment_count,active,created_at,updated_at) VALUES ('price-1','edition-1','Lote piloto',120000,12,1,?,?)").bind(now,now),
  ]);
}

async function submitLead(suffix="1") {
  const response=await createLead(new Request("https://newwed.test/api/public/leads",{method:"POST",headers:{"content-type":"application/json","idempotency-key":`lead-idem-${suffix}`,"cf-connecting-ip":`198.51.100.${suffix}`},body:JSON.stringify({
    nome:`Lead Teste ${suffix}`,email:`lead-${suffix}@test.local`,telefone:`8199999000${suffix}`,empresa:"Agência Teste",cidade_estado:"Recife/PE",editionSlug:"recife-2027",
    respostas_brutas:{perfil:"agente"},lgpd:true,consent:{version:"2026-09",accepted:true},landingUrl:"https://newwed.test/famtour?utm_source=instagram",utm:{utm_source:"instagram",utm_campaign:"piloto"},
  })}));
  expect(response.status).toBe(201);
  return response.json() as Promise<{leadId:string}>;
}

function jsonFetcher(value:unknown,status=200) { return (async()=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}})) as typeof fetch; }

describe("fluxo completo no runtime Workers",()=>{
  it("percorre UTM, agente, qualificação, checkout, entrega, PAGO e confirmação uma vez",async()=>{
    await seedEdition();
    const {leadId}=await submitLead();
    const leadOutbox=await env.DB.prepare("SELECT id,request_id FROM outbox_events WHERE type='lead.submitted' AND aggregate_id=?").bind(leadId).first<{id:string;request_id:string}>();
    expect(leadOutbox?.request_id).toBeTruthy();
    const batch=createMessageBatch("new-wed-events-test",[{id:"queue-lead",timestamp:Date.now(),attempts:1,body:{id:leadOutbox!.id,type:"lead.submitted",leadId,requestId:leadOutbox!.request_id}}]);
    const ctx=createExecutionContext();
    await eventsWorker.queue(batch,workerEnv);
    expect((await getQueueResult(batch,ctx)).explicitAcks).toContain("queue-lead");

    const incomingId="message:wamid.in.1";
    const incomingEvent={id:"wamid.in.1",from:"5581999990001",type:"text",text:{body:"Olá, gostaria de conhecer o roteiro"}};
    const metaBody=JSON.stringify({entry:[{id:"waba-test",changes:[{value:{messages:[incomingEvent],metadata:{phone_number_id:"test-phone-id"},contacts:[]}}]}]});
    const signature=`sha256=${await hmacSha256Hex("test-meta-secret",new TextEncoder().encode(metaBody).buffer as ArrayBuffer)}`;
    const metaWebhook=await receiveMetaWebhook(new Request("https://newwed.test/api/webhooks/meta",{method:"POST",headers:{"content-type":"application/json","x-hub-signature-256":signature,"x-request-id":"req-whatsapp"},body:metaBody}));
    expect(metaWebhook.status).toBe(200);
    const openai=jsonFetcher({output_text:JSON.stringify({reply:"Claro! A edição acontece em Recife.",confidence:0.94,handoff:false,reason:"Informação disponível no catálogo"})});
    const metaText=jsonFetcher({messages:[{id:"wamid.out.agent"}]});
    const agent=await processIncomingWhatsApp(workerEnv,incomingId,{openaiFetcher:openai,metaFetcher:metaText});
    expect(agent).toMatchObject({processed:true,answered:true,handoff:false});
    expect((await env.DB.prepare("SELECT stage FROM leads WHERE id=?").bind(leadId).first<{stage:string}>())?.stage).toBe("EM_ATENDIMENTO");

    const qualify=await transitionLead(adminRequest(`/api/admin/leads/${leadId}/transitions`,{stage:"QUALIFICADO"}),{params:Promise.resolve({id:leadId})});
    expect(qualify.status).toBe(200);
    const admin=await env.DB.prepare("SELECT id FROM users WHERE email='admin@newwed.local'").first<{id:string}>();
    const assigned=await assignLead(adminRequest(`/api/admin/leads/${leadId}/assign`,{userId:admin!.id}),{params:Promise.resolve({id:leadId})});
    expect(assigned.status).toBe(200);

    const checkoutResponse=await createCheckout(adminRequest(`/api/admin/leads/${leadId}/checkouts`,{editionId:"edition-1",priceBatchId:"price-1",method:"PIX",installmentCount:1},{"idempotency-key":"checkout-idem-1","x-request-id":"req-checkout-e2e"}),{params:Promise.resolve({id:leadId})});
    expect(checkoutResponse.status).toBe(202);
    const checkoutBody=await checkoutResponse.json() as {checkoutId:string};
    const creationEvent=await env.DB.prepare("SELECT id FROM outbox_events WHERE type='checkout.create' AND aggregate_id=?").bind(checkoutBody.checkoutId).first<{id:string}>();
    const asaasMock=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes("/payments?externalReference="))return new Response(JSON.stringify({data:[]}));
      if(url.includes("/customers?externalReference="))return new Response(JSON.stringify({data:[{id:"cus-test"}]}));
      if(url.endsWith("/payments")&&init?.method==="POST")return new Response(JSON.stringify({id:"pay-test",customer:"cus-test",externalReference:checkoutBody.checkoutId,invoiceUrl:"https://sandbox.asaas.test/i/pay-test",billingType:"PIX",value:1200,dueDate:"2026-09-17",status:"PENDING"}));
      throw new Error(`Unexpected Asaas request: ${url}`);
    }) as typeof fetch;
    expect(await processCheckoutCreation(workerEnv,checkoutBody.checkoutId,creationEvent!.id,asaasMock)).toMatchObject({processed:true,status:"READY"});
    const sendEvent=await env.DB.prepare("SELECT id FROM outbox_events WHERE type='checkout.send' AND aggregate_id=?").bind(checkoutBody.checkoutId).first<{id:string}>();
    expect(await sendCheckout(workerEnv,checkoutBody.checkoutId,sendEvent!.id,false,jsonFetcher({messages:[{id:"wamid.checkout"}]}))).toMatchObject({sent:true});
    expect((await markCheckoutDelivered(workerEnv,checkoutBody.checkoutId,null,"Teste de entrega")).changed).toBe(true);

    const paidPayload={id:"evt-paid-1",event:"PAYMENT_RECEIVED",payment:{id:"pay-test",externalReference:checkoutBody.checkoutId,billingType:"PIX",value:1200,dueDate:"2026-09-17",status:"RECEIVED",paymentDate:"2026-09-14"}};
    const paidRequest=()=>new Request("https://newwed.test/api/webhooks/asaas",{method:"POST",headers:{"content-type":"application/json","asaas-access-token":"test-asaas-webhook-token","x-request-id":"req-paid-e2e"},body:JSON.stringify(paidPayload)});
    expect((await receiveAsaasWebhook(paidRequest())).status).toBe(200);
    expect((await receiveAsaasWebhook(paidRequest())).status).toBe(200);
    const stalePayload={...paidPayload,id:"evt-overdue-after-paid",event:"PAYMENT_OVERDUE",payment:{...paidPayload.payment,status:"OVERDUE"}};
    expect((await receiveAsaasWebhook(new Request("https://newwed.test/api/webhooks/asaas",{method:"POST",headers:{"content-type":"application/json","asaas-access-token":"test-asaas-webhook-token"},body:JSON.stringify(stalePayload)}))).status).toBe(200);

    const final=await env.DB.prepare(`SELECT l.stage,c.status,c.financial_status,c.request_id,(SELECT count(*) FROM pipeline_history WHERE lead_id=l.id AND to_stage='PAGO') AS paid_transitions,
      (SELECT count(*) FROM notifications WHERE entity_id=c.id AND type='CHECKOUT_PAID') AS notifications,
      (SELECT count(*) FROM outbox_events WHERE type='notification.email' AND aggregate_id IN (SELECT id FROM notifications WHERE entity_id=c.id)) AS emails
      FROM leads l JOIN checkouts c ON c.lead_id=l.id WHERE c.id=?`).bind(checkoutBody.checkoutId).first<{stage:string;status:string;financial_status:string;request_id:string;paid_transitions:number;notifications:number;emails:number}>();
    expect(final).toMatchObject({stage:"PAGO",status:"PAID",financial_status:"PAID",request_id:"req-checkout-e2e",paid_transitions:1,notifications:1,emails:1});
    expect((await env.DB.prepare("SELECT status FROM payments WHERE provider_payment_id='pay-test'").first<{status:string}>())?.status).toBe("PAID");
    const notification=await env.DB.prepare("SELECT n.id,o.id AS outbox_id,u.id AS user_id FROM notifications n JOIN outbox_events o ON o.aggregate_id=n.id AND o.type='notification.email' JOIN notification_recipients nr ON nr.notification_id=n.id AND nr.channel='EMAIL' JOIN users u ON u.id=nr.user_id WHERE n.entity_id=?")
      .bind(checkoutBody.checkoutId).first<{id:string;outbox_id:string;user_id:string}>();
    const send=vi.fn().mockResolvedValue({messageId:"email-1"});
    const emailEnv={...workerEnv,EMAIL:{send} as unknown as SendEmail,EMAIL_FROM:"marketing@newwed.com.br",EMAIL_ALLOWED_RECIPIENT_DOMAINS:"newwed.local"} as EmailEnv;
    expect(await processNotificationEmail(emailEnv,notification!.outbox_id,notification!.id,notification!.user_id)).toMatchObject({sent:true});
    expect(await processNotificationEmail(emailEnv,notification!.outbox_id,notification!.id,notification!.user_id)).toMatchObject({duplicate:true});
    expect(await processNotificationEmail(emailEnv,notification!.outbox_id,notification!.id,notification!.user_id)).toMatchObject({duplicate:true});
    expect(send).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare("SELECT delivery_status,attempts FROM notification_recipients WHERE notification_id=? AND channel='EMAIL'").bind(notification!.id).first<{delivery_status:string;attempts:number}>())).toMatchObject({delivery_status:"SENT",attempts:1});
    expect((await env.DB.prepare("SELECT utm_source FROM lead_attribution WHERE lead_id=? AND touch_type='LAST'").bind(leadId).first<{utm_source:string}>())?.utm_source).toBe("instagram");
    if (!env.MEDIA) throw new Error("The local Workers test requires the MEDIA binding.");
    await env.MEDIA.put("evidence/flow.txt","ok");
    expect(await (await env.MEDIA.get("evidence/flow.txt"))?.text()).toBe("ok");
  });
});
