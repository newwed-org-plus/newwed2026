import{describe,it,expect}from'vitest';
import{validBillingDocument,normalizeBillingDocument}from'@/features/billing/billing-document';
import{checkoutDocument,encryptBillingDocument,decryptBillingDocument}from'@/server/billing-document';
const env={BILLING_ENCRYPTION_KEY:'a'.repeat(64)};
describe('dados fiscais da cobrança',()=>{
 it('valida CPF, CNPJ numérico e CNPJ alfanumérico sem aceitar documento repetido ou dígitos incorretos',()=>{
  for(const document of ['999.911.111-40','11.222.333/0001-81','12.ABC.345/01DE-35'])expect(validBillingDocument(document)).toBe(true);
  for(const document of ['00000000000','11111111111','99991111141','11222333000180','12ABC34501DE36','12ABC34501D!35','example'])expect(validBillingDocument(document)).toBe(false);
  expect(normalizeBillingDocument('12.abc.345/01de-35')).toBe('12ABC34501DE35');
 });
 it('exige documento de produção sem aceitar entrada inválida no Sandbox',()=>{
  expect(()=>checkoutDocument({ENVIRONMENT:'production'})).toThrow();expect(checkoutDocument({ENVIRONMENT:'development'})).toBeNull();expect(()=>checkoutDocument({ENVIRONMENT:'development'},'bad')).toThrow();
 });
 it('cifra com nonce exclusivo e vincula o conteúdo ao checkout',async()=>{
  const doc='99991111140';const first=await encryptBillingDocument(env,'checkout-one',doc);const second=await encryptBillingDocument(env,'checkout-one',doc);
  expect(first).not.toBe(second);expect(first).not.toContain(doc);await expect(decryptBillingDocument(env,'checkout-one',first)).resolves.toBe(doc);
  await expect(decryptBillingDocument(env,'checkout-two',first)).rejects.toMatchObject({code:'BILLING_DOCUMENT_UNAVAILABLE'});
  const altered=JSON.parse(first);altered.data=altered.data.slice(0,-4)+'AAAA';await expect(decryptBillingDocument(env,'checkout-one',JSON.stringify(altered))).rejects.toMatchObject({code:'BILLING_DOCUMENT_UNAVAILABLE'});
  await expect(encryptBillingDocument({},'checkout',doc)).rejects.toMatchObject({code:'BILLING_ENCRYPTION_NOT_CONFIGURED'});
 });
});
