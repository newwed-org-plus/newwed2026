import { checkoutStateSchema,type CheckoutState } from "@/features/billing/checkout-state";

export type PaymentStatus = "PENDING"|"OVERDUE"|"CANCELLED"|"PAID"|"REFUNDED";

export function resolveCheckoutStatus(currentValue: string,event: string): CheckoutState {
  const current = checkoutStateSchema.parse(currentValue);
  if(current==="REFUNDED")return current;
  if(event==="PAYMENT_REFUNDED")return "REFUNDED";
  if (["PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_RECEIVED_IN_CASH"].includes(event)) return "PAID";
  if (current === "PAID") return current;
  if (["PAYMENT_DELETED","PAYMENT_CANCELLED","PAYMENT_CREDIT_CARD_CAPTURE_REFUSED"].includes(event)) return "CANCELLED";
  if (event === "PAYMENT_OVERDUE") return current === "SENT" || current === "PENDING" ? "OVERDUE" : current;
  if (event === "PAYMENT_PENDING") return current === "SENT" ? "PENDING" : current;
  return current;
}
