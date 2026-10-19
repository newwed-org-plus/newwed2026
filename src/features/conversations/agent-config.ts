import { z } from "zod";

export const freeModelSchema = z.string().max(180).regex(/^(openrouter\/free|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+:free)$/);
export const agentConfigSchema = z.object({
  instanceId:z.string().regex(/^[a-z0-9-]{1,64}$/).nullable(),
  name:z.string().trim().min(1).max(80),
  instructions:z.string().trim().min(20).max(8000),
  model:freeModelSchema,
  enabled:z.boolean(),
  version:z.number().int().min(0),
}).strict();
export type AgentConfigInput = z.infer<typeof agentConfigSchema>;
export type WhatsAppAgent = { id:string;instance_id:string|null;name:string;instructions:string;model:string;enabled:number;version:number;updated_at:string };
export type FreeModel = { id:string;name:string };
export const defaultAgentInstructions = "Atenda em português com cordialidade pela New Wed. Apresente os projetos e ajude com dúvidas usando o catálogo disponível. Faça uma pergunta por vez. Quando faltar informação, encaminhe para a equipe. Nunca invente preços, vagas ou condições.";
