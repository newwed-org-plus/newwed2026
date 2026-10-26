import {startLocalTunnel} from './local-tunnel';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';

let localSource=readFileSync('.dev.vars','utf8');
if(!parseEnv(localSource).LOCAL_CRON_TOKEN){
 localSource+=`\nLOCAL_CRON_TOKEN=${randomBytes(32).toString('hex')}\n`;
 writeFileSync('.dev.vars',localSource,{mode:0o600});
}
const cronToken=parseEnv(localSource).LOCAL_CRON_TOKEN;
if(!cronToken)throw new Error('Local cron credential unavailable');
if(process.env.CLOUDFLARE_ENV&&process.env.CLOUDFLARE_ENV!=='development')throw new Error('Local stack refuses staging/production');
const childEnv:NodeJS.ProcessEnv={...process.env,NEWWED_LOCAL_STACK:'1'};
delete childEnv.CLOUDFLARE_ENV;
// Keep children outside the terminal signal group until callback restoration finishes.
const child=spawn('vinext',['dev','--hostname','127.0.0.1','--port','4173'],{env:childEnv,stdio:'inherit',detached:true});
let stopping=false;
let ticking=false;
const tick=async()=>{
 if(ticking||stopping)return;
 ticking=true;
 try{
  const response=await fetch('http://127.0.0.1:4173/api/local/cron',{method:'POST',headers:{'x-local-cron-token':cronToken},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error();
  await response.body?.cancel();
 }catch{if(!stopping)console.error('Cron local aguardando runtime disponível.');}
 finally{ticking=false;}
};
let timer=setInterval(()=>void tick(),15000);
let tunnel:Awaited<ReturnType<typeof startLocalTunnel>>|undefined;
const starting=(async()=>{
 if(parseEnv(localSource).LOCAL_UAZAPI_CALLBACK!=='true')return;
 for(let attempt=0;attempt<60&&!stopping;attempt++){
  try{
   const response=await fetch('http://127.0.0.1:4173/admin/login',{signal:AbortSignal.timeout(5000)});
   await response.body?.cancel();
   if(response.ok)break;
  }catch{/* Local runtime can be restarting. */}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!stopping)tunnel=await startLocalTunnel();
})().catch(error=>console.error(error.message));
const stop=async()=>{
 if(stopping)return;
 stopping=true;clearInterval(timer);
 // A stop during setup must also restore any callback accepted during setup.
 await starting;
 const stopped=tunnel?await tunnel.stop():true;
 if(stopped)child.kill('SIGINT');
 else{stopping=false;timer=setInterval(()=>void tick(),15000);}
};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
child.on('exit',code=>{clearInterval(timer);void stop();process.exitCode=code??0;});
