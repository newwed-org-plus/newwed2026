import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getSecrets} from '@/server/secrets';
import {timingSafeEqual} from '@/server/crypto';
import {readJsonWithLimit} from '@/server/request-context';
import {errorResponse} from '@/server/http';
import {configuredInstance} from '@/server/integrations/uazapi';
import {acceptUazapiWebhook,uazapiHistoryMessageSchema} from '@/server/uazapi-webhook';
const inputSchema=z.object({lineId:z.string().max(64),chats:z.array(z.object({phone:z.string().regex(/^\d{10,15}$/),name:z.string().max(200).nullable(),timestamp:z.union([z.number(),z.string()]).nullish()})).max(100).optional(),messages:z.array(uazapiHistoryMessageSchema).max(100).optional()}).strict();
export async function POST(request:Request) {
 const secrets=getSecrets();
 if(env.ENVIRONMENT!=='development'||secrets.LOCAL_TEST_MODE!=='true'||!['localhost','127.0.0.1'].includes(new URL(request.url).hostname))return new Response(null,{status:404});
 if(!secrets.LOCAL_CRON_TOKEN||!timingSafeEqual(request.headers.get('x-local-cron-token')??'',secrets.LOCAL_CRON_TOKEN))return new Response(null,{status:403});
 try {
  const input=inputSchema.parse(await readJsonWithLimit(request,1024*1024));const instance=configuredInstance(secrets,input.lineId);const now=new Date().toISOString();
  for(let offset=0;offset<(input.chats?.length??0);offset+=10)await env.DB.batch(input.chats!.slice(offset,offset+10).map(chat=>{
   const number=Number(chat.timestamp);const timestamp=Number.isFinite(number)&&number>0?new Date(number<1e11?number*1000:number).toISOString():null;
   return env.DB.prepare(`INSERT INTO conversations(id,channel,external_id,whatsapp_instance_id,contact_phone,contact_name,mode,human_active,last_message_at,created_at,updated_at)
    VALUES (?,'whatsapp',?,?,?,?,'HUMAN',1,?,?,?) ON CONFLICT(channel,external_id) DO UPDATE SET contact_name=coalesce(excluded.contact_name,conversations.contact_name),last_message_at=CASE WHEN excluded.last_message_at IS NULL THEN conversations.last_message_at ELSE max(coalesce(conversations.last_message_at,''),excluded.last_message_at) END,updated_at=excluded.updated_at`).bind(crypto.randomUUID(),`${input.lineId}:${chat.phone}`,input.lineId,chat.phone,chat.name||null,timestamp,timestamp??now,now);
  }));
  if(input.messages?.length)await acceptUazapiWebhook({...env,...secrets},input.lineId,{token:instance.token,EventType:'history',event:'messages',messages:input.messages},crypto.randomUUID());
  return Response.json({accepted:true});
 }catch(error){return errorResponse(error);}
}
