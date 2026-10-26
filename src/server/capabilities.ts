import {HttpError} from "./http";
export type Capability='publicLeads'|'manualSend'|'agent'|'checkout'|'confirmation'|'email';
const flags={publicLeads:'ENABLE_PUBLIC_LEADS',manualSend:'ENABLE_MANUAL_SEND',agent:'ENABLE_AGENT',checkout:'ENABLE_CHECKOUT',confirmation:'ENABLE_CONFIRMATION',email:'ENABLE_EMAIL'} as const;
type Settings=Partial<Record<(typeof flags)[Capability],string>>;
export function capabilityEnabled(env:Settings,capability:Capability) {return String(env[flags[capability]]??'false')==='true';}
export function requireCapability(env:Settings,capability:Capability) {
 if(!capabilityEnabled(env,capability))throw new HttpError(503,'CAPABILITY_DISABLED','Esta função está pausada. Aguarde a liberação pelo administrador.');
}
export function eventCapability(type:string):Capability|null {
 if(type==='conversation.manual.send')return 'manualSend';
 if(['conversation.reply.requested','conversation.summarize'].includes(type))return 'agent';
 if(['checkout.create','checkout.send','checkout.cancel'].includes(type))return 'checkout';
 if(type==='checkout.confirmation.send')return 'confirmation';
 if(type==='notification.email')return 'email';
 return null;
}
export function capabilities(env:Settings) {return Object.fromEntries((Object.keys(flags) as Capability[]).map(key=>[key,capabilityEnabled(env,key)])) as Record<Capability,boolean>;}
