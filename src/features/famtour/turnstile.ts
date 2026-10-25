"use client";
declare global {
 interface Window {turnstile?:{render:(element:HTMLElement,options:Record<string,unknown>)=>string;execute:(id:string)=>void;reset:(id:string)=>void;remove:(id:string)=>void};}
}
type Widget={id:string;resolve?: (token:string)=>void;reject?:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>};
const widgets=new WeakMap<HTMLElement,Widget>();let scriptPromise:Promise<void>|undefined;
function loadScript() {
 if(window.turnstile)return Promise.resolve();
 if(!scriptPromise)scriptPromise=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
  script.onload=()=>window.turnstile?resolve():reject(new Error('A verificação de segurança não iniciou.'));
  script.onerror=()=>{script.remove();reject(new Error('Não foi possível carregar a verificação de segurança.'));};document.head.appendChild(script);
 }).catch(error=>{scriptPromise=undefined;throw error;});
 return scriptPromise;
}
export function resetTurnstile(element:HTMLElement|null) {
 const widget=element?widgets.get(element):undefined;if(!widget)return;
 clearTimeout(widget.timer);widget.resolve=undefined;widget.reject=undefined;window.turnstile?.reset(widget.id);
}
export function removeTurnstile(element:HTMLElement|null) {
 if(!element)return;const widget=widgets.get(element);if(!widget)return;
 clearTimeout(widget.timer);widget.reject?.(new Error('Verificação interrompida.'));window.turnstile?.remove(widget.id);widgets.delete(element);
}
export async function getTurnstileToken(element:HTMLElement|null):Promise<string|undefined> {
 const response=await fetch('/api/public/config');if(!response.ok)throw new Error('Não foi possível iniciar a verificação.');
 const config=await response.json() as {turnstileSiteKey?:string;leadSubmissionEnabled:boolean};
 if(!config.leadSubmissionEnabled)throw new Error('As inscrições estão temporariamente indisponíveis.');
 if(!config.turnstileSiteKey)return undefined;
 if(!element)throw new Error('A verificação de segurança não iniciou. Atualize a página.');await loadScript();
 let widget=widgets.get(element);
 if(!widget) {
  const state:Widget={id:''};widgets.set(element,state);
  const complete=(token?:string,error?:Error)=>{clearTimeout(state.timer);const resolve=state.resolve;const reject=state.reject;state.resolve=undefined;state.reject=undefined;if(error)reject?.(error);else if(token)resolve?.(token);};
  state.id=window.turnstile!.render(element,{sitekey:config.turnstileSiteKey,action:'public_lead',size:'flexible',execution:'execute',appearance:'interaction-only',callback:(token:string)=>complete(token),'error-callback':()=>complete(undefined,new Error('Falha na verificação. Tente novamente.')),'expired-callback':()=>complete(undefined,new Error('A verificação expirou. Tente novamente.'))});widget=state;
 }
 resetTurnstile(element);
 return new Promise<string>((resolve,reject)=>{
  widget.resolve=resolve;widget.reject=reject;widget.timer=setTimeout(()=>{widget.reject=undefined;widget.resolve=undefined;reject(new Error('A verificação demorou demais. Tente novamente.'));},120000);
  window.turnstile!.execute(widget.id);
 });
}
