import type {Connect,Plugin} from 'vite';

export function isLocalRuntimeTransportError(error:unknown):boolean {
 if(!error||typeof error!=='object')return false;
 const value=error as {message?:unknown;code?:unknown;cause?:unknown;errors?:unknown[]};
 if(typeof value.code==='string'&&['ECONNREFUSED','ECONNRESET','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(value.code))return true;
 if(value.message==='fetch failed')return true;
 return Boolean(value.cause&&isLocalRuntimeTransportError(value.cause)||value.errors?.some(isLocalRuntimeTransportError));
}
export const localRuntimeErrorHandler:Connect.ErrorHandleFunction=(error,request,response,next)=>{
 if(!isLocalRuntimeTransportError(error)||response.headersSent)return next(error);
 const api=request.url?.startsWith('/api/');
 response.statusCode=503;response.setHeader('retry-after','1');response.setHeader('cache-control','no-store');
 response.setHeader('content-type',api?'application/json; charset=utf-8':'text/html; charset=utf-8');
 response.end(api?JSON.stringify({code:'LOCAL_RUNTIME_UNAVAILABLE',message:'O ambiente local está reiniciando. Aguarde alguns segundos e atualize os dados.'}):'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Ambiente local reiniciando</title><body><p>O ambiente local está reiniciando. Aguarde alguns segundos e atualize a página.</p><p>Se você acabou de enviar uma mensagem, confira o histórico antes de reenviar.</p><button onclick="location.reload()">Atualizar página</button></body></html>');
};
export function localRuntimeErrors():Plugin {
 return {name:'newwed-local-runtime-errors',enforce:'post',apply:'serve',configureServer(server){
  // Register after the Cloudflare request handler and before Vite's error overlay.
  return ()=>{server.middlewares.use(localRuntimeErrorHandler);};
 }};
}
