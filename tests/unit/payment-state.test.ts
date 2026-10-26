import { describe,expect,it } from "vitest";
import { resolveCheckoutStatus } from "@/features/billing/payment-state";

describe("eventos financeiros fora de ordem",() => {
  it("não rebaixa um pagamento confirmado por evento atrasado",() => {
    expect(resolveCheckoutStatus("PAID","PAYMENT_OVERDUE")).toBe("PAID");
    expect(resolveCheckoutStatus("PAID","PAYMENT_DELETED")).toBe("PAID");
  });
  it("aceita confirmação duplicada sem alterar o estado",() => expect(resolveCheckoutStatus("PAID","PAYMENT_CONFIRMED")).toBe("PAID"));
  it("permite estorno após confirmação",() => expect(resolveCheckoutStatus("PAID","PAYMENT_REFUNDED")).toBe("REFUNDED"));
  it("estorno em processamento não libera vaga e confirmação atrasada não reabre estorno",()=>{
    expect(resolveCheckoutStatus("PAID","PAYMENT_REFUND_IN_PROGRESS")).toBe("PAID");
    expect(resolveCheckoutStatus("PAID","PAYMENT_REFUND_REQUESTED")).toBe("PAID");
    expect(resolveCheckoutStatus("REFUNDED","PAYMENT_RECEIVED")).toBe("REFUNDED");
  });
  it("não confunde cobrança pendente com checkout enviado",() => {
    expect(resolveCheckoutStatus("CREATING","PAYMENT_PENDING")).toBe("CREATING");
    expect(resolveCheckoutStatus("READY","PAYMENT_PENDING")).toBe("READY");
  });
  it("aceita pagamento confirmado antes do envio",() => expect(resolveCheckoutStatus("READY","PAYMENT_RECEIVED")).toBe("PAID"));
});
