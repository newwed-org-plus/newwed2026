import {describe,it,expect,vi} from 'vitest';
import {asaasRequest} from '@/server/integrations/asaas';
import {ensureLocalAsaasWebhook,disableOwnedAsaasWebhook,localAsaasEvents} from '../../scripts/local-asaas-webhook';
const env={LOCAL_TEST_MODE:'true',ASAAS_API_URL:'https://api-sandbox.asaas.com/v3',ASAAS_API_KEY:'$aact_hmlg_synthetic',ASAAS_WEBHOOK_TOKEN:'a'.repeat(64)};
const url='https://synthetic.trycloudflare.com/api/webhooks/asaas';
const state={id:'hook_1',url,name:'Newwed Local Sandbox',enabled:true};
function api(responses:unknown[]){const calls:Array<{url:string;init:RequestInit}> = [];return {calls,fetcher:(async(value,init={})=>{calls.push({url:String(value),init});const response=responses.shift();if(response instanceof Error)throw response;if(response instanceof Response)return response;return Response.json(response);}) as typeof fetch};}
describe('Asaas com origem e transporte protegidos',()=>{
 it.each([
  {...env,ASAAS_API_URL:'https://untrusted.example/v3'},
  {...env,ASAAS_API_URL:'https://api.asaas.com/v3'},
  {...env,ASAAS_API_KEY:'$aact_prod_synthetic'},
 ])('bloqueia origem ou chave incompatível antes de enviar',async input=>{
  const fetcher=vi.fn();await expect(asaasRequest(input,'/webhooks',{},fetcher)).rejects.toMatchObject({status:503});expect(fetcher).not.toHaveBeenCalled();
 });
 it('não segue redirects e limita resposta inválida',async()=>{
  const mock=api([new Response(null,{status:302,headers:{location:'https://untrusted.example'}})]);
  await expect(asaasRequest(env,'/myAccount/status/',{},mock.fetcher)).rejects.toMatchObject({code:'ASAAS_ERROR'});
  expect(mock.calls).toHaveLength(1);expect(mock.calls[0].init.redirect).toBe('manual');expect(mock.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  await expect(asaasRequest(env,'/webhooks',{},api([new Response('x'.repeat(512*1024+1))]).fetcher)).rejects.toMatchObject({code:'ASAAS_INVALID_RESPONSE'});
 });
 it('oculta o corpo sensível de falhas de autenticação',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{await expect(asaasRequest(env,'/payments/private-id?customer=private',{},api([Response.json({secret:'do-not-log'},{status:401})]).fetcher)).rejects.toMatchObject({code:'ASAAS_AUTH_FAILED'});expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|do-not-log|aact/);}finally{log.mockRestore();}
 });
});
describe('ciclo do webhook local Asaas',()=>{
 it('persiste intenção antes do POST e guarda apenas metadados',async()=>{
  const saved:unknown[]=[];const mock=api([{data:[]},state]);
  await expect(ensureLocalAsaasWebhook(env,url,'test@example.com',undefined,value=>saved.push(value),mock.fetcher)).resolves.toEqual(state);
  expect(saved).toEqual([{url,name:state.name,enabled:false},state]);
  const body=JSON.parse(String(mock.calls[1].init.body));expect(body).toMatchObject({authToken:env.ASAAS_WEBHOOK_TOKEN,events:localAsaasEvents,apiVersion:3,sendType:'SEQUENTIALLY',enabled:true});
  expect(JSON.stringify(saved)).not.toMatch(/authToken|aact|example.com/);
 });
 it('reconcilia POST incerto pela intenção e atualiza sem duplicar',async()=>{
  const mock=api([{data:[state]},state]);
  await ensureLocalAsaasWebhook(env,url,'test@example.com',{url,name:state.name,enabled:false},()=>{},mock.fetcher);
  expect(mock.calls.map(call=>call.init.method??'GET')).toEqual(['GET','PUT']);
 });
 it('preserva a intenção quando o provedor não confirma o aceite',async()=>{
  const saved:unknown[]=[];const mock=api([{data:[]},new Error('timeout')]);
  await expect(ensureLocalAsaasWebhook(env,url,'test@example.com',undefined,value=>saved.push(value),mock.fetcher)).rejects.toThrow('timeout');expect(saved).toHaveLength(1);
 });
 it('não sobrescreve callback alterado por outro operador',async()=>{
  const mock=api([{data:[{...state,url:'https://another.trycloudflare.com/api/webhooks/asaas'}]}]);
  await expect(ensureLocalAsaasWebhook(env,url,'test@example.com',state,()=>{},mock.fetcher)).rejects.toThrow('outro operador');expect(mock.calls).toHaveLength(1);
 });
 it('não sobrescreve nome alterado por outro operador',async()=>{
  const mock=api([{data:[{...state,name:'Alterado pelo operador'}]}]);
  await expect(ensureLocalAsaasWebhook(env,url,'test@example.com',state,()=>{},mock.fetcher)).rejects.toThrow('outro operador');expect(mock.calls).toHaveLength(1);
 });
 it('não impede encerramento se o cadastro já foi removido',async()=>{
  await expect(disableOwnedAsaasWebhook(env,state,api([Response.json({},{status:404})]).fetcher)).resolves.toBe(false);
 });
 it('não libera fila interrompida automaticamente',async()=>{
  const mock=api([{data:[{...state,interrupted:true}]}]);
  await expect(ensureLocalAsaasWebhook(env,url,'test@example.com',state,()=>{},mock.fetcher)).rejects.toThrow('fila Asaas interrompida');expect(mock.calls).toHaveLength(1);
 });
 it('pausa somente seu próprio webhook e verifica a pausa',async()=>{
  const mock=api([state,{...state,enabled:false},{...state,enabled:false}]);
  await expect(disableOwnedAsaasWebhook(env,state,mock.fetcher)).resolves.toBe(true);
  expect(JSON.parse(String(mock.calls[1].init.body))).toEqual({enabled:false});expect(mock.calls).toHaveLength(3);
  const other=api([{...state,url:'https://other.example'}]);await expect(disableOwnedAsaasWebhook(env,state,other.fetcher)).resolves.toBe(false);expect(other.calls).toHaveLength(1);
 });
 it('recupera a intenção incerta também ao encerrar',async()=>{
  const mock=api([{data:[state]},state,{...state,enabled:false},{...state,enabled:false}]);
  await expect(disableOwnedAsaasWebhook(env,{url,name:state.name,enabled:false},mock.fetcher)).resolves.toBe(true);
  expect(mock.calls.map(call=>call.init.method??'GET')).toEqual(['GET','GET','PUT','GET']);
 });
 it.each(['https://untrusted.example/api/webhooks/asaas','https://synthetic.trycloudflare.com/admin','https://user@synthetic.trycloudflare.com/api/webhooks/asaas'])('rejeita destino público indevido %s',async target=>{
  const fetcher=vi.fn();await expect(ensureLocalAsaasWebhook(env,target,'test@example.com',undefined,()=>{},fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
});
