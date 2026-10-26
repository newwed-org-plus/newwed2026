import{describe,it,expect,vi}from'vitest';
import{requireLocalCheckoutRecipients,checkoutText,confirmationText}from'@/server/local-checkout-policy';
import{findOrCreateCustomer}from'@/server/integrations/asaas';
const env={ENVIRONMENT:'development',LOCAL_TEST_MODE:'true',LOCAL_WHATSAPP_ALLOWED_RECIPIENTS:'5581999990001'};
describe('checkout restrito no perfil local',()=>{
 it('aceita somente lead e conversa autorizados inclusive nono dígito',()=>{
  expect(()=>requireLocalCheckoutRecipients(env,['+5581999990001','558199990001'])).not.toThrow();
  for(const phones of [[],['5581999990001',null],['5581999990001','5581888880001']])expect(()=>requireLocalCheckoutRecipients(env,phones)).toThrow();
  expect(()=>requireLocalCheckoutRecipients({...env,ENVIRONMENT:'production'},['5581888880001'])).not.toThrow();
 });
 it('distingue confirmação de teste de participação real',()=>{
  expect(checkoutText(env,'https://sandbox.example/invoice')).toContain('TESTE SANDBOX');expect(confirmationText(env,'VALIDACAO')).toContain('não confirma uma participação real');
  expect(confirmationText({...env,ENVIRONMENT:'production'},'FAMTOUR')).not.toContain('SANDBOX');
 });
 it('desliga notificações nativas do Asaas e limita documento sintético ao Sandbox',async()=>{
  const calls:RequestInit[]=[];const fetcher=vi.fn(async(_input:unknown,init:RequestInit={})=>{calls.push(init);return Response.json(calls.length===1?{data:[]}:{id:'cus_synthetic'});});
  const policy={...env,ASAAS_API_URL:'https://api-sandbox.asaas.com/v3',ASAAS_API_KEY:'$aact_hmlg_synthetic',ASAAS_SANDBOX_TEST_DOCUMENT:'99991111140'};
  const lead={id:'synthetic-lead',name:'VALIDACAO',email:'test@example.invalid',normalizedPhone:'+5581999990001'};
  await expect(findOrCreateCustomer(policy,lead,fetcher as typeof fetch)).resolves.toBe('cus_synthetic');expect(JSON.parse(String(calls[1].body))).toMatchObject({notificationDisabled:true,cpfCnpj:'99991111140',externalReference:lead.id});
  const blocked=vi.fn();await expect(findOrCreateCustomer({...policy,LOCAL_TEST_MODE:'false'},lead,blocked)).rejects.toMatchObject({code:'ASAAS_TEST_DATA_BLOCKED'});expect(blocked).not.toHaveBeenCalled();
 });
 it('bloqueia produção sem documento e evita cobrar outro pagador no mesmo vínculo',async()=>{
  const policy={ASAAS_API_URL:'https://api.asaas.com/v3',ASAAS_API_KEY:'$aact_prod_synthetic'};
  const lead={id:'synthetic-lead',name:'Marina Costa',email:'marina@example.invalid',normalizedPhone:'+5581999990001'};
  const blocked=vi.fn();await expect(findOrCreateCustomer(policy,lead,blocked)).rejects.toMatchObject({code:'BILLING_DOCUMENT_REQUIRED'});expect(blocked).not.toHaveBeenCalled();
  const existing=vi.fn(async()=>Response.json({data:[{id:'cus_existing',cpfCnpj:'11222333000181'}]}));
  await expect(findOrCreateCustomer(policy,{...lead,cpfCnpj:'99991111140'},existing as typeof fetch)).rejects.toMatchObject({code:'BILLING_DOCUMENT_MISMATCH'});expect(existing).toHaveBeenCalledTimes(1);
 });
});
