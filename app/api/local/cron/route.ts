import {env} from 'cloudflare:workers';
import {getSecrets} from '@/server/secrets';
import {timingSafeEqual} from '@/server/crypto';
type LocalBindings={LOCAL_EVENTS?:Fetcher;LOCAL_RECEIVER?:Fetcher};
export async function POST(request:Request) {
 const secrets=getSecrets();const host=new URL(request.url).hostname;
 if(env.ENVIRONMENT!=='development'||secrets.LOCAL_TEST_MODE!=='true'||!['127.0.0.1','localhost'].includes(host))return new Response(null,{status:404});
 if(!secrets.LOCAL_CRON_TOKEN||!timingSafeEqual(request.headers.get('x-local-cron-token')??'',secrets.LOCAL_CRON_TOKEN))return new Response(null,{status:403});
 const local=env as Env & LocalBindings;
 if(!local.LOCAL_RECEIVER||!local.LOCAL_EVENTS)return Response.json({error:'LOCAL_CONSUMERS_MISSING'},{status:503});
 for(const worker of [local.LOCAL_RECEIVER,local.LOCAL_EVENTS]){const result=await worker.fetch('http://local/__scheduled',{method:'POST'});if(!result.ok)return Response.json({error:'LOCAL_CRON_FAILED'},{status:503});}
 let inboundHost='';try{inboundHost=new URL(secrets.UAZAPI_WEBHOOK_BASE_URL??'').hostname;}catch{/* An unconfigured callback has no host. */}
 return Response.json({ok:true,inboundHost});
}
