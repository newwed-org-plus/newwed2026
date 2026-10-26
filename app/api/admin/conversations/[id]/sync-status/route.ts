import {env} from 'cloudflare:workers';
import {requireAccessUser} from '@/server/auth/access';
import {requireSameOrigin} from '@/server/auth/session';
import {getSecrets} from '@/server/secrets';
import {errorResponse,HttpError,json} from '@/server/http';
import {syncUazapiDelivery} from '@/server/uazapi-delivery';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try{
  await requireAccessUser(request);requireSameOrigin(request);const {id}=await params;
  if(String(env.ENABLE_MESSAGE_STATUS_SYNC)!=='true')throw new HttpError(503,'STATUS_SYNC_DISABLED','Consulta de entrega pausada neste ambiente.');
  const conversation=await env.DB.prepare('SELECT id FROM conversations WHERE id=?').bind(id).first();
  if(!conversation)throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversa não encontrada.');
  return json(await syncUazapiDelivery({...env,...getSecrets()},{conversationId:id,force:true}));
 }catch(error){return errorResponse(error);}
}
