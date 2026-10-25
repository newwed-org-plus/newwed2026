import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,openSync,closeSync,rmSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {get as httpsGet} from 'node:https';
type Hook={id?:string;url:string;enabled?:boolean;events?:string[];excludeMessages?:string[];addUrlEvents?:boolean;addUrlTypesMessages?:boolean};
function hooks(value:unknown):Hook[]{if(Array.isArray(value))return value as Hook[];if(value&&typeof value==='object'&&'url' in value)return [value as Hook];throw new Error('Formato do webhook não reconhecido.');}
function project(hook:Hook){return Object.fromEntries(['id','enabled','url','events','excludeMessages','addUrlEvents','addUrlTypesMessages'].filter(key=>key in hook).map(key=>[key,hook[key as keyof Hook]]));}
async function tunnelStatus(url:string) {
 try {const response=await fetch(url,{signal:AbortSignal.timeout(5000)});await response.body?.cancel();return response.status;}catch{/* Verify with an independent resolver when the local network cannot resolve/reach the new name yet. */}
 // Newly issued quick-tunnel names can be negatively cached by the local DNS.
 // Resolve only this public hostname through Cloudflare, retaining TLS validation/SNI.
 const host=new URL(url).hostname;if(!/^[a-z0-9-]+\.trycloudflare\.com$/.test(host))throw new Error('Destino de verificação inválido.');
 const results=await Promise.allSettled(['AAAA','A'].map(async type=>{const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=${type}`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});return await response.json() as {Answer?:{type:number;data:string}[]};}));
 const addresses=results.flatMap(result=>result.status==='fulfilled'?result.value.Answer??[]:[]).filter(answer=>answer.type===28&&/^[a-fA-F0-9:]+$/.test(answer.data)||answer.type===1&&/^\d{1,3}(\.\d{1,3}){3}$/.test(answer.data));
 for(const answer of addresses){const family=answer.type===28?6:4;try{return await new Promise<number>((resolve,reject)=>{const request=httpsGet(url,{family,lookup:(_host,_options,callback)=>callback(null,answer.data,family)},result=>{result.resume();resolve(result.statusCode??0);});request.setTimeout(5000,()=>request.destroy(new Error('Verificação do túnel excedeu o prazo.')));request.on('error',reject);});}catch{/* Try the other address family when this network cannot reach one. */}}
 throw new Error('DNS ou transporte do túnel ainda indisponível.');
}
export async function restoreOwnedWebhook(current:Hook[],original:Hook,ownedUrl:string,update:(body:unknown)=>Promise<unknown>) {
 const owned=current.find(hook=>hook.url===ownedUrl);if(!owned)return false;
 await update({...project(original),id:owned.id});return true;
}
export async function startLocalTunnel() {
 const env=parseEnv(readFileSync('.dev.vars','utf8'));if(env.LOCAL_TEST_MODE!=='true')throw new Error('Túnel restrito ao perfil local.');
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));if(config.vars.ENVIRONMENT!=='development'||config.d1_databases.some((db:{database_id:string})=>!/^0{8}-/.test(db.database_id)))throw new Error('Túnel exige banco local.');
 const lineId=env.LOCAL_UAZAPI_LINE??'atendimento';const instance=JSON.parse(env.UAZAPI_INSTANCES??'[]').find((line:{id:string})=>line.id===lineId);if(!instance?.baseUrl||!existsSync('.local-runtime/bin/cloudflared'))throw new Error('Configure a linha e instale cloudflared com npm run local:tunnel:install.');
 const provider=async(method:string,body?:unknown)=>{const response=await fetch(new URL('/webhook',instance.baseUrl),{method,headers:{token:instance.token,'content-type':'application/json'},body:body?JSON.stringify({action:'update',...body as object}):undefined,signal:AbortSignal.timeout(15000),redirect:'manual'});if(!response.ok){await response.body?.cancel();throw new Error('Operação de webhook recusada.');}return response.json();};
 let bridge:ChildProcess|undefined;let tunnel:ChildProcess|undefined;let ownedUrl='';let closing=false;let original:Hook|undefined;let stage='consulta do callback';
 const stop=async()=>{
  if(closing)return false;closing=true;
  if(ownedUrl&&original){try{const current=hooks(await provider('GET'));const restored=await restoreOwnedWebhook(current,original,ownedUrl,body=>provider('POST',body));if(restored){const confirmed=hooks(await provider('GET')).some(hook=>hook.url===original!.url&&hook.enabled===original!.enabled);if(!confirmed)throw new Error('Callback anterior ainda não confirmado.');console.log('Callback anterior restaurado.');}const target=restored?original.url:current[0]?.url;if(target){const source=readFileSync('.dev.vars','utf8').replace(/^UAZAPI_WEBHOOK_BASE_URL=.*$/m,`UAZAPI_WEBHOOK_BASE_URL=${new URL(target).origin}`);writeFileSync('.dev.vars',source,{mode:0o600});}}catch{writeFileSync('.local-runtime/restore-pending','true',{mode:0o600});console.error('Restauração pendente do callback; mantenha o ambiente ativo e tente encerrar novamente.');closing=false;return false;}}
  rmSync('.local-runtime/restore-pending',{force:true});tunnel?.kill('SIGINT');bridge?.kill('SIGINT');return true;
 };
 try {
  const current=hooks(await provider('GET'));if(current.length!==1)throw new Error('Revise os webhooks da linha antes de ativar o local.');
  const previousOrigin=existsSync('.local-runtime/tunnel-origin')?readFileSync('.local-runtime/tunnel-origin','utf8'):'';
  const previousBackup=existsSync('.local-runtime/webhook-backup.json')?hooks(JSON.parse(readFileSync('.local-runtime/webhook-backup.json','utf8')))[0]:undefined;
  original=previousBackup&&previousOrigin&&current[0].url.startsWith(previousOrigin)?previousBackup:current[0];
  writeFileSync('.local-runtime/webhook-backup.json',JSON.stringify([original]),{mode:0o600});
  stage='inicialização do túnel';
  bridge=spawn(process.execPath,['scripts/local-webhook-bridge.mjs'],{env:{...process.env,LOCAL_WEBHOOK_PORT:'4175',LOCAL_UAZAPI_LINE:lineId},stdio:'ignore',detached:true});
  const log='.local-runtime/tunnel-owned.log';writeFileSync(log,'',{mode:0o600});const fd=openSync(log,'a');tunnel=spawn('.local-runtime/bin/cloudflared',['tunnel','--url','http://127.0.0.1:4175','--no-autoupdate','--protocol','http2'],{stdio:['ignore',fd,fd],detached:true});closeSync(fd);
  let origin='';for(let attempt=0;attempt<100&&!origin;attempt++){await new Promise(resolve=>setTimeout(resolve,300));origin=readFileSync(log,'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]??'';if(tunnel.exitCode!==null||bridge.exitCode!==null)throw new Error('Túnel local não iniciou.');}
  if(!origin)throw new Error('Túnel local indisponível.');
  ownedUrl=`${origin}/api/webhooks/uazapi/${lineId}`;
  stage='verificação pública do receptor';
  let ready=false;for(let attempt=0;attempt<120&&!ready;attempt++){try{ready=await tunnelStatus(ownedUrl)===200;}catch{/* Local runtime or DNS can be starting. */}if(!ready)await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw new Error('Receptor local não respondeu; callback preservado.');
  stage='isolamento público do painel';
  if(await tunnelStatus(`${origin}/admin`)!==404)throw new Error('O túnel deve expor somente o webhook.');
  stage='atualização do runtime local';
  let source=readFileSync('.dev.vars','utf8');source=source.replace(/^UAZAPI_WEBHOOK_BASE_URL=.*$/m,`UAZAPI_WEBHOOK_BASE_URL=${origin}`);writeFileSync('.dev.vars',source,{mode:0o600});
  let runtimeReady=false;for(let attempt=0;attempt<30&&!runtimeReady;attempt++){try{const response=await fetch('http://127.0.0.1:4173/api/local/cron',{method:'POST',headers:{'x-local-cron-token':env.LOCAL_CRON_TOKEN??''},signal:AbortSignal.timeout(15000)});const result=await response.json() as {inboundHost?:string};runtimeReady=response.ok&&result.inboundHost===new URL(origin).hostname;}catch{/* Local runtime can be restarting. */}if(!runtimeReady)await new Promise(resolve=>setTimeout(resolve,500));}
  if(!runtimeReady)throw new Error('Runtime local ainda não aplicou o novo destino.');
  stage='ativação do callback';
  await provider('POST',{...project(current[0]),enabled:true,url:ownedUrl,events:Array.from(new Set([...(current[0].events??[]),'connection','messages','messages_update','history'])),addUrlEvents:false,addUrlTypesMessages:false});
  if(!hooks(await provider('GET')).some(hook=>hook.enabled&&hook.url===ownedUrl))throw new Error('Callback local não confirmado.');
  writeFileSync('.local-runtime/tunnel-origin',origin,{mode:0o600});console.log('Linha UAZAPI direcionada ao receptor local; callback anterior será restaurado ao encerrar.');
  tunnel.once('exit',()=>{if(!closing)void stop();});return {stop};
 }catch{await stop();throw new Error(`Callback local não ativado na etapa: ${stage}.`);}
}
