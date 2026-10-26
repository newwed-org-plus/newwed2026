import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
export const localWorkerNames={commercial:'new-wed-local-events',receiver:'new-wed-local-receiver'} as const;
export function prepareLocalWorkers(root=process.cwd()) {
 const read=(path:string)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
 const app=read('wrangler.jsonc');
 if(app.vars.ENVIRONMENT!=='development'||app.d1_databases.some((db:{database_id:string;remote?:boolean})=>db.remote||!/^0{8}-/.test(db.database_id)))throw new Error('Local stack requires isolated development bindings');
 const source=readFileSync(resolve(root,'.dev.vars'),'utf8');
 const localPolicy=parseEnv(source);
 const commercialBilling=localPolicy.ENABLE_CHECKOUT==='true'||localPolicy.ENABLE_CONFIRMATION==='true';
 if(commercialBilling&&(localPolicy.LOCAL_TEST_MODE!=='true'||localPolicy.ASAAS_API_URL!=='https://api-sandbox.asaas.com/v3'||!localPolicy.ASAAS_API_KEY?.startsWith('$aact_hmlg_')||!String(localPolicy.LOCAL_WHATSAPP_ALLOWED_RECIPIENTS??'').split(',').some(value=>/^\d{10,15}$/.test(value.replace(/\D/g,'')))))throw new Error('Local billing requires Asaas Sandbox and an authorized test recipient');
 const receiverPolicy=['LOCAL_TEST_MODE','LOCAL_WHATSAPP_ALLOWED_RECIPIENTS'].filter(key=>localPolicy[key]!==undefined).map(key=>`${key}=${JSON.stringify(localPolicy[key])}\n`).join('');
 const base={ENVIRONMENT:'development',ENABLE_MANUAL_SEND:'true',ENABLE_AGENT:'true',ENABLE_FREE_AI_RETRY:'true',ENABLE_HISTORY_SYNC:'true',ENABLE_MESSAGE_STATUS_SYNC:'true',ENABLE_CHECKOUT:'false',ENABLE_CONFIRMATION:'false',ENABLE_EMAIL:'false'};
 for(const kind of ['commercial','receiver'] as const) {
  const folder=resolve(root,'.local-runtime',kind);mkdirSync(folder,{recursive:true,mode:0o700});
  const write=(path:string,value:string)=>{if(!existsSync(path)||readFileSync(path,"utf8")!==value)writeFileSync(path,value,{mode:0o600});};
  const sourceConfig=read(kind==='commercial'?'wrangler.events.jsonc':'wrangler.uazapi.jsonc');
  const queue=kind==='commercial'?'new-wed-events-development':'new-wed-uazapi-development';
  const config={name:localWorkerNames[kind],main:resolve(root,kind==='commercial'?'workers/local-events.ts':'workers/local-receiver.ts'),compatibility_date:app.compatibility_date,compatibility_flags:['nodejs_compat'],observability:sourceConfig.observability,vars:{...sourceConfig.vars,...base,...(kind==='commercial'?{ENABLE_CHECKOUT:localPolicy.ENABLE_CHECKOUT==='true'?'true':'false',ENABLE_CONFIRMATION:localPolicy.ENABLE_CONFIRMATION==='true'?'true':'false'}:{}),HISTORY_CRON_MESSAGE_BUDGET:'100'},d1_databases:app.d1_databases,queues:{producers:[{binding:'EVENTS_QUEUE',queue:'new-wed-events-development'},{binding:'UAZAPI_EVENTS_QUEUE',queue:'new-wed-uazapi-development'}],consumers:[{queue,max_batch_size:10,max_batch_timeout:1,max_retries:5,dead_letter_queue:`${queue}-dead`}]},triggers:{crons:['*/5 * * * *']}};
  config.d1_databases=config.d1_databases.map((db:Record<string,unknown>)=>({...db,migrations_dir:resolve(root,'migrations')}));
  write(resolve(folder,'wrangler.json'),JSON.stringify(config,null,2));
  write(resolve(folder,'.dev.vars'),kind==='commercial'?source:`ENABLE_AGENT=true\nENABLE_EMAIL=false\n${receiverPolicy}`);
 }
 return {services:[{binding:'LOCAL_EVENTS',service:localWorkerNames.commercial},{binding:'LOCAL_RECEIVER',service:localWorkerNames.receiver}],queues:{producers:[{binding:'EVENTS_QUEUE',queue:'new-wed-events-development'},{binding:'UAZAPI_EVENTS_QUEUE',queue:'new-wed-uazapi-development'}]},workers:[{configPath:resolve(root,'.local-runtime/commercial/wrangler.json'),viteEnvironment:{name:'commercial'},devOnly:true},{configPath:resolve(root,'.local-runtime/receiver/wrangler.json'),viteEnvironment:{name:'receiver'},devOnly:true}]};
}
