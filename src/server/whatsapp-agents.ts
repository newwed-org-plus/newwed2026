import { agentConfigSchema,type AgentConfigInput,type WhatsAppAgent } from "@/features/conversations/agent-config";
import { HttpError } from "@/server/http";
import { answerWithOpenRouter,listFreeModels } from "@/server/integrations/openrouter";
import { configuredInstance } from "@/server/integrations/uazapi";
import type { RuntimeSecrets } from "@/server/secrets";
import { ensureWhatsAppLines,listWhatsAppLines } from "@/server/whatsapp-lines";
import {recoveryEnabled} from './ai-availability';
import {verifiedSiteAnswer} from './site-knowledge';

type AgentEnv = Env & RuntimeSecrets;
const fields="id,instance_id,name,instructions,model,enabled,version,updated_at";
export async function getLineAgent(env:Pick<Env,"DB">,id:string) {
  return env.DB.prepare(`SELECT ${fields} FROM whatsapp_agents WHERE instance_id=?`).bind(id).first<WhatsAppAgent>();
}
async function getAgent(env:Pick<Env,"DB">,id:string) {
  return env.DB.prepare(`SELECT ${fields} FROM whatsapp_agents WHERE id=?`).bind(id).first<WhatsAppAgent>();
}
export async function listLineAgents(env:AgentEnv) {
  const lines = await listWhatsAppLines(env);
  const agents = await env.DB.prepare(`SELECT ${fields} FROM whatsapp_agents ORDER BY created_at,id`).all<WhatsAppAgent>();
  return {configured:Boolean(env.OPENROUTER_API_KEY),lines,items:agents.results};
}
export async function saveLineAgent(env:AgentEnv,id:string,input:AgentConfigInput,actorId:string,fetcher:typeof fetch = fetch) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new HttpError(422,"INVALID_AGENT_ID","Identificador inválido.");
  const data = agentConfigSchema.parse(input);
  if (data.instanceId) configuredInstance(env,data.instanceId);
  if (data.enabled && !data.instanceId) throw new HttpError(409,"AGENT_LINE_REQUIRED","Selecione uma linha WhatsApp antes de ativar o atendente.");
  if (data.enabled && !env.OPENROUTER_API_KEY) throw new HttpError(503,"OPENROUTER_NOT_CONFIGURED","Configure a chave OpenRouter no servidor antes de ativar o atendente.");
  if (data.enabled && !(await listFreeModels(fetcher)).some(model=>model.id===data.model)) throw new HttpError(409,"FREE_MODEL_UNAVAILABLE","Modelo gratuito indisponível. Atualize a lista.");
  await ensureWhatsAppLines(env);
  const before=await getAgent(env,id);
  if (data.instanceId) {
    const assigned=await getLineAgent(env,data.instanceId);
    if (assigned && assigned.id!==id) throw new HttpError(409,"AGENT_LINE_IN_USE","Esta linha já possui um atendente. Edite ou desvincule o atendente atual.");
  }
  const now = new Date().toISOString();
  let updated:D1Result;
  try {
    [updated] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO whatsapp_agents (id,instance_id,name,instructions,model,enabled,version,updated_by,created_at,updated_at)
        SELECT ?,?,?,?,?,?,1,?,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM whatsapp_agents WHERE id=?)
        ON CONFLICT(id) DO UPDATE SET instance_id=excluded.instance_id,name=excluded.name,instructions=excluded.instructions,model=excluded.model,enabled=excluded.enabled,
        version=whatsapp_agents.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE whatsapp_agents.version=?`)
        .bind(id,data.instanceId,data.name,data.instructions,data.model,data.enabled?1:0,actorId,now,now,data.version,id,data.version),
      env.DB.prepare(`INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,after_json,created_at)
        SELECT ?,?,'whatsapp.agent.save','whatsapp_agent',?,?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(),actorId,id,JSON.stringify({instanceId:data.instanceId,model:data.model,enabled:data.enabled,version:data.version+1}),now),
      env.DB.prepare(`UPDATE conversations SET mode='HUMAN',human_active=1,agent_paused_at=coalesce(agent_paused_at,?),updated_at=?
        WHERE whatsapp_instance_id=? AND mode='AGENT' AND EXISTS (SELECT 1 FROM whatsapp_agents WHERE id=? AND version=? AND (enabled=0 OR instance_id IS NULL OR instance_id!=?))`)
        .bind(now,now,before?.instance_id??null,id,data.version+1,before?.instance_id??null),
    ]);
  } catch { throw new HttpError(409,"AGENT_SAVE_CONFLICT","Não foi possível salvar. Atualize a configuração e confira a linha selecionada."); }
  if (!updated.meta.changes) throw new HttpError(409,"AGENT_CONFIG_CHANGED","A configuração mudou. Atualize antes de salvar novamente.");
  return getAgent(env,id);
}
export async function previewLineAgent(env:AgentEnv,id:string,message:string,fetcher:typeof fetch = fetch) {
  const agent = await getAgent(env,id);
  if (!agent) throw new HttpError(409,"AGENT_NOT_CONFIGURED","Salve a configuração antes de testar.");
  return recoveryEnabled(env)&&verifiedSiteAnswer(message)||answerWithOpenRouter(env,{...agent,message,context:{test:true,catalog:[],lead:null,summary:null,recentMessages:[]}},fetcher);
}
