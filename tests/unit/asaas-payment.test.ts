import { describe, expect, it } from "vitest";
import { validateAsaasPaymentSeries } from "@/server/checkout-processing";
import { buildAsaasPaymentPayload,cancelAsaasPayment,findPaymentsByExternalReference } from "@/server/integrations/asaas";
import { asaasStatusEvent } from "@/server/integrations/asaas-payment";

describe("asaasStatusEvent", () => {
  it.each([
    ["RECEIVED", "PAYMENT_RECEIVED"],
    ["CONFIRMED", "PAYMENT_RECEIVED"],
    ["OVERDUE", "PAYMENT_OVERDUE"],
    ["REFUNDED", "PAYMENT_REFUNDED"],
    ["REFUND_IN_PROGRESS", "PAYMENT_REFUND_IN_PROGRESS"],
    ["DELETED", "PAYMENT_DELETED"],
    ["CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_DELETED"],
    ["PENDING", "PAYMENT_PENDING"],
  ])("maps %s to %s", (status, event) => {
    expect(asaasStatusEvent(status)).toBe(event);
  });
});

describe("contrato de criação Asaas",() => {
  const input = { customerId:"cus_1",checkoutId:"checkout-1",method:"CREDIT_CARD" as const,amountCents:10001,dueDate:"2026-10-01",description:"FAMTOUR",installmentCount:1 };
  it("envia value em cobrança única",() => {
    expect(buildAsaasPaymentPayload(input)).toMatchObject({ value:100.01 });
    expect(buildAsaasPaymentPayload(input)).not.toHaveProperty("totalValue");
  });
  it("envia totalValue e installmentCount em parcelamento",() => {
    const payload = buildAsaasPaymentPayload({ ...input,installmentCount:3 });
    expect(payload).toMatchObject({ totalValue:100.01,installmentCount:3 });
    expect(payload).not.toHaveProperty("value");
  });
  it("recupera apenas a cobrança da referência exata sem POST",async () => {
    const calls:Array<{ url:string;method:string }> = [];
    const fetcher = (async (value: string | URL | Request,init?:RequestInit) => {
      calls.push({ url:String(value),method:init?.method ?? "GET" });
      return Response.json({ data:[
        { id:"pay-1",externalReference:"checkout-1",value:100.01,status:"PENDING" },
        { id:"pay-other",externalReference:"other",value:100.01,status:"PENDING" },
      ] });
    }) as typeof fetch;
    const payments = await findPaymentsByExternalReference({ ASAAS_API_KEY:"test",ASAAS_API_URL:"https://api-sandbox.asaas.com/v3" },"checkout-1",fetcher);
    expect(payments.map((payment) => payment.id)).toEqual(["pay-1"]);
    expect(calls).toEqual([{ url:"https://api-sandbox.asaas.com/v3/payments?externalReference=checkout-1&limit=100",method:"GET" }]);
  });
  it("cancela todas as cobranças abertas de um parcelamento",async () => {
    const calls:Array<{ url:string;method:string }> = [];
    const fetcher = (async (value: string | URL | Request,init?:RequestInit) => {
      calls.push({ url:String(value),method:init?.method ?? "GET" });
      return Response.json({ deleted:true });
    }) as typeof fetch;
    await cancelAsaasPayment({ ASAAS_API_KEY:"test",ASAAS_API_URL:"https://api-sandbox.asaas.com/v3" },{ paymentId:"pay-1",installmentId:"installment-1" },fetcher);
    expect(calls).toEqual([{ url:"https://api-sandbox.asaas.com/v3/installments/installment-1/payments",method:"DELETE" }]);
  });
  it("trata recurso já removido como cancelamento concluído",async () => {
    const fetcher = (async () => Response.json({}, { status:404 })) as typeof fetch;
    await expect(cancelAsaasPayment({ ASAAS_API_KEY:"test",ASAAS_API_URL:"https://api-sandbox.asaas.com/v3" },{ paymentId:"pay-missing" },fetcher))
      .resolves.toEqual({ cancelled:true,alreadyMissing:true });
  });
});

describe("conciliação de parcelas",() => {
  const payment = (number:number,value:number) => ({ id:`pay-${number}`,externalReference:"checkout-1",installment:"installment-1",installmentNumber:number,billingType:"CREDIT_CARD",value,dueDate:`2026-1${number}-01`,status:"PENDING" });
  it("aceita série íntegra e soma exata em centavos",() => {
    expect(() => validateAsaasPaymentSeries({ checkoutId:"checkout-1",method:"CREDIT_CARD",installmentCount:3,amountCents:10001,payments:[payment(1,33.33),payment(2,33.33),payment(3,33.35)] })).not.toThrow();
  });
  it("rejeita valor e sequência divergentes",() => {
    expect(() => validateAsaasPaymentSeries({ checkoutId:"checkout-1",method:"CREDIT_CARD",installmentCount:3,amountCents:10001,payments:[payment(1,33.33),payment(3,33.33),payment(4,33.35)] })).toThrow();
    expect(() => validateAsaasPaymentSeries({ checkoutId:"checkout-1",method:"CREDIT_CARD",installmentCount:3,amountCents:9999,payments:[payment(1,33.33),payment(2,33.33),payment(3,33.35)] })).toThrow();
  });
});

it('aceita os campos opcionais nulos do webhook real sem relaxar valor, ID ou status',async()=>{
 const {asaasWebhookSchema}=await import('@/server/integrations/asaas-webhook');
 const payload={id:'evt_synthetic',event:'PAYMENT_CREATED',dateCreated:null,payment:{id:'pay_synthetic',status:'PENDING',value:1200,externalReference:null,customer:'cus_synthetic',installment:null,installmentNumber:null,invoiceUrl:null,billingType:'PIX',dueDate:null,paymentDate:null,confirmedDate:null}};
 expect(asaasWebhookSchema.parse(payload).payment).toMatchObject({installment:undefined,paymentDate:undefined,value:1200,status:'PENDING'});
 for(const payment of [{...payload.payment,value:null},{...payload.payment,value:-1},{...payload.payment,status:null},{...payload.payment,id:''}])expect(asaasWebhookSchema.safeParse({...payload,payment}).success).toBe(false);
});
