import {HttpError} from './http';
export class OpenRouterDeferred extends HttpError {
 constructor(public retryAt:string,public scope:'account'|'model'|'local',code='OPENROUTER_HTTP_429') {
  super(503,code,'Aguardando disponibilidade de um modelo gratuito. A resposta será retomada automaticamente.');
 }
}
export function rateLimitError(status:number,headers:Headers,payload:unknown,now=Date.now()) {
 const error=(payload&&typeof payload==='object'?(payload as {error?:{message?:unknown;metadata?:Record<string,unknown>}}).error:undefined);
 const message=typeof error?.message==='string'?error.message:'';const meta=error?.metadata??{};
 const daily=/free.models.per.day|daily|per.day/i.test(message);
 const upstream=/upstream|provider/i.test(message)||typeof meta.provider_name==='string'&&meta.provider_name.toLowerCase()!=='openrouter';
 const scope=status===429?(upstream&&!daily?'model':'account'):'model';
 const raw=headers.get('retry-after');const seconds=raw!==null?Number(raw):NaN;
 let next=Number.isFinite(seconds)&&seconds>0?now+seconds*1000:raw?Date.parse(raw):NaN;
 const reset=Number(headers.get('x-ratelimit-reset'));if(!Number.isFinite(next)&&reset>0)next=reset<1e12?reset*1000:reset;
 if(!Number.isFinite(next)||next<=now)next=daily?Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate()+1)+1000:now+60000;
 return new OpenRouterDeferred(new Date(Math.max(now+1000,Math.min(now+7*86400000,next))).toISOString(),scope,`OPENROUTER_HTTP_${status}`);
}
type AvailabilityEnv={DB?:D1Database;ENABLE_FREE_AI_RETRY?:string};
export function recoveryEnabled(env:AvailabilityEnv){return String(env.ENABLE_FREE_AI_RETRY)==='true';}
export async function getCooldown(env:AvailabilityEnv,scope:string){
 if(!env.DB||!recoveryEnabled(env))return null;
 const row=await env.DB.prepare('SELECT available_at,error_code FROM ai_provider_cooldowns WHERE scope=?').bind(scope).first<{available_at:string;error_code:string}>();
 return row&&Date.parse(row.available_at)>Date.now()?row:null;
}
export async function setCooldown(env:AvailabilityEnv,scope:string,error:OpenRouterDeferred){
 if(!env.DB||!recoveryEnabled(env))return;
 await env.DB.prepare(`INSERT INTO ai_provider_cooldowns(scope,available_at,error_code,updated_at) VALUES(?,?,?,?)
  ON CONFLICT(scope) DO UPDATE SET available_at=max(ai_provider_cooldowns.available_at,excluded.available_at),error_code=excluded.error_code,updated_at=excluded.updated_at`)
  .bind(scope,error.retryAt,error.code,new Date().toISOString()).run();
}
export async function paceFreeRequest(env:AvailabilityEnv){
 if(!env.DB||!recoveryEnabled(env))return;
 for(let attempt=0;attempt<2;attempt++){
  const now=new Date().toISOString();const next=new Date(Date.now()+4000).toISOString();
  const acquired=await env.DB.prepare(`INSERT INTO ai_provider_cooldowns(scope,available_at,error_code,updated_at) VALUES('openrouter:pace',?,'OPENROUTER_LOCAL_PACING',?)
   ON CONFLICT(scope) DO UPDATE SET available_at=excluded.available_at,updated_at=excluded.updated_at WHERE ai_provider_cooldowns.available_at<=?`).bind(next,now,now).run();
  if(acquired.meta.changes)return;
  const pending=await getCooldown(env,'openrouter:pace');const until=pending?.available_at??next;
  const delay=Date.parse(until)-Date.now();if(attempt===0&&delay>0&&delay<=4500){await new Promise(resolve=>setTimeout(resolve,delay+20));continue;}
  throw new OpenRouterDeferred(until,'local','OPENROUTER_LOCAL_PACING');
 }
}
