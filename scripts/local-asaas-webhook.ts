import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {asaasRequest} from '../src/server/integrations/asaas';
type LocalEnv=Record<string,string|undefined>;
type Hook={id:string;name:string;url:string;enabled:boolean;interrupted?:boolean;events?:string[]};
type State={id?:string;url:string;name:string;enabled:boolean};
const name='Newwed Local Sandbox';
export const localAsaasEvents=['PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_PARTIALLY_REFUNDED'];
function validate(env:LocalEnv,url:string){
 if(env.LOCAL_TEST_MODE!=='true'||env.ASAAS_API_URL!=='https://api-sandbox.asaas.com/v3'||!env.ASAAS_API_KEY?.startsWith('$aact_hmlg_'))throw new Error('Webhook local Asaas exige credenciais Sandbox.');
 if(!env.ASAAS_WEBHOOK_TOKEN||env.ASAAS_WEBHOOK_TOKEN.length<32||env.ASAAS_WEBHOOK_TOKEN.length>255||/\s/.test(env.ASAAS_WEBHOOK_TOKEN))throw new Error('Token de webhook Asaas inválido.');
 const origin=new URL(url);if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin.origin)||origin.pathname!=='/api/webhooks/asaas'||origin.search||origin.hash||origin.username||origin.password)throw new Error('Destino de webhook local inválido.');
}
export async function ensureLocalAsaasWebhook(env:LocalEnv,url:string,email:string,previous:State|undefined,save:(state:State)=>void,fetcher:typeof fetch=fetch){
 validate(env,url);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Informe o e-mail operacional do webhook.');
 const response=await asaasRequest<{data:Hook[]}>(env,'/webhooks?limit=100',{},fetcher);
 let hook=previous?.id?response.data.find(h=>h.id===previous.id):response.data.find(h=>h.url===previous?.url&&h.name===name);
 if(hook&&(hook.name!==name||hook.url!==previous?.url&&hook.url!==url))throw new Error('O webhook Asaas foi alterado por outro operador.');
 if(hook?.interrupted)throw new Error('Revise a fila Asaas interrompida antes de reativar.');
 if(!hook&&response.data.some(h=>h.name===name))throw new Error('Revise o webhook Asaas existente antes de criar outro.');
 const body={name,url,email,enabled:true,interrupted:false,apiVersion:3,authToken:env.ASAAS_WEBHOOK_TOKEN,sendType:'SEQUENTIALLY',events:localAsaasEvents};
 // Persist intent before a create: an uncertain response is reconciled by list,
 // never by a second blind POST.
 if(!hook)save({url,name,enabled:false});
 const result=await asaasRequest<Hook>(env,hook?`/webhooks/${encodeURIComponent(hook.id)}`:'/webhooks',{method:hook?'PUT':'POST',body:JSON.stringify(body)},fetcher);
 if(!result.id||result.url!==url||!result.enabled)throw new Error('Webhook Asaas não confirmou a configuração.');
 hook=result;const state={id:hook.id,url,name,enabled:true};save(state);
 return state;
}
export async function disableOwnedAsaasWebhook(env:LocalEnv,state:State,fetcher:typeof fetch=fetch){
 validate(env,state.url);
 const id=state.id??(await asaasRequest<{data:Hook[]}>(env,'/webhooks?limit=100',{},fetcher)).data.find(hook=>hook.url===state.url&&hook.name===state.name)?.id;
 if(!id)return false;
 let hook:Hook;
 try{hook=await asaasRequest<Hook>(env,`/webhooks/${encodeURIComponent(id)}`,{},fetcher);}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='ASAAS_RESOURCE_NOT_FOUND')return false;throw error;}
 if(hook.url!==state.url||hook.name!==state.name)return false;
 if(hook.enabled){await asaasRequest<Hook>(env,`/webhooks/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({enabled:false})},fetcher);const check=await asaasRequest<Hook>(env,`/webhooks/${encodeURIComponent(id)}`,{},fetcher);if(check.enabled)throw new Error('Asaas ainda não confirmou a pausa do webhook.');}
 return true;
}
export async function startLocalAsaasWebhook(env:LocalEnv,origin:string){
 const url=`${origin}/api/webhooks/asaas`;validate(env,url);
 const profile=JSON.parse(readFileSync('.local-runtime/asaas-profile.json','utf8')) as {email:string};
 const file='.local-runtime/asaas-webhook.json';const previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')) as State:undefined;
 const state=await ensureLocalAsaasWebhook(env,url,profile.email,previous,value=>writeFileSync(file,JSON.stringify(value,null,2),{mode:0o600}));
 console.log('Webhook Asaas Sandbox vinculado ao localhost.');
 return state;
}

export async function stopSavedLocalAsaasWebhook(env:LocalEnv){
 const file='.local-runtime/asaas-webhook.json';if(!existsSync(file))return;
 const state=JSON.parse(readFileSync(file,'utf8')) as State;
 if(await disableOwnedAsaasWebhook(env,state))writeFileSync(file,JSON.stringify({...state,enabled:false},null,2),{mode:0o600});
}
