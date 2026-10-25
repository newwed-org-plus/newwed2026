import { z } from "zod";

export const conversationModeSchema = z.enum(["AGENT", "HUMAN"]);
export type ConversationMode = z.infer<typeof conversationModeSchema>;

export const notificationDeliveryStatusSchema = z.enum(["PENDING", "SENT", "FAILED", "SEND_UNKNOWN"]);

export const manualMessageSchema = z.object({
  body:z.string().trim().min(1).max(1000),
}).strict();

export const agentResultSchema = z.object({
  reply:z.string().trim().min(1).max(1000),
  confidence:z.number().min(0).max(1),
  handoff:z.boolean(),
  reason:z.string().max(500),
}).strict();

export type AgentResult = z.infer<typeof agentResultSchema>;

const immediateHandoffPattern = /(comprar|compra|pagar|pagamento|pix|cart[aã]o|fechar|reclama|problema|atendente|humano|pessoa|vendedor)/i;

export function requiresImmediateHandoff(message: string) {
  return immediateHandoffPattern.test(message);
}

export function shouldSummarizeConversation(totalMessages: number,summarizedMessages: number) {
  return totalMessages - summarizedMessages >= 10 || (totalMessages > 40 && summarizedMessages === 0);
}
