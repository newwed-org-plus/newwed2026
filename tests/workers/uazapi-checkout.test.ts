import {env} from 'cloudflare:workers';
import {describe,it,expect,vi} from 'vitest';
import {POST as createLead} from '../../app/api/public/leads/route';
import {POST as createCheckout} from '../../app/api/admin/leads/[id]/checkouts/route';
import {POST as reconcile} from '../../app/api/admin/checkouts/[id]/mark-delivered/route';
import {POST as resend} from '../../app/api/admin/checkouts/[id]/send/route';
import {POST as retryConfirmation} from '../../app/api/admin/checkouts/[id]/confirmation/route';
import {processCheckoutCreation,sendCheckout} from '@/server/checkout-processing';
import {applyAsaasPayment} from '@/server/integrations/asaas-payment';
import {sendPaidConfirmation} from '@/server/checkout-confirmation';
import {reconcileUazapiReceipt} from '@/server/uazapi-webhook';
import {dispatchEvent} from '@/server/dispatch';
import {verifyTurnstile} from '@/server/integrations/turnstile';
const now=()=>new Date().toISOString();
const req=(body:unknown,key=crypto.randomUUID())=>new Request('https://newwed.test/api/admin/checkouts',{method:'POST',headers:{origin:'https://newwed.test','content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
const ctx=(id:string)=>({params:Promise.resolve({id})});
const payment=(id:string)=>({id:'pay-uazapi',externalReference:id,billingType:'PIX',value:1200,status:'RECEIVED',dueDate:'2027-03-01'});
async function seed() {
 Object.assign(env,{CHECKOUT_CHANNEL:'uazapi'});
 await env.DB.batch([
  env.DB.prepare("INSERT INTO editions(id,slug,name,destination,starts_at,ends_at,status,capacity,created_at,updated_at) VALUES('e','piloto','VALIDACAO piloto','Recife','2027-03-01','2027-03-02','OPEN',2,?,?)").bind(now(),now()),
  env.DB.prepare("INSERT INTO availability(edition_id,reserved,sold,updated_at) VALUES('e',0,0,?)").bind(now()),
  env.DB.prepare("INSERT INTO price_batches(id,edition_id,name,amount_cents,installment_count,active,created_at,updated_at) VALUES('b','e','VALIDACAO',120000,12,1,?,?)").bind(now(),now()),
  env.DB.prepare("INSERT INTO whatsapp_instances(id,name,state,created_at,updated_at) VALUES('vendas','VALIDACAO','connected',?,?)").bind(now(),now()),
 ]);
 const response=await createLead(req({nome:'VALIDACAO',email:'synthetic@test.local',telefone:'81999990001',empresa:'VALIDACAO',cidade_estado:'Recife/PE',editionSlug:'piloto',lgpd:true,consent:{version:'2026-10',accepted:true},landingUrl:'https://newwed.test/famtour',respostas_brutas:{},utm:{utm_source:'local'}}));
 expect(response.status).toBe(201);const {leadId}=await response.json() as {leadId:string};
 await env.DB.batch([
  env.DB.prepare("UPDATE leads SET stage='QUALIFICADO' WHERE id=?").bind(leadId),
  env.DB.prepare("INSERT INTO conversations(id,lead_id,channel,external_id,contact_phone,whatsapp_instance_id,mode,created_at,updated_at) VALUES('c',?,'whatsapp','vendas:5581999990001','5581999990001','vendas','HUMAN',?,?)").bind(leadId,now(),now()),
 ]);
 const input={editionId:'e',priceBatchId:'b',method:'PIX',installmentCount:1};
 expect((await createCheckout(req(input),ctx(leadId))).status).toBe(422);
 const created=await createCheckout(req({...input,conversationId:'c'}),ctx(leadId));expect(created.status).toBe(202);
 const {checkoutId}=await created.json() as {checkoutId:string};
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);if(url.includes('/payments?externalReference='))return Response.json({data:[]});if(url.includes('/customers'))return Response.json({data:[{id:'customer-test'}]});
  if(url.endsWith('/payments')&&init?.method==='POST')return Response.json({...payment(checkoutId),status:'PENDING',invoiceUrl:'https://sandbox.asaas.test/checkout'});
  throw new Error('Unexpected mock request');
 });
 const event=await env.DB.prepare("SELECT id FROM outbox_events WHERE aggregate_id=? AND type='checkout.create'").bind(checkoutId).first<{id:string}>();
 expect(await processCheckoutCreation(env,checkoutId,event!.id,fetcher as typeof fetch)).toMatchObject({processed:true,status:'READY'});
 return checkoutId;
}
describe('checkout e confirmação na conversa UAZAPI',()=>{
 it('vincula linha, recebe entrega e confirma pagamento uma única vez, preservando estorno pendente',async()=>{
  const id=await seed();const send=await env.DB.prepare("SELECT id FROM outbox_events WHERE aggregate_id=? AND type='checkout.send'").bind(id).first<{id:string}>();
  const provider=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{expect(String(input)).toBe('https://vendas.uazapi.test/send/text');expect(JSON.parse(String(init?.body))).toMatchObject({number:'5581999990001'});return Response.json({id:'out-checkout'});});
  expect(await sendCheckout(env,id,send!.id,false,provider as typeof fetch)).toMatchObject({sent:true});
  expect(await env.DB.prepare('SELECT count(*) AS total FROM conversations').first()).toEqual({total:1});
  await env.DB.prepare("INSERT INTO webhook_events(id,provider,external_id,event_type,payload_json,created_at) VALUES('receipt','uazapi','status:uazapi:vendas:out-checkout:READ','uazapi.status','{}',?)").bind(now()).run();
  await reconcileUazapiReceipt(env,'uazapi:vendas:out-checkout');
  expect(await env.DB.prepare('SELECT status,send_status FROM checkouts WHERE id=?').bind(id).first()).toEqual({status:'PENDING',send_status:'DELIVERED'});
  await applyAsaasPayment(env,'PAYMENT_RECEIVED',payment(id),{});await applyAsaasPayment(env,'PAYMENT_RECEIVED',payment(id),{});
  expect(await env.DB.prepare("SELECT count(*) AS total FROM outbox_events WHERE type='checkout.confirmation.send'").first()).toEqual({total:1});
  const confirmationProvider=vi.fn(async()=>Response.json({id:'out-confirmation'}));
  const confirmationId=`confirmation:${id}`;
  await dispatchEvent(env,{id:confirmationId,type:'checkout.confirmation.send'},()=>sendPaidConfirmation(env,id,confirmationId,confirmationProvider));
  await dispatchEvent(env,{id:confirmationId,type:'checkout.confirmation.send'},()=>sendPaidConfirmation(env,id,confirmationId,confirmationProvider));expect(confirmationProvider).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare("SELECT conversation_id,type FROM messages WHERE id=?").bind(confirmationId).first()).toEqual({conversation_id:'c',type:'payment_confirmation'});
  await applyAsaasPayment(env,'PAYMENT_REFUND_IN_PROGRESS',payment(id),{});
  expect(await env.DB.prepare("SELECT reserved,sold FROM availability WHERE edition_id='e'").first()).toEqual({reserved:0,sold:1});
  await applyAsaasPayment(env,'PAYMENT_REFUNDED',payment(id),{});await applyAsaasPayment(env,'PAYMENT_RECEIVED',payment(id),{});
  expect(await env.DB.prepare('SELECT status FROM checkouts WHERE id=?').bind(id).first()).toEqual({status:'REFUNDED'});
  expect(await env.DB.prepare("SELECT reserved,sold FROM availability WHERE edition_id='e'").first()).toEqual({reserved:0,sold:0});
 });
 it('não repete envio incerto e só permite confirmação novamente após conciliação',async()=>{
  const id=await seed();const send=await env.DB.prepare("SELECT id FROM outbox_events WHERE aggregate_id=? AND type='checkout.send'").bind(id).first<{id:string}>();
  const provider=vi.fn().mockRejectedValue(new Error('timeout synthetic'));
  expect(await sendCheckout(env,id,send!.id,false,provider)).toMatchObject({uncertain:true});
  expect((await resend(req({}),ctx(id))).status).toBe(409);
  await applyAsaasPayment(env,'PAYMENT_RECEIVED',payment(id),{});
  const confirmationId=`confirmation:${id}`;
  await dispatchEvent(env,{id:confirmationId,type:'checkout.confirmation.send'},()=>sendPaidConfirmation(env,id,confirmationId,provider));
  expect((await retryConfirmation(req({reason:'VALIDACAO conferir resultado'}),ctx(id))).status).toBe(409);
  expect((await reconcile(req({messageId:confirmationId,outcome:'not-sent',reason:'VALIDACAO confirmado sem envio'}),ctx(id))).status).toBe(200);
  expect(await env.DB.prepare('SELECT status,send_status FROM checkouts WHERE id=?').bind(id).first()).toEqual({status:'PAID',send_status:'UNKNOWN'});
  expect((await retryConfirmation(req({reason:'VALIDACAO nova tentativa autorizada'}),ctx(id))).status).toBe(202);
  const success=vi.fn(async()=>Response.json({id:'confirmed'}));
  await dispatchEvent(env,{id:confirmationId,type:'checkout.confirmation.send'},()=>sendPaidConfirmation(env,id,confirmationId,success));expect(success).toHaveBeenCalledTimes(1);
 });
});
describe('Turnstile valida o domínio e a ação no servidor',()=>{
 it('exige configuração em staging e verifica resultado, ação, hostname e token consumido',async()=>{
  const runtime=env as unknown as Record<string,unknown>;const previous={ENVIRONMENT:runtime.ENVIRONMENT,TURNSTILE_SECRET_KEY:runtime.TURNSTILE_SECRET_KEY,TURNSTILE_HOSTNAMES:runtime.TURNSTILE_HOSTNAMES};
  Object.assign(runtime,{ENVIRONMENT:'staging',TURNSTILE_SECRET_KEY:undefined});
  try {
   await expect(verifyTurnstile('test',null)).rejects.toMatchObject({code:'TURNSTILE_NOT_CONFIGURED'});
   Object.assign(runtime,{TURNSTILE_SECRET_KEY:'synthetic-only',TURNSTILE_HOSTNAMES:'staging.newwed.test'});
   const network=vi.spyOn(globalThis,'fetch');
   try {
    network.mockResolvedValueOnce(Response.json({success:true,action:'public_lead',hostname:'staging.newwed.test'}));await expect(verifyTurnstile('once',null)).resolves.toBeUndefined();
    for(const response of [{success:false},{success:true,action:'other',hostname:'staging.newwed.test'},{success:true,action:'public_lead',hostname:'evil.test'}]){network.mockResolvedValueOnce(Response.json(response));await expect(verifyTurnstile('consumed',null)).rejects.toMatchObject({code:'TURNSTILE_FAILED'});}
    network.mockRejectedValueOnce(new Error('timeout'));await expect(verifyTurnstile('test',null)).rejects.toMatchObject({code:'TURNSTILE_UNAVAILABLE'});
   }finally{network.mockRestore();}
  }finally{Object.assign(runtime,previous);}
 });
});
