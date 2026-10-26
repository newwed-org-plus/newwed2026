import {env} from 'cloudflare:workers';
import {requireAccessUser} from '@/server/auth/access';
import {requireSameOrigin} from '@/server/auth/session';
import {configuredInstance} from '@/server/integrations/uazapi';
import {getSecrets} from '@/server/secrets';
import {errorResponse,json} from '@/server/http';
import {historySyncStatus,startHistorySync} from '@/server/uazapi-history-sync';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {await requireAccessUser(request,['admin','gestor']);const {id}=await params;configuredInstance(getSecrets(),id);return json(await historySyncStatus(env,id));}catch(error){return errorResponse(error);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {const user=await requireAccessUser(request,['admin','gestor']);requireSameOrigin(request);const {id}=await params;return json(await startHistorySync({...env,...getSecrets()},id,user.id),{status:202});}catch(error){return errorResponse(error);}
}
