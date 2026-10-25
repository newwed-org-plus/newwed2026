import { z } from "zod";

export const checkoutStateSchema = z.enum([
  "CREATING",
  "READY",
  "SEND_PENDING",
  "SENT",
  "PENDING",
  "PAID",
  "FAILED",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
]);

export type CheckoutState = z.infer<typeof checkoutStateSchema>;

const transitions: Record<CheckoutState, readonly CheckoutState[]> = {
  CREATING: ["READY", "PAID", "FAILED", "OVERDUE", "CANCELLED", "REFUNDED"],
  READY: ["SEND_PENDING", "PAID", "FAILED", "OVERDUE", "CANCELLED", "REFUNDED"],
  SEND_PENDING: ["SENT", "PAID", "FAILED", "OVERDUE", "CANCELLED", "REFUNDED"],
  SENT: ["PENDING", "PAID", "FAILED", "OVERDUE", "CANCELLED", "REFUNDED"],
  PENDING: ["PAID", "OVERDUE", "CANCELLED", "REFUNDED"],
  PAID: ["REFUNDED"],
  FAILED: ["CREATING", "SEND_PENDING", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED", "REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionCheckout(from: CheckoutState, to: CheckoutState): boolean {
  return from === to || transitions[from].includes(to);
}

export function assertCheckoutTransition(from: CheckoutState, to: CheckoutState): void {
  if (!canTransitionCheckout(from, to)) {
    throw new Error(`Transição de checkout inválida: ${from} → ${to}`);
  }
}

export const checkoutFinancialStatusSchema = z.enum([
  "NOT_STARTED",
  "PENDING",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
]);

export const checkoutSendStatusSchema = z.enum([
  "NOT_REQUESTED",
  "PENDING",
  "ACCEPTED",
  "DELIVERED",
  "FAILED",
  "UNKNOWN",
]);
