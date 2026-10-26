import {afterEach,describe,expect,it} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer,type Server} from 'node:http';
import {once} from 'node:events';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function listen(server:Server){server.listen(0,'127.0.0.1');await once(server,'listening');cleanup.push(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');return address.port;}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;child.kill('SIGTERM');await once(child,'exit');}
async function setup(allow:boolean){
 const calls:Array<{path:string;headers:Record<string,unknown>;body:string}>=[];
 const upstream=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);calls.push({path:req.url??'',headers:req.headers,body:Buffer.concat(chunks).toString()});res.writeHead(202,{'content-type':'application/json'}).end('{"accepted":true}');});
 const appPort=await listen(upstream);
 const child=spawn(process.execPath,['scripts/local-webhook-bridge.mjs'],{env:{...process.env,LOCAL_WEBHOOK_PORT:'0',LOCAL_APP_PORT:String(appPort),LOCAL_UAZAPI_LINE:'synthetic',LOCAL_ASAAS_WEBHOOK:String(allow)},stdio:['ignore','pipe','pipe']});
 cleanup.push(()=>stop(child));
 // The bridge announces its OS-assigned port for tests without exposing secrets.
 const port=await new Promise<number>((resolve,reject)=>{child.once('exit',()=>reject(new Error('Bridge stopped')));child.stdout!.on('data',chunk=>{const match=String(chunk).match(/porta (\d+)/);if(match)resolve(Number(match[1]));});});
 return {origin:`http://127.0.0.1:${port}`,calls};
}
describe('ponte pública restrita de webhooks',()=>{
 it('encaminha Asaas com token próprio e bloqueia painel, query e GET',async()=>{
  const {origin,calls}=await setup(true);
  const response=await fetch(origin+'/api/webhooks/asaas',{method:'POST',headers:{'asaas-access-token':'synthetic-auth',token:'must-not-forward','x-uazapi-token':'must-not-forward','content-type':'application/json'},body:'{}'});
  expect(response.status).toBe(202);expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({path:'/api/webhooks/asaas',headers:{'asaas-access-token':'synthetic-auth'},body:'{}'});expect(calls[0].headers).not.toHaveProperty('token');expect(calls[0].headers).not.toHaveProperty('x-uazapi-token');
  for(const path of ['/admin','/api/webhooks/asaas','/api/webhooks/asaas?debug=1'])expect((await fetch(origin+path)).status).toBe(404);
  expect((await fetch(origin+'/api/webhooks/asaas',{method:'POST',body:'x'.repeat(128*1024+1)})).status).toBe(413);expect(calls).toHaveLength(1);
 });
 it('mantém UAZAPI e não expõe Asaas com função desligada',async()=>{
  const {origin,calls}=await setup(false);
  expect((await fetch(origin+'/api/webhooks/asaas',{method:'POST',body:'{}'})).status).toBe(404);
  expect((await fetch(origin+'/api/webhooks/uazapi/synthetic',{headers:{token:'synthetic-uazapi','asaas-access-token':'must-not-forward'}})).status).toBe(202);
  expect(calls).toHaveLength(1);expect(calls[0].headers.token).toBe('synthetic-uazapi');expect(calls[0].headers).not.toHaveProperty('asaas-access-token');
 });
});
