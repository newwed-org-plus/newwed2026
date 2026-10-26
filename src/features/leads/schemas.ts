import { z } from "zod";
import { pipelineStageSchema } from "@/features/pipeline/model";

const optionalText = z.string().trim().max(500).optional();

export const publicLeadSchema = z.object({
  nome: z.string().trim().min(3).max(160),
  email: z.string().trim().email().max(254),
  telefone: z.string().trim().min(10).max(24),
  instagram: optionalText,
  empresa: z.string().trim().min(1).max(160),
  cidade_estado: z.string().trim().min(2).max(160),
  famtour_id: optionalText,
  editionSlug: z.string().trim().min(1).max(160),
  respostas_brutas: z.record(z.string(), z.unknown()),
  lgpd: z.literal(true),
  consent: z.object({ version: z.string().min(1).max(40), accepted: z.literal(true) }),
  landingUrl: z.string().url().max(2048),
  referrer: z.string().url().max(2048).optional().or(z.literal("")),
  utm: z.object({
    utm_source: optionalText,
    utm_medium: optionalText,
    utm_campaign: optionalText,
    utm_content: optionalText,
    utm_term: optionalText,
  }).default({}),
  turnstileToken: z.string().optional(),
});

export const transitionSchema = z.object({
  stage: pipelineStageSchema,
  reason: z.string().trim().max(1000).optional(),
  nextAction: z.string().trim().max(200).optional(),
  nextActionAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((input,context) => {
  if ((input.stage === "PERDIDO" || input.stage === "CANCELADO") && !input.reason) {
    context.addIssue({ code:"custom",path:["reason"],message:"Informe o motivo desta etapa." });
  }
  if (input.stage === "NUTRICAO" && !input.nextAction) {
    context.addIssue({ code:"custom",path:["nextAction"],message:"Informe a próxima ação." });
  }
  if (input.stage === "NUTRICAO" && !input.nextActionAt) {
    context.addIssue({ code:"custom",path:["nextActionAt"],message:"Informe quando a próxima ação deve acontecer." });
  }
});

export const leadPatchSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(10).max(24).optional(),
  instagram: optionalText,
  company: optionalText,
  cityState: optionalText,
}).strict();

export const assignmentSchema = z.object({ userId: z.string().uuid() });

export const checkoutSchema = z.object({
  cpfCnpj:z.string().trim().min(1).max(24).optional(),
  conversationId:z.string().min(1).max(256).optional(),
  editionId: z.string().min(1),
  priceBatchId: z.string().min(1),
  method: z.enum(["PIX", "CREDIT_CARD"]),
  installmentCount: z.number().int().min(1).max(12).default(1),
  dueDate: z.string().date().optional(),
}).strict().superRefine((input,context) => {
  if (input.method === "PIX" && input.installmentCount !== 1) {
    context.addIssue({ code:"custom",path:["installmentCount"],message:"Pix deve ser cobrado em uma única parcela." });
  }
});
