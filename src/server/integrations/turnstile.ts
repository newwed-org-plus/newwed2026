import {z} from "zod";
import {env} from "cloudflare:workers";
import {HttpError} from "@/server/http";
import {getSecrets} from "@/server/secrets";
import {readJsonWithLimit} from "@/server/request-context";
export async function verifyTurnstile(token:string|undefined,ip:string|null) {
 const secrets=getSecrets();const secret=secrets.TURNSTILE_SECRET??secrets.TURNSTILE_SECRET_KEY;
 if(!secret) {if(env.ENVIRONMENT==='development')return;throw new HttpError(503,'TURNSTILE_NOT_CONFIGURED','Verificação temporariamente indisponível.');}
 const hosts=String(env.TURNSTILE_HOSTNAMES??'').split(',').map(host=>host.trim()).filter(Boolean);
 if(!hosts.length||(env.ENVIRONMENT==='production'&&hosts.some(host=>['localhost','127.0.0.1'].includes(host))))throw new HttpError(503,'TURNSTILE_NOT_CONFIGURED','Verificação temporariamente indisponível.');
 if(!token||token.length>2048)throw new HttpError(400,'TURNSTILE_REQUIRED','Confirme a verificação de segurança.');
 let result:{success?:boolean;action?:string;hostname?:string};
 try {
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:token,...(ip?{remoteip:ip}:{})}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error();result=z.object({success:z.boolean(),action:z.string().optional(),hostname:z.string().optional()}).parse(await readJsonWithLimit(response,16384));
 } catch {throw new HttpError(503,'TURNSTILE_UNAVAILABLE','A verificação não respondeu. Tente novamente.');}
 if(result.success!==true||result.action!=='public_lead'||!hosts.includes(result.hostname??''))throw new HttpError(400,'TURNSTILE_FAILED','Não foi possível confirmar a verificação de segurança.');
}
